import { describe, expect, it } from 'vitest'
import {
  credentialOfferUrl,
  isCredentialOfferInput,
  checkCredentialOffer
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
