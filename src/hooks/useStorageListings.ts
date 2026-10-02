/**
 * The two listings behind the Storage page's collection rows -- the reader
 * rosters behind each row's "Shared" chip and the creating apps behind its
 * "Created by" line -- named from one read of the `connections` directory.
 * Every lookup by DID matches that read's decrypted entries in memory, so the
 * page issues no GET at the id a DID derives to.
 *
 * Each listing's failure is non-blocking: the chips or the attribution line
 * simply do not appear, and the storage listing itself stays usable. The
 * rosters are read whether or not the directory could be: a failed
 * directory read leaves the readers unnamed and the creators unresolved.
 */
import { useMemo } from 'react'
import type { ReadConnection } from '@interop/wallet-core/connections'
import { createLogger } from '@/lib/log'
import { readDirectoryListing } from '@/session/clients'
import { listSharedCollections, type CollectionShare } from '@/session/shares'
import type { CollectionCreator } from '@/lib/connectedApps'
import type { StorageCollection } from '@/lib/storage'
import type { Session } from '@/types/auth'
import { useAsyncLoad } from './useAsyncLoad'
import { useCollectionCreators } from './useCollectionCreators'

const log = createLogger('fw:ui:storage')

/**
 * One shared empty map, so a disabled, loading, or failed listing keeps a
 * stable identity across renders and the consumers' memos hold.
 */
const NO_SHARES: Record<string, CollectionShare[]> = {}

/**
 * @param options {object}
 * @param options.session {Session | null}   the live session; both listings
 *   stay off without one, and without remote storage
 * @param options.collections {StorageCollection[]}   the listed collections;
 *   the creators lookup runs only once one of them carries an app
 *   `generator` (one with an `origin`)
 * @returns {{ sharesByCollection: Record<string, CollectionShare[]>,
 *   creators: ReadonlyMap<string, CollectionCreator>, reload: () =>
 *   Promise<void> }}   the two listings, the creators keyed by `generator.id`
 *   DID, and a reload that re-reads the directory and re-runs both
 */
export function useStorageListings({
  session,
  collections
}: {
  session: Session | null
  collections: StorageCollection[]
}): {
  sharesByCollection: Record<string, CollectionShare[]>
  creators: ReadonlyMap<string, CollectionCreator>
  reload: () => Promise<void>
} {
  const hasRemoteStorage = Boolean(session?.storage?.hasRemoteStorage)
  const active = hasRemoteStorage && session !== null

  // The one directory read. A failed read settles as `{ listing: null }`, so
  // the rosters below still load, unnamed. Every settled read is a fresh
  // object, failed or not, so a reload always changes `directory`'s identity
  // and the two listings below re-run off it. (A bare `null` over `null`
  // would leave the shares load un-run after a reload.)
  const { data: directory, reload } = useAsyncLoad(
    async (): Promise<{
      listing: { connections: ReadConnection[]; spaceUrl?: string } | null
    }> => {
      if (!session) {
        return { listing: null }
      }
      try {
        return { listing: await readDirectoryListing({ session }) }
      } catch (err) {
        log.error('Could not read the connections directory', { err })
        return { listing: null }
      }
    },
    [session],
    { enabled: active }
  )

  const { data: loadedShares, error: sharesError } = useAsyncLoad(
    async (): Promise<Record<string, CollectionShare[]>> => {
      if (!session || directory === undefined) {
        return NO_SHARES
      }
      const { listing } = directory
      return listSharedCollections({
        session,
        ...(listing
          ? { connections: listing.connections.map(({ entry }) => entry) }
          : {})
      })
    },
    [session, directory],
    {
      enabled: active && directory !== undefined,
      onError: err => {
        log.error('Could not load the collection shares', { err })
      }
    }
  )

  const sharesByCollection = useMemo(
    () => (sharesError ? NO_SHARES : (loadedShares ?? NO_SHARES)),
    [loadedShares, sharesError]
  )

  const creators = useCollectionCreators({
    session,
    generators: collections.map(({ generator }) => generator),
    directory: directory?.listing ?? null
  })

  return { sharesByCollection, creators, reload }
}
