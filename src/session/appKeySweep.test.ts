/**
 * The revoke-before-delete half of the login-time app-key sweep: deleting a
 * stranded Resource removes the app's only listing on the Applications page, so
 * its authority must be retired first, and a revocation that does not fully
 * land leaves the Resource in place to be retried at the next login. The second
 * half is the orphan pass: a public copy with no private Resource behind it (a
 * pre-upgrade app key kept through the delete dialog's "keep public copy"
 * choice) is retracted on its own, while a copy that still has a private
 * Resource is left to that Resource's delete. The grants come from the
 * app's `connections` entry, read once for the whole sweep; a stranded key
 * predates the directory, so it normally has no entry and revokes no grant.
 * The sweep's detection rules have their own suite
 * (`tests/unit/appKeySweep.test.ts`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readConnections,
  type ConnectionGrant
} from '@interop/wallet-core/connections'
import { sweepStrandedAppKeys } from '@/session/appKeySweep'
import type { IVerifiableCredential } from '@interop/data-integrity-core'
import type { StorageManager } from '@/stores/storageManager'
import {
  SPACE_URL,
  fixtureDirectory,
  grantZcap,
  recordConsent,
  type FixtureDirectory
} from '../../tests/unit/connectionFixtures'
import { HMAC_KEY } from '../../tests/unit/memoryConnections'

const calls: string[] = []

/**
 * A marker-typed app-key credential, the shape the sweep recognizes without
 * any seed binding.
 *
 * @param options {object}
 * @param options.subject {string | undefined}   the subject DID
 * @param options.origin {string | undefined}   the claimed origin
 * @returns {IVerifiableCredential}
 */
function appKeyFixture({
  subject = 'did:key:z6MkfakeAppSubject',
  origin = 'https://app.example'
}: {
  subject?: string
  origin?: string
} = {}): IVerifiableCredential {
  return {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'AppKeyCredential'],
    issuer: subject,
    credentialSubject: {
      ...(subject !== undefined && { id: subject }),
      ...(origin !== undefined && { origin })
    }
  } as unknown as IVerifiableCredential
}

/**
 * An ordinary (non-app-key) stored credential.
 *
 * @returns {IVerifiableCredential}
 */
function plainCredential(): IVerifiableCredential {
  return {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential'],
    issuer: 'did:key:z6MkfakeIssuer',
    credentialSubject: { id: 'did:key:z6MkfakeHolder', name: 'Alice' }
  } as unknown as IVerifiableCredential
}

/**
 * A storage double whose methods record their call order, over an in-memory
 * `connections` directory.
 *
 * @param options {object}
 * @param options.credentials {Array<{ cid: string; vc: IVerifiableCredential }>}
 * @param [options.publicCopies] {Array<{ cid: string; vc: IVerifiableCredential }>}
 *   the world-readable public copies, private Resource or not
 * @param [options.directory] {FixtureDirectory}   the directory; empty when
 *   omitted
 * @returns {object}
 */
function storageDouble({
  credentials,
  publicCopies = [],
  directory = fixtureDirectory()
}: {
  credentials: Array<{ cid: string; vc: IVerifiableCredential }>
  publicCopies?: Array<{ cid: string; vc: IVerifiableCredential }>
  directory?: FixtureDirectory
}) {
  const storage = {
    listCredentials: vi.fn(async () => credentials),
    readConnectionsListing: vi.fn(async () => {
      calls.push('readConnectionsListing')
      const listing = await readConnections({
        store: directory.store,
        hmacKey: HMAC_KEY
      })
      return { listing: listing!, spaceUrl: SPACE_URL }
    }),
    listCollections: vi.fn(async () => {
      calls.push('listCollections')
      return []
    }),
    revokeCollectionRecipients: vi.fn(
      async ({
        did
      }: {
        did: string
        grants: ConnectionGrant[]
        directory?: unknown
        collections?: unknown[]
      }) => {
        calls.push(`rotate:${did}`)
        return {
          collections: 1,
          rotated: 1,
          failed: 0,
          revokedIds: [`z-rotated:${did}`]
        }
      }
    ),
    revokeConnectionGrants: vi.fn(
      async ({
        grants
      }: {
        grants: ConnectionGrant[]
        revokedByRotation?: readonly string[]
      }) => {
        calls.push(`revoke:${grants.map(grant => grant.zcapId).join(',')}`)
        return {
          revoked: grants.length,
          withdrawn: grants.length,
          skipped: 0,
          revokedIds: grants.map(grant => grant.zcapId)
        }
      }
    ),
    deleteCredential: vi.fn(async ({ cid }: { cid: string }) => {
      calls.push(`delete:${cid}`)
    }),
    listPublicCredentials: vi.fn(
      async ({ skipCids }: { skipCids?: Set<string> } = {}) =>
        publicCopies.filter(({ cid }) => !skipCids?.has(cid))
    ),
    retractPublicCopy: vi.fn(async ({ cid }: { cid: string }) => {
      calls.push(`retract:${cid}`)
    })
  }
  return storage
}

