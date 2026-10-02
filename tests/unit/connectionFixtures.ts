/**
 * Fixtures for the tests that read the `connections` directory through
 * `src/lib/connectedApps.ts`: capabilities shaped the way a consent records
 * them, entries written through wallet-core's own upsert helpers over the
 * in-memory store, the one listing read every reader resolves against, and a
 * `StorageManager` double whose directory methods run over that store.
 */
import { vi } from 'vitest'
import {
  readConnections,
  recordGrants,
  retireConnection,
  type ConnectionGrant,
  type ConnectionKind,
  type GrantKind,
  type ReadConnection
} from '@interop/wallet-core/connections'
import type { StorageManager } from '@/stores/storageManager'
import { HMAC_KEY, memoryConnectionsStore } from './memoryConnections'

/**
 * The Space every fixture capability targets, as its container URL.
 */
export const SPACE_URL = 'https://was.example/space/s/'

/**
 * A time well past every fixture's clock.
 */
export const FUTURE = '2099-01-01T00:00:00.000Z'

/**
 * A time well before every fixture's clock.
 */
export const PAST = '2000-01-01T00:00:00.000Z'

/**
 * Real Ed25519 did:keys, so a grant's controller derives a recipient kid.
 */
export const AGENT_DID =
  'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
export const OTHER_AGENT_DID =
  'did:key:z6MkjchhfUsD6mmvni8mCdXHw216Xrm9bQe2mBH1P5RDjVJG'
export const APP_DID =
  'did:key:z6MkqojacRDqmQgDi4ESKKhGDqnZx4C6cChAbQZXvnUFX7D7'
export const OTHER_APP_DID =
  'did:key:z6MkqEPctyQs9MofPZCw2XdeFi2dTMoMqHKhfoWsfitrnprw'
export const CLIENT_DID =
  'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH'

/**
 * The verification method that signed every fixture delegation.
 */
export const WALLET_SIGNER = 'did:webvh:scid:was.example:space:s#z6MkWallet'

/**
 * A delegated capability as a consent records it on an entry.
 *
 * @param options {object}
 * @param options.id {string}
 * @param options.controller {string}   the grantee DID
 * @param [options.collection] {string}   the targeted collection id
 * @param [options.expires] {string}
 * @param [options.allowedAction] {string[]}
 * @returns {object}
 */
export function grantZcap({
  id,
  controller,
  collection = 'notes',
  expires = FUTURE,
  allowedAction = ['GET']
}: {
  id: string
  controller: string
  collection?: string
  expires?: string
  allowedAction?: string[]
}): Record<string, unknown> {
  return {
    '@context': ['https://w3id.org/zcap/v1'],
    id,
    controller,
    parentCapability: `urn:zcap:root:${encodeURIComponent(SPACE_URL)}`,
    invocationTarget: `${SPACE_URL}${collection}/`,
    allowedAction,
    expires,
    proof: {
      type: 'Ed25519Signature2020',
      proofPurpose: 'capabilityDelegation',
      verificationMethod: WALLET_SIGNER,
      capabilityChain: [`urn:zcap:root:${encodeURIComponent(SPACE_URL)}`]
    }
  }
}

/**
 * An in-memory directory whose store's `get` and `list` are spies, so a test
 * can tell a listing read from a GET at a derived id.
 *
 * @returns {object}   the store, its rows, its writes, and the two spies
 */
export function fixtureDirectory() {
  const directory = memoryConnectionsStore()
  const get = vi.spyOn(directory.store, 'get')
  const list = vi.spyOn(directory.store, 'list')
  return { ...directory, get, list }
}

/**
 * One fixture directory.
 */
export type FixtureDirectory = ReturnType<typeof fixtureDirectory>

/**
 * Records a consent on a party's entry, through wallet-core's own
 * `recordGrants`, at a fixed time.
 *
 * @param options {object}
 * @param options.directory {FixtureDirectory}
 * @param options.did {string}
 * @param options.kind {ConnectionKind}
 * @param [options.grants] {Array<object>}   the capabilities, each recorded
 *   as `grantKind`
 * @param [options.grantKind] {GrantKind}
 * @param [options.name] {string}
 * @param [options.origin] {string}
 * @param [options.url] {string}
 * @param [options.appKey] {string}
 * @param [options.at] {string}   the consent's ISO time
 * @returns {Promise<void>}
 */
export async function recordConsent({
  directory,
  did,
  kind,
  grants = [],
  grantKind = 'grant',
  name,
  origin,
  url,
  appKey,
  at = '2026-08-01T00:00:00.000Z'
}: {
  directory: FixtureDirectory
  did: string
  kind: ConnectionKind
  grants?: Array<Record<string, unknown>>
  grantKind?: GrantKind
  name?: string
  origin?: string
  url?: string
  appKey?: string
  at?: string
}): Promise<void> {
  await recordGrants({
    store: directory.store,
    hmacKey: HMAC_KEY,
    did,
    kind,
    spaceUrl: SPACE_URL,
    grants: grants.map(zcap => ({ zcap, grantKind })),
    ...(name !== undefined && { name }),
    ...(origin !== undefined && { origin }),
    ...(url !== undefined && { url }),
    ...(appKey !== undefined && { appKey }),
    now: new Date(at)
  })
}

