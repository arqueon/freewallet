import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ENCRYPTED_WALLET_COLLECTION_IDS } from '@/app.config'
import type { CollectionCreator } from '@/lib/connectedApps'
import type { StorageCollection } from '@/lib/storage'
import type { Session } from '@/types/auth'
import {
  APP_DID,
  SPACE_URL,
  fixtureDirectory,
  recordConsent,
  type FixtureDirectory
} from '../../tests/unit/connectionFixtures'
import { HMAC_KEY } from '../../tests/unit/memoryConnections'
import { useStorageListings } from './useStorageListings'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const APP_ORIGIN = 'https://app.example'

/**
 * A storage double over an in-memory `connections` directory, recording the
 * roster reads. Both listings name parties from the one directory listing
 * read the page makes.
 *
 * @param options {object}
 * @param options.directory {FixtureDirectory}
 * @param [options.directoryFails] {boolean}   whether the directory is
 *   refused
 * @returns {object}
 */
function storageDouble({
  directory,
  directoryFails = false
}: {
  directory: FixtureDirectory
  directoryFails?: boolean
}) {
  return {
    hasRemoteStorage: true,
    spaceUrl: SPACE_URL,
    connectionsDirectory: vi.fn(async () => {
      if (directoryFails) {
        throw new Error('directory refused')
      }
      return { store: directory.store, hmacKey: HMAC_KEY, spaceUrl: SPACE_URL }
    }),
    listCollectionShares: vi.fn(
      async (_options: { collectionId: string; connections?: unknown[] }) => []
    )
  }
}

/**
 * Lets the directory read, then the two listings behind it, settle.
 */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 4; tick++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })
  }
}

/**
 * Renders a probe component around the hook, without a testing library, and
 * lets its loads settle.
 */
async function mount({
  session,
  collections
}: {
  session: Session
  collections: StorageCollection[]
}): Promise<{
  creators: () => ReadonlyMap<string, CollectionCreator>
  reload: () => Promise<void>
  unmount: () => Promise<void>
}> {
  const container = document.createElement('div')
  const root: Root = createRoot(container)
  let creators: ReadonlyMap<string, CollectionCreator> = new Map()
  let reload: () => Promise<void> = async () => {}
  function Probe() {
    const listings = useStorageListings({ session, collections })
    creators = listings.creators
    reload = listings.reload
    return null
  }
  await act(async () => {
    root.render(<Probe />)
  })
  await settle()
  return {
    creators: () => creators,
    reload: async () => {
      await act(async () => {
        await reload()
      })
      await settle()
    },
    unmount: () =>
      act(async () => {
        root.unmount()
      })
  }
}

describe('useStorageListings', () => {
  let directory: FixtureDirectory

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    directory = fixtureDirectory()
    await recordConsent({
      directory,
      did: APP_DID,
      kind: 'app',
      appKey: 'r-app-key',
      name: 'Notes',
      origin: APP_ORIGIN,
      url: `${APP_ORIGIN}/notes`
    })
    // The write above re-read its own id; the page load is what is checked.
    directory.get.mockClear()
    directory.list.mockClear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads the directory once for both listings, with no GET at a derived id', async () => {
    const storage = storageDouble({ directory })
    const session = { storage } as unknown as Session
    const probe = await mount({
      session,
      collections: [
        {
          id: 'app-notes',
          url: `${SPACE_URL}app-notes/`,
          generator: { id: APP_DID, origin: APP_ORIGIN }
        } as StorageCollection
      ]
    })

    expect(directory.list).toHaveBeenCalledTimes(1)
    expect(directory.get).not.toHaveBeenCalled()
    // The rosters are named from that one read's entries.
    expect(storage.listCollectionShares).toHaveBeenCalledTimes(
      ENCRYPTED_WALLET_COLLECTION_IDS.length
    )
    const [first] = storage.listCollectionShares.mock.calls[0]
    expect(first.connections).toEqual([
      expect.objectContaining({ id: APP_DID, kind: 'app' })
    ])
    // The creators are named from it too.
    expect(probe.creators().get(APP_DID)).toMatchObject({
      name: 'Notes',
      appUrl: `${APP_ORIGIN}/notes`
    })
    await probe.unmount()
  })

  it('names no creator when no collection carries a generator', async () => {
    const storage = storageDouble({ directory })
    const session = { storage } as unknown as Session
    const probe = await mount({
      session,
      collections: [
        {
          id: 'private-credentials',
          url: `${SPACE_URL}private-credentials/`
        }
      ]
    })

    expect(directory.list).toHaveBeenCalledTimes(1)
    expect(storage.listCollectionShares).toHaveBeenCalledTimes(
      ENCRYPTED_WALLET_COLLECTION_IDS.length
    )
    expect(probe.creators().size).toBe(0)
    await probe.unmount()
  })

  it("names no creator for an agent's stamp, which carries no origin", async () => {
    const storage = storageDouble({ directory })
    const session = { storage } as unknown as Session
    const probe = await mount({
      session,
      collections: [
        {
          id: 'agent-notes',
          url: `${SPACE_URL}agent-notes/`,
          generator: { id: APP_DID, name: 'Backup Agent' }
        } as StorageCollection
      ]
    })

    expect(directory.list).toHaveBeenCalledTimes(1)
    expect(probe.creators().size).toBe(0)
    await probe.unmount()
  })

  it('lists the rosters unnamed when the directory read fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const storage = storageDouble({ directory, directoryFails: true })
    const session = { storage } as unknown as Session
    const probe = await mount({
      session,
      collections: [
        {
          id: 'app-notes',
          url: `${SPACE_URL}app-notes/`,
          generator: { id: APP_DID, origin: APP_ORIGIN }
        } as StorageCollection
      ]
    })

    expect(storage.listCollectionShares).toHaveBeenCalledTimes(
      ENCRYPTED_WALLET_COLLECTION_IDS.length
    )
    const [first] = storage.listCollectionShares.mock.calls[0]
    expect(first.connections).toBeUndefined()
    expect(probe.creators().size).toBe(0)
    await probe.unmount()
  })

  it('re-runs the shares load on reload after a failed directory read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const storage = storageDouble({ directory, directoryFails: true })
    const session = { storage } as unknown as Session
    const probe = await mount({ session, collections: [] })
    expect(storage.connectionsDirectory).toHaveBeenCalledTimes(1)
    expect(storage.listCollectionShares).toHaveBeenCalledTimes(
      ENCRYPTED_WALLET_COLLECTION_IDS.length
    )

    // A second failed read still re-lists the rosters, so a removed reader
    // drops off the "Shared" chip.
    await probe.reload()
    expect(storage.connectionsDirectory).toHaveBeenCalledTimes(2)
    expect(storage.listCollectionShares).toHaveBeenCalledTimes(
      2 * ENCRYPTED_WALLET_COLLECTION_IDS.length
    )
    await probe.unmount()
  })
})