describe('sweepStrandedAppKeys', () => {
  beforeEach(() => {
    calls.length = 0
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('revokes the app authority before deleting its row', async () => {
    const storage = storageDouble({
      credentials: [{ cid: 'cid-1', vc: appKeyFixture() }]
    })

    const { deleted } = await sweepStrandedAppKeys({
      storage: storage as unknown as StorageManager
    })

    expect(deleted).toBe(1)
    // A stranded key predates the directory: it has no entry, so the
    // rotation runs over its stamped collections alone and no grant is
    // POSTed.
    expect(calls).toEqual([
      'readConnectionsListing',
      'listCollections',
      'rotate:did:key:z6MkfakeAppSubject',
      'revoke:',
      'delete:cid-1'
    ])
    expect(storage.revokeCollectionRecipients).toHaveBeenCalledWith(
      expect.objectContaining({
        did: 'did:key:z6MkfakeAppSubject',
        grants: [],
        collections: []
      })
    )
    expect(storage.revokeConnectionGrants).toHaveBeenCalledWith({
      grants: [],
      revokedByRotation: ['z-rotated:did:key:z6MkfakeAppSubject']
    })
  })

  it("revokes the grants of a stranded key's entry when one stands", async () => {
    const directory = fixtureDirectory()
    const subject = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
    await recordConsent({
      directory,
      did: subject,
      kind: 'app',
      grants: [grantZcap({ id: 'urn:zcap:one', controller: subject })],
      origin: 'https://app.example'
    })
    const storage = storageDouble({
      credentials: [{ cid: 'cid-1', vc: appKeyFixture({ subject }) }],
      directory
    })

    await sweepStrandedAppKeys({
      storage: storage as unknown as StorageManager
    })

    expect(calls).toEqual([
      'readConnectionsListing',
      'listCollections',
      `rotate:${subject}`,
      'revoke:urn:zcap:one',
      'delete:cid-1'
    ])
  })

  it('reads the directory and the collection listing once for the whole sweep', async () => {
    const storage = storageDouble({
      credentials: [
        { cid: 'cid-1', vc: appKeyFixture({ subject: 'did:key:zFirst' }) },
        { cid: 'cid-2', vc: appKeyFixture({ subject: 'did:key:zSecond' }) }
      ],
      publicCopies: [
        { cid: 'cid-orphan', vc: appKeyFixture({ subject: 'did:key:zOrphan' }) }
      ]
    })

    const { deleted, retracted } = await sweepStrandedAppKeys({
      storage: storage as unknown as StorageManager
    })

    expect(deleted).toBe(2)
    expect(retracted).toBe(1)
    expect(storage.readConnectionsListing).toHaveBeenCalledTimes(1)
    expect(storage.listCollections).toHaveBeenCalledTimes(1)
    // Both passes rotate against that one read.
    const [first] = storage.revokeCollectionRecipients.mock.calls[0]
    const [last] = storage.revokeCollectionRecipients.mock.calls[2]
    expect(last.directory).toBe(first.directory)
  })

  it('skips the delete when the grant revocation throws', async () => {
    const storage = storageDouble({
      credentials: [
        { cid: 'cid-1', vc: appKeyFixture({ subject: 'did:key:zFirst' }) },
        { cid: 'cid-2', vc: appKeyFixture({ subject: 'did:key:zSecond' }) }
      ]
    })
    storage.revokeConnectionGrants.mockImplementationOnce(async () => {
      throw new Error('server unreachable')
    })

    const { deleted } = await sweepStrandedAppKeys({
      storage: storage as unknown as StorageManager
    })

    expect(deleted).toBe(1)
    expect(calls).not.toContain('delete:cid-1')
    expect(calls).toContain('delete:cid-2')
  })

  it('skips the delete when the server refuses the grant revocation', async () => {
    // `revokeConnectionGrants` throws a plain ValidationError for a refused
    // POST rather than counting it skipped; the Resource keeps its
    // revocation handle for the next login.
    const storage = storageDouble({
      credentials: [{ cid: 'cid-1', vc: appKeyFixture() }]
    })
    storage.revokeConnectionGrants.mockImplementationOnce(async () => {
      throw Object.assign(new Error('chain does not verify'), {
        name: 'ValidationError'
      })
    })

    const { deleted } = await sweepStrandedAppKeys({
      storage: storage as unknown as StorageManager
    })

    expect(deleted).toBe(0)
    expect(calls).not.toContain('delete:cid-1')
  })

  it('skips every delete when the directory cannot be read', async () => {
    const storage = storageDouble({
      credentials: [{ cid: 'cid-1', vc: appKeyFixture() }]
    })
    storage.readConnectionsListing.mockRejectedValue(
      new Error('directory refused')
    )

    const { deleted } = await sweepStrandedAppKeys({
      storage: storage as unknown as StorageManager
    })

    expect(deleted).toBe(0)
    expect(storage.revokeCollectionRecipients).not.toHaveBeenCalled()
    expect(storage.deleteCredential).not.toHaveBeenCalled()
  })

  it('skips the delete when a collection rotation failed', async () => {
    const storage = storageDouble({
      credentials: [
        { cid: 'cid-1', vc: appKeyFixture({ subject: 'did:key:zFirst' }) },
        { cid: 'cid-2', vc: appKeyFixture({ subject: 'did:key:zSecond' }) }
      ]
    })
    storage.revokeCollectionRecipients.mockImplementationOnce(async () => {
      calls.push('rotate:did:key:zFirst')
      return { collections: 2, rotated: 1, failed: 1, revokedIds: [] }
    })

    const { deleted } = await sweepStrandedAppKeys({
      storage: storage as unknown as StorageManager
    })

    expect(deleted).toBe(1)
    // The interactive revoke's sequence: the grant stage still runs for the
    // key whose rotation failed, so every revocable grant is revoked now.
    expect(storage.revokeConnectionGrants).toHaveBeenCalledTimes(2)
    expect(calls).not.toContain('delete:cid-1')
    expect(calls).toContain('delete:cid-2')
  })

  it('deletes a row with no revocable identity directly', async () => {
    const originless = appKeyFixture()
    delete (originless.credentialSubject as { origin?: string }).origin
    const storage = storageDouble({
      credentials: [{ cid: 'cid-1', vc: originless }]
    })

    const { deleted } = await sweepStrandedAppKeys({
      storage: storage as unknown as StorageManager
    })

    expect(deleted).toBe(1)
    expect(storage.readConnectionsListing).not.toHaveBeenCalled()
    expect(storage.revokeCollectionRecipients).not.toHaveBeenCalled()
    expect(storage.revokeConnectionGrants).not.toHaveBeenCalled()
    expect(calls).toEqual(['delete:cid-1'])
  })

  it('leaves an ordinary credential untouched', async () => {
    const storage = storageDouble({
      credentials: [{ cid: 'cid-1', vc: plainCredential() }]
    })

    const { deleted } = await sweepStrandedAppKeys({
      storage: storage as unknown as StorageManager
    })

    expect(deleted).toBe(0)
    expect(calls).toEqual([])
    expect(storage.deleteCredential).not.toHaveBeenCalled()
  })

  it('retracts an orphaned public app-key copy with no private row', async () => {
    const storage = storageDouble({
      credentials: [],
      publicCopies: [{ cid: 'pub-1', vc: appKeyFixture() }]
    })

    const { deleted, retracted } = await sweepStrandedAppKeys({
      storage: storage as unknown as StorageManager
    })

    expect(deleted).toBe(0)
    expect(retracted).toBe(1)
    expect(calls).toEqual([
      'readConnectionsListing',
      'listCollections',
      'rotate:did:key:z6MkfakeAppSubject',
      'revoke:',
      'retract:pub-1'
    ])
  })

  it('leaves a public copy that has a private row to the row delete', async () => {
    const appKey = appKeyFixture()
    const storage = storageDouble({
      credentials: [{ cid: 'cid-1', vc: appKey }],
      publicCopies: [{ cid: 'cid-1', vc: appKey }]
    })

    const { deleted, retracted } = await sweepStrandedAppKeys({
      storage: storage as unknown as StorageManager
    })

    expect(deleted).toBe(1)
    expect(retracted).toBe(0)
    expect(calls).toContain('delete:cid-1')
    expect(calls).not.toContain('retract:cid-1')
    expect(storage.listPublicCredentials).toHaveBeenCalledWith({
      skipCids: new Set(['cid-1'])
    })
  })

  it('leaves an ordinary public credential alone', async () => {
    const storage = storageDouble({
      credentials: [],
      publicCopies: [{ cid: 'pub-1', vc: plainCredential() }]
    })

    const { retracted } = await sweepStrandedAppKeys({
      storage: storage as unknown as StorageManager
    })

    expect(retracted).toBe(0)
    expect(storage.retractPublicCopy).not.toHaveBeenCalled()
  })

  it('completes the private pass when the public listing fails', async () => {
    const storage = storageDouble({
      credentials: [{ cid: 'cid-1', vc: appKeyFixture() }]
    })
    storage.listPublicCredentials.mockImplementationOnce(async () => {
      throw new Error('collection unreachable')
    })

    const { deleted, retracted } = await sweepStrandedAppKeys({
      storage: storage as unknown as StorageManager
    })

    expect(deleted).toBe(1)
    expect(retracted).toBe(0)
    expect(calls).toContain('delete:cid-1')
    expect(console.warn).toHaveBeenCalled()
  })
})
