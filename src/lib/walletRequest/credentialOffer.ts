/**
 * Issuance-only links, separate from the capability-grant interaction route.
 * The exchange origin is the authentication audience, never an attested
 * browser origin. No credential or storage permission is sent to the issuer.
 */
import type { IVerifiableCredential } from '@interop/data-integrity-core'
import {
  beginExchange,
  credentialsOf,
  presentationEndpointFor,
  type FetchLike,
  type IVPRDetails as SpecRequest
} from '@interop/wallet-request'
import type { Session } from '@/types/auth'
import type { IVPRDetails } from './types'
import { queriesOf } from './classify'
import { checkStoreDIDAuthRequest } from './storeRequest'
import { composeVP, didAuthHolderPresentable } from './composeVP'
import { negotiateCryptosuite } from './presentationSuite'

/**
 * Only HTTPS is usable remotely. HTTP loopback is confined to development.
 * Credentials and fragments in an exchange URL are never accepted.
 */
export function safeExchangeUrl(raw: string): string {
  const url = new URL(raw)
  const loopback =
    import.meta.env.DEV &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error('Invalid exchange URL')
  }
  url.searchParams.delete('iuv')
  return url.href
}

/**
 * Accepts a protocols JSON object, an exchange URL, or an LCW/wallet link.
 * URLSearchParams decodes exactly once; nested wrappers are bounded.
 */
export function credentialOfferUrl(raw: string, depth = 0): string {
  if (depth > 3 || raw.length > 16384) {
    throw new Error('Invalid credential offer')
  }
  const text = raw.trim()
  if (text.startsWith('{')) {
    const value = JSON.parse(text)
    if (typeof value?.protocols?.vcapi !== 'string') {
      throw new Error('Missing VC API exchange')
    }
    return safeExchangeUrl(value.protocols.vcapi)
  }
  const url = new URL(text)
  // Validate the wrapper too, before considering any nested request.
  safeExchangeUrl(url.origin + url.pathname + url.search)
  const params = url.hash.startsWith('#/request?')
    ? new URLSearchParams(url.hash.slice('#/request?'.length))
    : url.searchParams
  const nested = params.get('request')
  if (nested !== null) {
    return credentialOfferUrl(nested, depth + 1)
  }
  return safeExchangeUrl(text)
}

/**
 * Recognizes explicit offers without turning ordinary credential URLs or
 * the existing agent interaction grammar into issuance POSTs.
 */
export function isCredentialOfferInput(text: string): boolean {
  try {
    const value = JSON.parse(text)
    return !!value?.protocols?.vcapi
  } catch {
    try {
      const url = new URL(text)
      return (
        url.searchParams.has('request') ||
        url.hash.startsWith('#/request?') ||
        /\/exchanges\/[^/]+\/?$/.test(url.pathname)
      )
    } catch {
      return false
    }
  }
}

export function credentialOfferPath(raw: string): string {
  return `/request?${new URLSearchParams({ request: raw })}`
}

/**
 * Do not forward a holder proof through redirects or a third-party proxy.
 * The browser enforces CORS; a stalled exchange has a bounded lifetime.
 */
const exchangeFetch: FetchLike = (input, init) =>
  fetch(input, {
    ...init,
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(30000)
  })

export function checkCredentialOffer({
  request,
  exchangeUrl
}: {
  request: IVPRDetails
  exchangeUrl: string
}): void {
  const queries = queriesOf(request)
  if (
    queries.length !== 1 ||
    queries[0].type !== 'DIDAuthentication' ||
    typeof request.challenge !== 'string' ||
    !request.challenge.trim()
  ) {
    throw new Error('Only a challenged DID Authentication request is accepted')
  }
  checkStoreDIDAuthRequest({
    request,
    exchangeUrl,
    origin: new URL(exchangeUrl).origin
  })
  safeExchangeUrl(
    presentationEndpointFor({ request: request as SpecRequest, exchangeUrl })
  )
}

export async function openCredentialOffer(exchangeUrl: string) {
  const opening = await beginExchange({ exchangeUrl, fetch: exchangeFetch })
  const request = opening.verifiablePresentationRequest
  if (!request || opening.verifiablePresentation) {
    throw new Error('Expected a holder-binding request')
  }
  checkCredentialOffer({ request, exchangeUrl })
  return request as IVPRDetails
}

/**
 * The issuer refused the exchange with 404 (or 410). Certo answers the same
 * way for an expired offer, a used one and a wallet the holder refused, on
 * purpose, so the wallet cannot tell them apart either.
 */
export class ExchangeUnavailableError extends Error {
  constructor(status: number) {
    super(`The exchange is unavailable (HTTP ${status}).`)
    this.name = 'ExchangeUnavailableError'
  }
}

/**
 * The issuer rate-limited the exchange (HTTP 429).
 */
export class ExchangeRateLimitedError extends Error {
  constructor() {
    super('The exchange rate-limited this wallet (HTTP 429).')
    this.name = 'ExchangeRateLimitedError'
  }
}

/**
 * The holder did not confirm the new wallet within the waiting budget.
 */
export class WalletApprovalTimeoutError extends Error {
  constructor() {
    super('The new wallet was not confirmed in time.')
    this.name = 'WalletApprovalTimeoutError'
  }
}

/**
 * What one delivery of the holder proof produced: the issued credentials, or
 * a pending state while the holder confirms this wallet in the issuer's
 * portal (HTTP 202 with `status: 'pending-approval'`).
 */
