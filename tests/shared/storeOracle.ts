/**
 * The store-side oracle: "does Space X still exist on the server?", answered
 * by inspecting the teaching server's FileSystem backend directly rather
 * than by asking the server over HTTP.
 *
 * An HTTP probe cannot answer it. The server masks an authorization refusal
 * on a Space request as a 404, so after the account Space is gone every
 * survivor whose controller was the account did:webvh answers 404 whether it
 * was deleted or merely stranded -- exactly the Spaces (the auxiliary annex
 * ones) a deletion's completeness assertion is about. A Space is the
 * directory `<data root>/spaces/<spaceId>`, removed whole by a Space DELETE,
 * with no tombstone and no index file to consult.
 *
 * Every reader takes the server's data root as `dataDir`: the Playwright WAS
 * suite's run root (`tests/e2e-was/wasDataDir.ts`) or the node harness's
 * temp backend (`tests/harness/`). The Playwright-bound pieces (a polled
 * assertion, the Space id read off a page) stay in
 * `tests/e2e-was/storeOracle.ts`, so this module carries no Playwright
 * import.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * The FileSystem backend's Spaces directory under a data root.
 *
 * @param options {object}
 * @param options.dataDir {string}   the server's data root
 * @returns {string}
 */
export function storedSpacesDir({ dataDir }: { dataDir: string }): string {
  return path.join(dataDir, 'spaces')
}

/**
 * Every Space id the store currently holds. An absent Spaces directory (a
 * server that has never written one) reads as an empty store rather than an
 * error, matching the backend's own `listSpaces`.
 *
 * @param options {object}
 * @param options.dataDir {string}   the server's data root
 * @returns {Promise<string[]>}
 */
export async function listStoredSpaceIds({
  dataDir
}: {
  dataDir: string
}): Promise<string[]> {
  let entries
  try {
    entries = await fs.readdir(storedSpacesDir({ dataDir }), {
      withFileTypes: true
    })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw err
  }
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
}

/**
 * Whether one Space still exists in the store. The Space id is the directory
 * name verbatim (no encoding), and a Space DELETE removes that directory
 * recursively, so its presence is the whole predicate.
 *
 * @param options {object}
 * @param options.dataDir {string}   the server's data root
 * @param options.spaceId {string}
 * @returns {Promise<boolean>}
 */
export async function spaceExistsInStore({
  dataDir,
  spaceId
}: {
  dataDir: string
  spaceId: string
}): Promise<boolean> {
  try {
    const stats = await fs.stat(
      path.join(storedSpacesDir({ dataDir }), spaceId)
    )
    return stats.isDirectory()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw err
  }
}

/**
 * The Space ids the store gained since a baseline listing -- the Spaces one
 * account's setup created, when nothing else was writing to the server. The
 * WAS suite runs on a single worker, so a `beforeAll` baseline and a listing
 * taken once the account is built bracket exactly that account's Spaces.
 *
 * @param options {object}
 * @param options.dataDir {string}   the server's data root
 * @param options.baseline {string[]}   the listing taken before the account
 *   was created
 * @returns {Promise<string[]>}
 */
export async function storedSpaceIdsSince({
  dataDir,
  baseline
}: {
  dataDir: string
  baseline: string[]
}): Promise<string[]> {
  const before = new Set(baseline)
  return (await listStoredSpaceIds({ dataDir })).filter(
    spaceId => !before.has(spaceId)
  )
}

/**
 * Which of the named Spaces the store still holds.
 *
 * @param options {object}
 * @param options.dataDir {string}   the server's data root
 * @param options.spaceIds {string[]}
 * @returns {Promise<string[]>}
 */
export async function survivingSpaceIds({
  dataDir,
  spaceIds
}: {
  dataDir: string
  spaceIds: string[]
}): Promise<string[]> {
  const held = new Set(await listStoredSpaceIds({ dataDir }))
  return spaceIds.filter(spaceId => held.has(spaceId))
}

/**
 * The Space id a WAS Space URL names.
 *
 * @param url {string}
 * @returns {string}
 */
export function spaceIdOfUrl(url: string): string {
  const match = /\/space\/([^/?#]+)/.exec(url)
  if (!match) {
    throw new Error(`Not a WAS Space URL: "${url}".`)
  }
  return decodeURIComponent(match[1]!)
}
