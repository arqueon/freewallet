/**
 * Issuance-only links, separate from the capability-grant interaction route.
 * The exchange origin is the authentication audience, never an attested
 * browser origin. No credential or storage permission is sent to the issuer.
 */
import {
  beginExchange,
  collectIssuedPresentation,
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
  const offered = await collectIssuedPresentation({
    request: request as SpecRequest,
    exchangeUrl,
    verifiablePresentation,
    fetch: exchangeFetch
  })
  const credentials = credentialsOf(offered)
  if (!credentials.length) {
    throw new Error('No credentials received')
  }
  return credentials
}