export type HolderProofOutcome =
  { kind: 'issued'; credentials: IVerifiableCredential[] } | { kind: 'pending' }

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (!text) {
    return {}
  }
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new Error('The exchange returned malformed JSON.', { cause: err })
  }
}

/**
 * POSTs the signed holder proof to the exchange's delivery endpoint once.
 * The same presentation may be sent again while the answer is pending: the
 * offer keeps its challenge until it is used or expires.
 *
 * @param options {object}
 * @param options.request {IVPRDetails}
 * @param options.exchangeUrl {string}
 * @param options.verifiablePresentation {object}
 * @param [options.fetch] {FetchLike}
 * @returns {Promise<HolderProofOutcome>}
 */
export async function submitHolderProof({
  request,
  exchangeUrl,
  verifiablePresentation,
  fetch = exchangeFetch
}: {
  request: IVPRDetails
  exchangeUrl: string
  verifiablePresentation: unknown
  fetch?: FetchLike
}): Promise<HolderProofOutcome> {
  const endpoint = safeExchangeUrl(
    presentationEndpointFor({ request: request as SpecRequest, exchangeUrl })
  )
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ verifiablePresentation })
  })
  if (response.status === 404 || response.status === 410) {
    throw new ExchangeUnavailableError(response.status)
  }
  if (response.status === 429) {
    throw new ExchangeRateLimitedError()
  }
  if (!response.ok) {
    throw new Error(`The exchange answered HTTP ${response.status}.`)
  }
  const reply = await readJson(response)
  if (response.status === 202) {
    if (reply.status === 'pending-approval') {
      return { kind: 'pending' }
    }
    throw new Error('The exchange accepted the proof without an answer.')
  }
  if (reply.verifiablePresentationRequest) {
    throw new Error('Multi-step exchanges are not supported.')
  }
  const offered = reply.verifiablePresentation as
    Parameters<typeof credentialsOf>[0] | undefined
  const credentials = offered ? credentialsOf(offered) : []
  if (!credentials.length) {
    throw new Error('No credentials received')
  }
  return { kind: 'issued', credentials }
}

/**
 * Signs the holder proof for the offer and delivers it once.
 *
 * @param options {object}
 * @param options.request {IVPRDetails}
 * @param options.exchangeUrl {string}
 * @param options.session {Session}
 * @returns {Promise<{ verifiablePresentation: object, outcome: HolderProofOutcome }>}
 */
export async function claimCredentialOffer({
  request,
  exchangeUrl,
  session
}: {
  request: IVPRDetails
  exchangeUrl: string
  session: Session
}) {
  checkCredentialOffer({ request, exchangeUrl })
  const queries = queriesOf(request)
  if (!didAuthHolderPresentable({ session, queries, appConnect: false })) {
    throw new Error('Unsupported holder method')
  }
  const verifiablePresentation = await composeVP({
    session,
    queries,
    didAuthRequested: true,
    challenge: request.challenge,
    domain: request.domain,
    cryptosuite: negotiateCryptosuite(queries)
  })
  const outcome = await submitHolderProof({
    request,
    exchangeUrl,
    verifiablePresentation
  })
  return { verifiablePresentation, outcome }
}

/**
 * The issuer rate-limits its exchange endpoints per address and across
 * offers, so the wait for a new wallet's confirmation polls sparingly: every
 * 10 s, 30 s after a 429, for at most 4 minutes.
 */
export const APPROVAL_POLL = {
  intervalMs: 10_000,
  rateLimitedMs: 30_000,
  budgetMs: 4 * 60_000
}

/**
 * Re-delivers the holder proof until the holder confirms the new wallet and
 * the issuer answers with the credentials. `wait` may resolve early (the
 * holder's "retry now"); a 404 ends the wait at once, and a 429 lengthens the
 * next pause. Throws {@link WalletApprovalTimeoutError} once the budget is
 * spent.
 *
 * @param options {object}
 * @param options.submit {() => Promise<HolderProofOutcome>}   one delivery
 * @param options.wait {(ms: number) => Promise<void>}   the pause between tries
 * @param [options.signal] {AbortSignal}   stops the wait (the page left)
 * @param [options.now] {() => number}
 * @param [options.intervalMs] {number}
 * @param [options.rateLimitedMs] {number}
 * @param [options.budgetMs] {number}
 * @returns {Promise<IVerifiableCredential[]>}
 */
export async function awaitWalletApproval({
  submit,
  wait,
  signal,
  now = Date.now,
  intervalMs = APPROVAL_POLL.intervalMs,
  rateLimitedMs = APPROVAL_POLL.rateLimitedMs,
  budgetMs = APPROVAL_POLL.budgetMs
}: {
  submit: () => Promise<HolderProofOutcome>
  wait: (ms: number) => Promise<void>
  signal?: AbortSignal
  now?: () => number
  intervalMs?: number
  rateLimitedMs?: number
  budgetMs?: number
}): Promise<IVerifiableCredential[]> {
  const deadline = now() + budgetMs
  let delay = intervalMs
  for (;;) {
    const remaining = deadline - now()
    if (remaining <= 0) {
      throw new WalletApprovalTimeoutError()
    }
    await wait(Math.min(delay, remaining))
    signal?.throwIfAborted()
    let outcome: HolderProofOutcome
    try {
      outcome = await submit()
    } catch (err) {
      if (err instanceof ExchangeRateLimitedError) {
        delay = rateLimitedMs
        continue
      }
      throw err
    }
    signal?.throwIfAborted()
    if (outcome.kind === 'issued') {
      return outcome.credentials
    }
    delay = intervalMs
  }
}
