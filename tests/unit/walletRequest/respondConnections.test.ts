// @vitest-environment node
/**
 * An integration test of the consent-time directory write on a guest
 * session: a real `StorageManager` with a local `connections` collection
 * and a locally minted blinded-index key, the real request pipeline, and a
 * zero-grant App Connect. The `app` entry lands with empty grants, at the id
 * derived under the local key, and the Applications listing lists it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'
import { CapabilityAgent } from '@interop/capability-agent'
import {
  connectionResourceId,
  readConnections
} from '@interop/wallet-core/connections'
import { listConnectedApps } from '@/lib/connectedApps'
import { classifyRequest } from '@/lib/walletRequest/classify'
import { composeAndDeliverResponse } from '@/lib/walletRequest/respond'
import type { IVPRDetails } from '@/lib/walletRequest/types'
import { browserLocalSessionPersistence } from '@/session/persistence'
import { StorageManager } from '@/stores/storageManager'
import { generateVaultKeys } from '@/stores/testing/vaultKeys'
import type { ControllerProfile, Session } from '@/types/auth'

const ORIGIN = 'https://app.example'
const APP = { name: 'Text Editor', appUrl: 'https://app.example/editor' }

describe('a zero-grant App Connect on a guest session', () => {
  beforeEach(() => {
    // `BrowserStore.userExists` probes the browser's database list; a local
    // session never branches on the answer, so an empty listing is enough.
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: { databases: async () => [] }
    })
  })
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'indexedDB')
  })

  it('writes the app entry under the local blinded-index key, and the listing lists it', async () => {
    const owner = await generateVaultKeys()
    const keyAgent = await CapabilityAgent.fromSecret({
      secret: new Uint8Array(32).fill(7),
      handle: 'test'
    })
    const user = { id: keyAgent.id }
    const profile = { ...owner, keyAgent } as unknown as ControllerProfile
    const persistence = browserLocalSessionPersistence({ persistCaches: false })
    const { storage } = await StorageManager.initStorageClients({
      user,
      session: { profile, persistence },
      isGuest: true,
      storage: getRxStorageMemory()
    })
    await storage.ensureUserCollections({ user })
    const session = {
      user,
      profile,
      persistence,
      storage,
      isGuest: true
    } as unknown as Session

    const request = {
      query: [{ type: 'AppConnectQuery', app: APP, capabilityQuery: [] }]
    } as unknown as IVPRDetails
    const response = await composeAndDeliverResponse({
      request,
      session,
      profile: classifyRequest({ request, origin: ORIGIN }),
      requestOrigin: ORIGIN,
      selectedVCs: []
    })
    const subjectDid = response.appConnect?.subjectDid
    expect(subjectDid).toMatch(/^did:key:/)
    expect(response.zcaps).toEqual([])

    const directory = await storage.connectionsDirectory()
    expect(directory.spaceUrl).toBeUndefined()
    const listing = await readConnections(directory)
    expect(listing?.entries).toHaveLength(1)
    const [read] = listing!.entries
    expect(read.resourceId).toBe(
      await connectionResourceId({
        hmacKey: directory.hmacKey,
        did: subjectDid!
      })
    )
    // The minted key's `app-connections` Resource is the entry's `appKey`.
    const { appKeys } = await storage.listAppKeys()
    expect(appKeys).toHaveLength(1)
    expect(read.entry).toMatchObject({
      kind: 'app',
      id: subjectDid,
      name: APP.name,
      origin: ORIGIN,
      url: APP.appUrl,
      appKey: appKeys[0].resourceId,
      grants: []
    })

    const apps = listConnectedApps({ connections: listing!.entries })
    expect(apps).toEqual([
      expect.objectContaining({
        subjectDid,
        name: APP.name,
        appKey: appKeys[0].resourceId,
        grants: []
      })
    ])
  })
})
