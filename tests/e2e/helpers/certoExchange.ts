import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { gzipSync } from 'node:zlib'
import { CapabilityAgent } from '@interop/capability-agent'
import { DataIntegrityProof } from '@interop/data-integrity-proof'
import { eddsaRdfc2022 } from '@interop/ed25519-signature/eddsa-rdfc-2022'
import { issue, verify } from '@interop/vc'
import { documentLoader } from '@interop/wallet-request'
import richCredential from '../../fixtures/udg-ob3.json' with { type: 'json' }

/**
 * Local one-use Certo-shaped exchange. Real EdDSA signatures on the holder
 * proof, OB3 credential and Bitstring Status List; no production service.
 */
export async function startCertoExchange({
  rich = false,
  newWallet = false
}: {
  rich?: boolean
  /**
   * Answer the holder proof with 202 pending-approval until `approve()`
   * (Certo's new-wallet confirmation), or 404 after `refuse()`.
   */
  newWallet?: boolean
} = {}) {
  let approval: 'pending' | 'approved' | 'refused' = newWallet
    ? 'pending'
    : 'approved'
  const issuer = await CapabilityAgent.fromSecret({
    secret: new Uint8Array(32).fill(42),
    handle: 'certo-test'
  })
  let used = false
  let posts = 0
  let holder = ''
  let verifiedHolder = false
  let base = ''
  const challenge = 'certo-one-use-test-challenge'
  const server: Server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5273')
    res.setHeader('Access-Control-Allow-Headers', 'content-type')
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    res.setHeader('Content-Type', 'application/json')
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }
    if (req.url === '/status/1') {
      res.end(JSON.stringify(statusCredential))
      return
    }
    if (req.url === '/logo.svg') {
      res.setHeader('Content-Type', 'image/svg+xml')
      res.end(
        await readFile(
          new URL('../../../public/udg-placeholder.svg', import.meta.url)
        )
      )
      return
    }
    if (req.url === '/badge.svg') {
      res.setHeader('Content-Type', 'image/svg+xml')
      res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#00427B"/><text x="50" y="58" text-anchor="middle" font-size="24" fill="white">OB3</text></svg>'
      )
      return
    }
    if (req.url?.endsWith('?iuv=1')) {
      res.end(
        JSON.stringify({ protocols: { vcapi: `${base}/api/exchanges/once` } })
      )
      return
    }
    if (req.method !== 'POST' || req.url !== '/api/exchanges/once') {
      res.writeHead(404).end('{}')
      return
    }
    if (used) {
      res.writeHead(410).end('{}')
      return
    }
    posts++
    try {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk))
      }
      const body = JSON.parse(Buffer.concat(chunks).toString())
      const presentation = body.verifiablePresentation
      if (!presentation) {
        res.end(
          JSON.stringify({
            verifiablePresentationRequest: {
              query: [
                {
                  type: 'DIDAuthentication',
                  acceptedMethods: [{ method: 'key' }, { method: 'web' }],
                  acceptedCryptosuites: [{ cryptosuite: 'eddsa-rdfc-2022' }]
                }
              ],
              challenge,
              domain: base
            }
          })
        )
        return
      }
      const result = await verify({
        presentation,
        challenge,
        domain: base,
        suite: new DataIntegrityProof({ cryptosuite: eddsaRdfc2022 }),
        documentLoader
      })
      if (
        !result.verified ||
        !presentation.holder?.startsWith('did:key:') ||
        presentation.verifiableCredential?.length
      ) {
        res
          .writeHead(400)
          .end(JSON.stringify({ error: 'Holder proof refused' }))
        return
      }
      holder = presentation.holder
      verifiedHolder = true
      if (approval === 'refused') {
        res.writeHead(404).end(
          JSON.stringify({
            error: { status: 404, message: 'Exchange unavailable' }
          })
        )
        return
      }
      if (approval === 'pending') {
        res.writeHead(202).end(
          JSON.stringify({
            status: 'pending-approval',
            message: 'Confirm this new wallet in the microcredentials portal.'
          })
        )
        return
      }
      const credential = await issue({
        credential: {
          ...(rich
            ? {
                ...richCredential,
                issuer: {
                  ...richCredential.issuer,
                  id: issuer.id,
                  image: { id: `${base}/logo.svg`, type: 'Image' }
                },
                credentialSubject: {
                  ...richCredential.credentialSubject,
                  id: holder,
                  achievement: {
                    ...richCredential.credentialSubject.achievement,
                    image: { id: `${base}/badge.svg`, type: 'Image' }
                  }
                }
              }
            : {
                '@context': [
                  'https://www.w3.org/ns/credentials/v2',
                  'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
                ],
                id: 'urn:uuid:f289238a-5df1-4c60-a23b-d553a81e9a6c',
                type: ['VerifiableCredential', 'OpenBadgeCredential'],
                name: 'Microcredencial de prueba Certo',
                issuer: {
                  id: issuer.id,
                  type: 'Profile',
                  name: 'Universidad de Guadalajara'
                },
                validFrom: '2025-01-01T00:00:00Z',
                validUntil: '2035-01-01T00:00:00Z',
                credentialStatus: {
                  id: `${base}/status/1#0`,
                  type: 'BitstringStatusListEntry',
                  statusPurpose: 'revocation',
                  statusListIndex: '0',
                  statusListCredential: `${base}/status/1`
                },
                credentialSubject: {
                  id: holder,
                  type: 'AchievementSubject',
                  achievement: {
                    id: 'urn:udg:test:achievement',
                    type: 'Achievement',
                    name: 'Microcredencial de prueba Certo',
                    description:
                      'Credencial ficticia para comprobar el reclamo local.',
                    image: { id: `${base}/badge.svg`, type: 'Image' },
                    criteria: {
                      narrative:
                        'Identifica fuentes y justifica tus decisiones.'
                    },
                    resultDescription: [
                      {
                        id: 'urn:udg:test:criterion1',
                        type: 'ResultDescription',
                        name: 'Evaluación de fuentes',
                        resultType: 'Percent',
                        requiredValue: '80'
                      }
                    ]
                  },
                  result: [
                    {
                      type: 'Result',
                      resultDescription: 'urn:udg:test:criterion1',
                      value: '95',
                      status: 'Achieved'
                    }
                  ]
                }
              })
        },
        suite: new DataIntegrityProof({
          signer: issuer.getSigner(),
          cryptosuite: eddsaRdfc2022
        }),
        documentLoader
      })
      used = true
      res.end(
        JSON.stringify({
          verifiablePresentation: {
            '@context': ['https://www.w3.org/ns/credentials/v2'],
            type: ['VerifiablePresentation'],
            verifiableCredential: [credential]
          }
        })
      )
    } catch (err) {
      res.writeHead(500).end(JSON.stringify({ error: String(err) }))
    }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  base = `http://127.0.0.1:${address.port}`
  const statusCredential = await issue({
    credential: {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      id: `${base}/status/1`,
      type: ['VerifiableCredential', 'BitstringStatusListCredential'],
      issuer: issuer.id,
      validFrom: '2025-01-01T00:00:00Z',
      credentialSubject: {
        id: `${base}/status/1#list`,
        type: 'BitstringStatusList',
        statusPurpose: 'revocation',
        encodedList: `u${gzipSync(Buffer.alloc(16384)).toString('base64url')}`
      }
    },
    suite: new DataIntegrityProof({
      signer: issuer.getSigner(),
      cryptosuite: eddsaRdfc2022
    }),
    documentLoader
  })
  return {
    exchangeUrl: `${base}/api/exchanges/once`,
    state: () => ({ posts, holder, verifiedHolder, used }),
    approve: () => {
      approval = 'approved'
    },
    refuse: () => {
      approval = 'refused'
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close(err => (err ? reject(err) : resolve()))
      )
  }
}