/**
 * Retires a party's entry, through wallet-core's own `retireConnection`,
 * handling every grant it carries.
 *
 * @param options {object}
 * @param options.directory {FixtureDirectory}
 * @param options.did {string}
 * @param options.zcapIds {string[]}   the grants the retirement handled
 * @returns {Promise<void>}
 */
export async function retireParty({
  directory,
  did,
  zcapIds
}: {
  directory: FixtureDirectory
  did: string
  zcapIds: string[]
}): Promise<void> {
  await retireConnection({
    store: directory.store,
    hmacKey: HMAC_KEY,
    did,
    handledZcapIds: zcapIds,
    spaceUrl: SPACE_URL
  })
}

/**
 * The directory's entries, from one listing read.
 *
 * @param directory {FixtureDirectory}
 * @returns {Promise<ReadConnection[]>}
 */
export async function listedConnections(
  directory: FixtureDirectory
): Promise<ReadConnection[]> {
  const listing = await readConnections({
    store: directory.store,
    hmacKey: HMAC_KEY
  })
  return listing!.entries
}

/**
 * The parsed entry whose `id` is the DID, from one listing read.
 *
 * @param options {object}
 * @param options.directory {FixtureDirectory}
 * @param options.did {string}
 * @returns {Promise<ReadConnection['entry'] | undefined>}
 */
export async function entryOf({
  directory,
  did
}: {
  directory: FixtureDirectory
  did: string
}): Promise<ReadConnection['entry'] | undefined> {
  const connections = await listedConnections(directory)
  return connections.find(({ entry }) => entry.id === did)?.entry
}

/**
 * A `StorageManager` double over a fixture directory: the listing read and
 * the retirement run wallet-core's own reader and writer over the in-memory
 * store, and the server-side stages are spies that report every grant they
 * are handed as revoked on this call. The rotation reports one collection
 * re-keyed.
 *
 * @param options {object}
 * @param options.directory {FixtureDirectory}
 * @param [options.rosterCollections] {string[] | Error}   what the roster
 *   read reports for each grantee: the collections still listing it, or one
 *   failed read
 * @returns {object}   the double, typed as its spies
 */
export function directoryStorage({
  directory,
  rosterCollections = []
}: {
  directory: FixtureDirectory
  rosterCollections?: string[] | Error
}) {
  const calls: string[] = []
  const storage = {
    calls,
    spaceUrl: SPACE_URL,
    readConnectionsListing: vi.fn(async () => {
      calls.push('readConnectionsListing')
      const listing = await readConnections({
        store: directory.store,
        hmacKey: HMAC_KEY
      })
      return { listing: listing!, spaceUrl: SPACE_URL }
    }),
    revokeCollectionRecipients: vi.fn(
      async (_options: { did: string; grants: ConnectionGrant[] }) => {
        calls.push('revokeCollectionRecipients')
        return { collections: 1, rotated: 1, failed: 0, revokedIds: [] }
      }
    ),
    revokeConnectionGrants: vi.fn(
      async ({
        grants
      }: {
        grants: ConnectionGrant[]
        revokedByRotation?: readonly string[]
      }) => {
        calls.push('revokeConnectionGrants')
        return {
          revoked: grants.length,
          withdrawn: grants.length,
          skipped: 0,
          revokedIds: grants.map(grant => grant.zcapId)
        }
      }
    ),
    deleteAppKeyResource: vi.fn(
      async (_options: {
        appKey: string
        did: string
      }): Promise<'deleted' | 'absent' | 'foreign'> => {
        calls.push('deleteAppKeyResource')
        return 'deleted'
      }
    ),
    retireConnectionEntry: vi.fn(
      async ({
        did,
        handledZcapIds
      }: {
        did: string
        handledZcapIds: Iterable<string>
      }) => {
        calls.push('retireConnectionEntry')
        await retireConnection({
          store: directory.store,
          hmacKey: HMAC_KEY,
          did,
          handledZcapIds,
          spaceUrl: SPACE_URL
        })
      }
    ),
    addHistoryAppRevoke: vi.fn(async () => {
      calls.push('addHistoryAppRevoke')
    }),
    addHistoryAgentRevoke: vi.fn(async () => {
      calls.push('addHistoryAgentRevoke')
    }),
    granteeRosterCollections: vi.fn(
      async ({ grantees }: { grantees: Array<{ controller: string }> }) =>
        grantees.map(({ controller }) =>
          rosterCollections instanceof Error
            ? { controller, collectionIds: [], failed: 1 }
            : { controller, collectionIds: rosterCollections, failed: 0 }
        )
    )
  }
  return storage
}

/**
 * The double, as the code under test takes it.
 *
 * @param storage {ReturnType<typeof directoryStorage>}
 * @returns {StorageManager}
 */
export function asStorageManager(
  storage: ReturnType<typeof directoryStorage>
): StorageManager {
  return storage as unknown as StorageManager
}
