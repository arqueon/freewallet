import { describe, expect, it } from 'vitest'
import {
  credentialOfferUrl,
  isCredentialOfferInput,
  checkCredentialOffer,
  submitHolderProof,
  awaitWalletApproval,
  ExchangeUnavailableError,
  ExchangeRateLimitedError,
  WalletApprovalTimeoutError,
  type HolderProofOutcome
} from './credentialOffer'
import type { IVPRDetails } from './types'

const exchangeUrl =
  'https://microcredenciales.arqueonautis.org/api/exchanges/once'
const request: IVPRDetails = {
  query: [{ type: 'DIDAuthentication', acceptedMethods: [{ method: 'key' }] }],
  challenge: 'one-use-challenge',
  domain: 'microcredenciales.arqueonautis.org'
}

describe('credential issuance input', () => {
  it.each([
    exchangeUrl,
    `${exchangeUrl}?iuv=1`,
    JSON.stringify({ protocols: { vcapi: exchangeUrl } }),
    `https://lcw.app/request.html?request=${encodeURIComponent(JSON.stringify({ protocols: { vcapi: exchangeUrl } }))}`,
    `https://wallet.example/#/request?request=${encodeURIComponent(exchangeUrl)}`
  ])('normalizes an offer without fetching: %s', raw => {
    expect(isCredentialOfferInput(raw)).toBe(true)
    expect(credentialOfferUrl(raw)).toBe(exchangeUrl)
  })
  it.each([
    'javascript:alert(1)',
    'http://issuer.example/exchanges/a',
    'https://user:pass@example.com/a',
    'https://issuer.example/a#token',
    '{"protocols":{"vcapi":3}}'
  ])('rejects unsafe input: %s', raw => {
    expect(() => credentialOfferUrl(raw)).toThrow()
  })
  it('preserves ordinary credential URLs and agent interaction URLs', () => {
    expect(isCredentialOfferInput('https://example.org/credential.json')).toBe(
      false
    )
    expect(
      isCredentialOfferInput('interaction:https://agent.example/offer')
    ).toBe(false)
    expect(isCredentialOfferInput('https://agent.example/grant?iuv=1')).toBe(
      false
    )
  })
  it('accepts Certo DID authentication with an origin-bound domain', () => {
    expect(() => checkCredentialOffer({ request, exchangeUrl })).not.toThrow()
  })
  it.each([
    { domain: 'third-party.example' },
    { domain: undefined },
    { challenge: undefined },
    { challenge: '' },
    { query: [{ type: 'QueryByExample' }] },
    {
      query: [
        { type: 'DIDAuthentication' },
        { type: 'AuthorizationCapabilityQuery' }
      ]
    },
    {
      interact: {
        service: [
          {
            type: 'UnmediatedHttpPresentationService2021',
            serviceEndpoint: 'https://attacker.example/collect'
          }
        ]
      }
    },
    {
      interact: {
        service: [
          {
            type: 'UnmediatedHttpPresentationService2021',
            serviceEndpoint: `${exchangeUrl}#fragment`
          }
        ]
      }
    }
  ])('refuses malformed or relayed requests: %j', change => {
    expect(() =>
      checkCredentialOffer({
        request: { ...request, ...change } as IVPRDetails,
        exchangeUrl
      })
    ).toThrow()
  })
})

describe('holder proof delivery', () => {
  const vc = {
    '@context': ['https://www.w3.org/ns/credentials/v2'],
    type: ['VerifiableCredential'],
    issuer: 'did:example:issuer',
    credentialSubject: { id: 'did:key:holder' }
  }
  function answering(status: number, body: unknown) {
    const calls: Array<{ url: string; body: unknown }> = []
    const fetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response(body === undefined ? '' : JSON.stringify(body), {
        status
      })
    }
    return { calls, fetch }
  }
  const deliver = (fetch: ReturnType<typeof answering>['fetch']) =>
    submitHolderProof({
      request,
      exchangeUrl,
      verifiablePresentation: { holder: 'did:key:holder' },
      fetch
    })

  it('returns the issued credentials on 200', async () => {
    const server = answering(200, {
      verifiablePresentation: { verifiableCredential: [vc] }
    })
    await expect(deliver(server.fetch)).resolves.toEqual({
      kind: 'issued',
      credentials: [vc]
    })
    expect(server.calls).toEqual([
      {
        url: exchangeUrl,
        body: { verifiablePresentation: { holder: 'did:key:holder' } }
      }
    ])
  })

  it('reads 202 pending-approval as a pending outcome', async () => {
    const server = answering(202, {
      status: 'pending-approval',
      message: 'Confirm this new wallet'
    })
    await expect(deliver(server.fetch)).resolves.toEqual({ kind: 'pending' })
  })

  it('refuses any other 202', async () => {
    await expect(deliver(answering(202, {}).fetch)).rejects.toThrow()
  })

  it.each([404, 410])('reports %i as an unavailable exchange', async status => {
    await expect(
      deliver(answering(status, { error: { status } }).fetch)
    ).rejects.toBeInstanceOf(ExchangeUnavailableError)
  })

  it('reports 429 as rate limiting', async () => {
    await expect(
      deliver(answering(429, undefined).fetch)
    ).rejects.toBeInstanceOf(ExchangeRateLimitedError)
  })
})

describe('waiting for a new wallet to be confirmed', () => {
  function clock() {
    let time = 0
    const waits: number[] = []
    return {
      now: () => time,
      waits,
      wait: async (ms: number) => {
        waits.push(ms)
        time += ms
      }
    }
  }
  const pending: HolderProofOutcome = { kind: 'pending' }
  const issued: HolderProofOutcome = { kind: 'issued', credentials: [] }

  it('polls every 10 s until the credential arrives', async () => {
    const time = clock()
    const answers = [pending, pending, issued]
    await expect(
      awaitWalletApproval({ ...time, submit: async () => answers.shift()! })
    ).resolves.toEqual([])
    expect(time.waits).toEqual([10_000, 10_000, 10_000])
  })

  it('waits 30 s after a 429 and keeps the 4-minute budget', async () => {
    const time = clock()
    let calls = 0
    const submit = async () => {
      calls++
      if (calls === 1) {
        throw new ExchangeRateLimitedError()
      }
      return pending
    }
    await expect(
      awaitWalletApproval({ ...time, submit })
    ).rejects.toBeInstanceOf(WalletApprovalTimeoutError)
    expect(time.waits[0]).toBe(10_000)
    expect(time.waits[1]).toBe(30_000)
    expect(time.waits.slice(2).every(ms => ms <= 10_000)).toBe(true)
    expect(time.now()).toBe(240_000)
    // At most one try per pause: 24 or fewer deliveries in 4 minutes.
    expect(calls).toBe(time.waits.length)
    expect(calls).toBeLessThanOrEqual(24)
  })

  it('stops at once on a 404', async () => {
    const time = clock()
    await expect(
      awaitWalletApproval({
        ...time,
        submit: async () => {
          throw new ExchangeUnavailableError(404)
        }
      })
    ).rejects.toBeInstanceOf(ExchangeUnavailableError)
    expect(time.waits).toEqual([10_000])
  })
})
