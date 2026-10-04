/**
 * @vitest-environment node
 *
 * The connected-parties readers over the `connections` directory: which
 * entries the Applications page lists as apps (`listConnectedApps`) and as
 * agents (`listConnectedAgents`, with the expired-row roster check), the
 * consent page's known-agent note (`findKnownAgents`), and the creator lookup
 * behind every "Created by" surface (`lookupCollectionCreators`). Every
 * fixture entry is written through wallet-core's own upsert helpers over an
 * in-memory store and read back through its one listing read. The read rule
 * is checked against the store's spies: every lookup by DID resolves against
 * the listing, and none GETs the id a DID derives to. The creator lookup and
 * the known-agent note take the listing alone and hold no store handle, so
 * their tests check what they answer for a DID no entry carries.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  connectionResourceId,
  setConnectionLabel
} from '@interop/wallet-core/connections'
import {
  findKnownAgents,
  listConnectedAgents,
  listConnectedApps,
  lookupCollectionCreators,
  lookupCreatedByParty,
  sharedCollectionIds
} from '@/lib/connectedApps'
import { EXTERNAL_REQUEST_ORIGIN } from '@/lib/walletRequest/externalRequest'
import type { StorageManager } from '@/stores/storageManager'
import {
  AGENT_DID,
  APP_DID,
  CLIENT_DID,
  OTHER_AGENT_DID,
  OTHER_APP_DID,
  PAST,
  SPACE_URL,
  WALLET_SIGNER,
  directoryStorage,
  entryOf,
  fixtureDirectory,
  grantZcap,
  listedConnections,
  recordConsent,
  retireParty,
  type FixtureDirectory
} from '../../tests/unit/connectionFixtures'
import { HMAC_KEY } from '../../tests/unit/memoryConnections'

const APP_ORIGIN = 'https://app.example'
const APP_URL = 'https://app.example/editor'
const FIRST_SEEN = '2026-07-01T00:00:00.000Z'
const LAST_SEEN = '2026-08-01T00:00:00.000Z'
const ORIGIN_ONLY_APP_DID = 'did:key:z6MkOriginOnlyApp'
const NAMELESS_APP_DID = 'did:key:z6MkNamelessApp'

let directory: FixtureDirectory

beforeEach(() => {
  directory = fixtureDirectory()
})

/**
 * Records an App Connect consent for the fixture app.
 *
 * @param options {object}
 * @param [options.did] {string}
 * @param [options.grants] {Array<object>}
 * @param [options.appKey] {string}
 * @param [options.name] {string}
 * @param [options.origin] {string}
 * @param [options.url] {string}
 * @param [options.at] {string}
 * @returns {Promise<void>}
 */
async function connectApp({
  did = APP_DID,
  grants = [],
  grantKind,
  appKey,
  name = 'Notes',
  origin = APP_ORIGIN,
  url = APP_URL,
  at = LAST_SEEN
}: {
  did?: string
  grants?: Array<Record<string, unknown>>
  grantKind?: 'grant' | 'share'
  appKey?: string
  name?: string
  origin?: string
  url?: string
  at?: string
} = {}): Promise<void> {
  await recordConsent({
    directory,
    did,
    kind: 'app',
    grants,
    ...(grantKind !== undefined && { grantKind }),
    ...(appKey !== undefined && { appKey }),
    name,
    origin,
    url,
    at
  })
}

/**
 * Plants a grant on a stored entry the way a storage host could, skipping
 * the write-time checks every reader repeats.
 *
 * @param options {object}
 * @param options.did {string}   the entry's party
 * @param options.zcap {object}   the planted capability
 * @returns {Promise<void>}
 */
async function plantGrant({
  did,
  zcap
}: {
  did: string
  zcap: Record<string, unknown>
}): Promise<void> {
  const resourceId = await connectionResourceId({ hmacKey: HMAC_KEY, did })
  const row = directory.rows.get(resourceId)!
  const body = row.body as { grants: unknown[] }
  body.grants.push({ zcap, grantKind: 'grant', grantedAt: LAST_SEEN })
}

describe('listConnectedApps', () => {
  it('lists an app holding an app key and no grant', async () => {
    await connectApp({ appKey: 'r-app-key', at: FIRST_SEEN })

    const apps = listConnectedApps({
      connections: await listedConnections(directory),
      spaceUrl: SPACE_URL
    })

    expect(apps).toEqual([
      {
        resourceId: await connectionResourceId({
          hmacKey: HMAC_KEY,
          did: APP_DID
        }),
        name: 'Notes',
        origin: APP_ORIGIN,
        appUrl: APP_URL,
        subjectDid: APP_DID,
        appKey: 'r-app-key',
        connectedAt: FIRST_SEEN,
        lastConnectedAt: FIRST_SEEN,
        grants: []
      }
    ])
  })

  it('does not list an app holding neither an app key nor a grant', async () => {
    await connectApp()

    expect(
      listConnectedApps({
        connections: await listedConnections(directory),
        spaceUrl: SPACE_URL
      })
    ).toEqual([])
  })

  it('lists every grant, live and expired, newest first', async () => {
    await connectApp({
      grants: [
        grantZcap({ id: 'urn:zcap:old', controller: APP_DID, expires: PAST })
      ],
      at: FIRST_SEEN
    })
    await connectApp({
      grants: [
        grantZcap({
          id: 'urn:zcap:new',
          controller: APP_DID,
          collection: 'drafts',
          allowedAction: ['GET', 'PUT']
        })
      ],
      at: LAST_SEEN
    })

    const [app] = listConnectedApps({
      connections: await listedConnections(directory),
      spaceUrl: SPACE_URL
    })

    expect(app.connectedAt).toBe(FIRST_SEEN)
    expect(app.lastConnectedAt).toBe(LAST_SEEN)
    expect(app.grants).toEqual([
      {
        id: 'urn:zcap:new',
        target: `${SPACE_URL}drafts/`,
        allowedActions: ['GET', 'PUT'],
        expires: '2099-01-01T00:00:00.000Z',
        collectionId: 'drafts',
        signerKeyId: WALLET_SIGNER,
        grantKind: 'grant',
        grantedAt: LAST_SEEN
      },
      {
        id: 'urn:zcap:old',
        target: `${SPACE_URL}notes/`,
        allowedActions: ['GET'],
        expires: PAST,
        collectionId: 'notes',
        signerKeyId: WALLET_SIGNER,
        grantKind: 'grant',
        grantedAt: FIRST_SEEN
      }
    ])
  })

  it('names the wallet collections an app holds a share of, once each', async () => {
    await connectApp({
      grants: [
        grantZcap({
          id: 'urn:zcap:share-1',
          controller: APP_DID,
          collection: 'private-credentials'
        }),
        grantZcap({
          id: 'urn:zcap:share-2',
          controller: APP_DID,
          collection: 'private-credentials'
        }),
        grantZcap({
          id: 'urn:zcap:share-3',
          controller: APP_DID,
          collection: 'contacts'
        })
      ],
      grantKind: 'share',
      at: FIRST_SEEN
    })
    // A plain grant on an app collection is no share.
    await connectApp({
      grants: [
        grantZcap({
          id: 'urn:zcap:docs',
          controller: APP_DID,
          collection: 'docs'
        })
      ],
      at: LAST_SEEN
    })

    const [app] = listConnectedApps({
      connections: await listedConnections(directory),
      spaceUrl: SPACE_URL
    })

    expect(sharedCollectionIds({ grants: app.grants })).toEqual([
      'private-credentials',
      'contacts'
    ])
  })

  it('does not list a retired app entry', async () => {
    await connectApp({
      appKey: 'r-app-key',
      grants: [grantZcap({ id: 'urn:zcap:one', controller: APP_DID })]
    })
    await retireParty({ directory, did: APP_DID, zcapIds: ['urn:zcap:one'] })

    expect(
      listConnectedApps({
        connections: await listedConnections(directory),
        spaceUrl: SPACE_URL
      })
    ).toEqual([])
  })

  it('never lists an agent or a wallet-client entry as an app', async () => {
    await recordConsent({
      directory,
      did: AGENT_DID,
      kind: 'agent',
      grants: [grantZcap({ id: 'urn:zcap:agent', controller: AGENT_DID })]
    })
    await recordConsent({
      directory,
      did: CLIENT_DID,
      kind: 'wallet-client',
      grants: [grantZcap({ id: 'urn:zcap:client', controller: CLIENT_DID })],
      origin: APP_ORIGIN,
      appKey: 'r-client'
    })

    expect(
      listConnectedApps({
        connections: await listedConnections(directory),
        spaceUrl: SPACE_URL
      })
    ).toEqual([])
  })

  it('names an app by its label, then its name, then its origin', async () => {
    await connectApp({ did: APP_DID, appKey: 'r-1', name: 'Notes' })
    await setConnectionLabel({
      store: directory.store,
      hmacKey: HMAC_KEY,
      did: APP_DID,
      kind: 'app',
      label: 'My notes'
    })
    await connectApp({ did: OTHER_APP_DID, appKey: 'r-2', name: 'Drafts' })
    await recordConsent({
      directory,
      did: ORIGIN_ONLY_APP_DID,
      kind: 'app',
      appKey: 'r-3',
      origin: 'https://origin-only.example'
    })
    await recordConsent({
      directory,
      did: NAMELESS_APP_DID,
      kind: 'app',
      appKey: 'r-4'
    })

    const names = new Map(
      listConnectedApps({
        connections: await listedConnections(directory),
        spaceUrl: SPACE_URL
      }).map(app => [app.subjectDid, app.name])
    )

    expect(names.get(APP_DID)).toBe('My notes')
    expect(names.get(OTHER_APP_DID)).toBe('Drafts')
    expect(names.get(ORIGIN_ONLY_APP_DID)).toBe('https://origin-only.example')
    // No name at all: the view falls back to the shortened DID.
    expect(names.has(NAMELESS_APP_DID)).toBe(true)
    expect(names.get(NAMELESS_APP_DID)).toBeUndefined()
  })

  it('stores no name from a 65-character app name, so the origin names the app', async () => {
    await connectApp({ appKey: 'r-app-key', name: 'n'.repeat(65) })

    expect((await entryOf({ directory, did: APP_DID }))?.name).toBeUndefined()
    const [app] = listConnectedApps({
      connections: await listedConnections(directory),
      spaceUrl: SPACE_URL
    })
    expect(app.name).toBe(APP_ORIGIN)
  })

  it('sorts by the latest consent, newest first', async () => {
    await connectApp({ did: APP_DID, appKey: 'r-1', at: FIRST_SEEN })
    await connectApp({ did: OTHER_APP_DID, appKey: 'r-2', at: LAST_SEEN })

    expect(
      listConnectedApps({
        connections: await listedConnections(directory),
        spaceUrl: SPACE_URL
      }).map(app => app.subjectDid)
    ).toEqual([OTHER_APP_DID, APP_DID])
  })

  it('drops a planted grant naming another party or another Space', async () => {
    await connectApp({
      grants: [grantZcap({ id: 'urn:zcap:own', controller: APP_DID })]
    })
    await plantGrant({
      did: APP_DID,
      zcap: grantZcap({ id: 'urn:zcap:foreign', controller: AGENT_DID })
    })
    await plantGrant({
      did: APP_DID,
      zcap: {
        ...grantZcap({ id: 'urn:zcap:elsewhere', controller: APP_DID }),
        invocationTarget: 'https://was.example/space/other/notes/'
      }
    })

    const [app] = listConnectedApps({
      connections: await listedConnections(directory),
      spaceUrl: SPACE_URL
    })

    expect(app.grants.map(grant => grant.id)).toEqual(['urn:zcap:own'])
  })

  it('lists an app by its key alone on a session with no Space', async () => {
    await connectApp({
      appKey: 'r-app-key',
      grants: [grantZcap({ id: 'urn:zcap:one', controller: APP_DID })]
    })

    const [app] = listConnectedApps({
      connections: await listedConnections(directory)
    })

    expect(app.subjectDid).toBe(APP_DID)
    expect(app.grants).toEqual([])
  })
})

describe('listConnectedAgents', () => {
  /**
   * Records an interaction-URL consent for an agent.
   *
   * @param options {object}
   * @param [options.did] {string}
   * @param [options.grants] {Array<object>}
   * @param [options.name] {string}
   * @param [options.at] {string}
   * @returns {Promise<void>}
   */
  async function grantAgent({
    did = AGENT_DID,
    grants = [grantZcap({ id: `urn:zcap:${did}`, controller: did })],
    name,
    at = LAST_SEEN
  }: {
    did?: string
    grants?: Array<Record<string, unknown>>
    name?: string
    at?: string
  } = {}): Promise<void> {
    await recordConsent({
      directory,
      did,
      kind: 'agent',
      grants,
      ...(name !== undefined && { name }),
      at
    })
  }

  /**
   * The agent listing over the fixture directory.
   *
   * @param [rosterCollections] {string[] | Error}
   * @returns {Promise<object>}   the rows and the storage double
   */
  async function agentsListed(rosterCollections?: string[] | Error) {
    const storage = directoryStorage({ directory, rosterCollections })
    const agents = await listConnectedAgents({
      storage: storage as unknown as StorageManager,
      connections: await listedConnections(directory),
      spaceUrl: SPACE_URL
    })
    return { agents, storage }
  }

  it('lists an agent holding a live grant', async () => {
    await grantAgent({ name: 'Deploy bot' })

    const { agents, storage } = await agentsListed()

    expect(agents).toHaveLength(1)
    expect(agents[0]).toMatchObject({
      resourceId: await connectionResourceId({
        hmacKey: HMAC_KEY,
        did: AGENT_DID
      }),
      controller: AGENT_DID,
      name: 'Deploy bot',
      origin: EXTERNAL_REQUEST_ORIGIN,
      grantedAt: LAST_SEEN
    })
    expect(agents[0].expired).toBeUndefined()
    expect(storage.granteeRosterCollections).not.toHaveBeenCalled()
  })

  it('leaves the name off when the request declared none', async () => {
    await grantAgent()

    const { agents } = await agentsListed()

    expect(agents[0].name).toBeUndefined()
    expect(agents[0].controller).toBe(AGENT_DID)
  })

  it('hides an agent holding no grant', async () => {
    await grantAgent({ grants: [] })

    expect((await agentsListed()).agents).toEqual([])
  })

  it('does not list a retired agent entry', async () => {
    await grantAgent()
    await retireParty({
      directory,
      did: AGENT_DID,
      zcapIds: [`urn:zcap:${AGENT_DID}`]
    })

    expect((await agentsListed()).agents).toEqual([])
  })

  it('never lists an app or a wallet-client entry as an agent', async () => {
    await connectApp({
      grants: [grantZcap({ id: 'urn:zcap:app', controller: APP_DID })]
    })
    await recordConsent({
      directory,
      did: CLIENT_DID,
      kind: 'wallet-client',
      grants: [grantZcap({ id: 'urn:zcap:client', controller: CLIENT_DID })]
    })

    expect((await agentsListed()).agents).toEqual([])
  })

  it('keeps and flags an expired agent while a collection still lists it', async () => {
    await grantAgent({
      grants: [
        grantZcap({ id: 'urn:zcap:gone', controller: AGENT_DID, expires: PAST })
      ]
    })

    const { agents, storage } = await agentsListed(['notes'])

    expect(agents).toHaveLength(1)
    expect(agents[0].expired).toBe(true)
    expect(storage.granteeRosterCollections).toHaveBeenCalledWith({
      grantees: [{ controller: AGENT_DID, targets: [`${SPACE_URL}notes/`] }]
    })
  })

  it('drops an expired agent no collection lists', async () => {
    await grantAgent({
      grants: [
        grantZcap({ id: 'urn:zcap:gone', controller: AGENT_DID, expires: PAST })
      ]
    })

    expect((await agentsListed([])).agents).toEqual([])
  })

  it('keeps an expired agent when a key epoch cannot be read', async () => {
    await grantAgent({
      grants: [
        grantZcap({ id: 'urn:zcap:gone', controller: AGENT_DID, expires: PAST })
      ]
    })

    const { agents } = await agentsListed(new Error('epoch unreadable'))

    expect(agents).toHaveLength(1)
    expect(agents[0].expired).toBe(true)
  })

  it('reads the key epochs of every expired agent in one roster read', async () => {
    await grantAgent({
      grants: [
        grantZcap({ id: 'urn:zcap:one', controller: AGENT_DID, expires: PAST })
      ]
    })
    await grantAgent({
      did: OTHER_AGENT_DID,
      grants: [
        grantZcap({
          id: 'urn:zcap:two',
          controller: OTHER_AGENT_DID,
          expires: PAST
        })
      ]
    })

    const { storage } = await agentsListed(['notes'])

    expect(storage.granteeRosterCollections).toHaveBeenCalledTimes(1)
    expect(
      storage.granteeRosterCollections.mock.calls[0][0].grantees
    ).toHaveLength(2)
  })

  it('reads no key epoch when one grant is still live', async () => {
    await grantAgent({
      grants: [
        grantZcap({
          id: 'urn:zcap:gone',
          controller: AGENT_DID,
          expires: PAST
        }),
        grantZcap({ id: 'urn:zcap:live', controller: AGENT_DID })
      ]
    })

    const { agents, storage } = await agentsListed()

    expect(agents[0].expired).toBeUndefined()
    expect(storage.granteeRosterCollections).not.toHaveBeenCalled()
  })

  it("carries every grant on the agent's entry, newest first, for its detail page", async () => {
    await grantAgent({
      grants: [
        grantZcap({ id: 'urn:zcap:old', controller: AGENT_DID, expires: PAST })
      ],
      at: FIRST_SEEN
    })
    await grantAgent({
      grants: [
        grantZcap({
          id: 'urn:zcap:new',
          controller: AGENT_DID,
          collection: 'drafts'
        })
      ],
      at: LAST_SEEN
    })

    const { agents } = await agentsListed()

    expect(agents[0]).toMatchObject({
      connectedAt: FIRST_SEEN,
      lastConnectedAt: LAST_SEEN,
      grantedAt: LAST_SEEN
    })
    expect(
      agents[0].grants.map(({ id, grantedAt }) => ({ id, grantedAt }))
    ).toEqual([
      { id: 'urn:zcap:new', grantedAt: LAST_SEEN },
      { id: 'urn:zcap:old', grantedAt: FIRST_SEEN }
    ])
  })

  it('sorts by the latest consent, newest first', async () => {
    await grantAgent({ did: AGENT_DID, at: FIRST_SEEN })
    await grantAgent({ did: OTHER_AGENT_DID, at: LAST_SEEN })

    expect(
      (await agentsListed()).agents.map(agent => agent.controller)
    ).toEqual([OTHER_AGENT_DID, AGENT_DID])
  })
})

describe('findKnownAgents', () => {
  it("answers an agent's name and its newest grant's time", async () => {
    await recordConsent({
      directory,
      did: AGENT_DID,
      kind: 'agent',
      grants: [grantZcap({ id: 'urn:zcap:old', controller: AGENT_DID })],
      name: 'Deploy bot',
      at: FIRST_SEEN
    })
    await recordConsent({
      directory,
      did: AGENT_DID,
      kind: 'agent',
      grants: [grantZcap({ id: 'urn:zcap:new', controller: AGENT_DID })],
      at: LAST_SEEN
    })

    const known = findKnownAgents({
      connections: await listedConnections(directory),
      spaceUrl: SPACE_URL,
      controllers: [AGENT_DID, OTHER_AGENT_DID]
    })

    expect([...known]).toEqual([
      [AGENT_DID, { name: 'Deploy bot', grantedAt: LAST_SEEN }]
    ])
  })

  it('still answers an agent whose every grant has expired', async () => {
    await recordConsent({
      directory,
      did: AGENT_DID,
      kind: 'agent',
      grants: [
        grantZcap({ id: 'urn:zcap:gone', controller: AGENT_DID, expires: PAST })
      ]
    })

    const known = findKnownAgents({
      connections: await listedConnections(directory),
      spaceUrl: SPACE_URL,
      controllers: [AGENT_DID]
    })

    expect(known.get(AGENT_DID)).toEqual({ grantedAt: LAST_SEEN })
  })

  it('answers nothing for a retired agent entry', async () => {
    await recordConsent({
      directory,
      did: AGENT_DID,
      kind: 'agent',
      grants: [grantZcap({ id: 'urn:zcap:one', controller: AGENT_DID })],
      name: 'Deploy bot'
    })
    await retireParty({ directory, did: AGENT_DID, zcapIds: ['urn:zcap:one'] })

    expect(
      findKnownAgents({
        connections: await listedConnections(directory),
        spaceUrl: SPACE_URL,
        controllers: [AGENT_DID]
      }).size
    ).toBe(0)
  })

  it('answers nothing for an agent holding no grant', async () => {
    await recordConsent({
      directory,
      did: AGENT_DID,
      kind: 'agent',
      name: 'Deploy bot'
    })

    expect(
      findKnownAgents({
        connections: await listedConnections(directory),
        spaceUrl: SPACE_URL,
        controllers: [AGENT_DID]
      }).size
    ).toBe(0)
  })

  it('answers nothing for a wallet-client or an app entry', async () => {
    await recordConsent({
      directory,
      did: CLIENT_DID,
      kind: 'wallet-client',
      grants: [grantZcap({ id: 'urn:zcap:client', controller: CLIENT_DID })]
    })
    await setConnectionLabel({
      store: directory.store,
      hmacKey: HMAC_KEY,
      did: CLIENT_DID,
      kind: 'wallet-client',
      label: 'Work laptop'
    })
    await connectApp({
      grants: [grantZcap({ id: 'urn:zcap:app', controller: APP_DID })]
    })

    expect(
      findKnownAgents({
        connections: await listedConnections(directory),
        spaceUrl: SPACE_URL,
        controllers: [CLIENT_DID, APP_DID]
      }).size
    ).toBe(0)
  })

  it('answers the listed agent alone among the controllers asked about', async () => {
    await recordConsent({
      directory,
      did: AGENT_DID,
      kind: 'agent',
      grants: [grantZcap({ id: 'urn:zcap:one', controller: AGENT_DID })]
    })

    const known = findKnownAgents({
      connections: await listedConnections(directory),
      spaceUrl: SPACE_URL,
      controllers: [AGENT_DID, OTHER_AGENT_DID]
    })

    expect([...known.keys()]).toEqual([AGENT_DID])
    expect(known.has(OTHER_AGENT_DID)).toBe(false)
  })
})

describe('lookupCollectionCreators', () => {
  it('names a listed app from its entry, with the resource id a link needs', async () => {
    await connectApp({ appKey: 'r-app-key' })

    const creators = lookupCollectionCreators({
      connections: await listedConnections(directory),
      spaceUrl: SPACE_URL,
      generators: [{ id: APP_DID, origin: APP_ORIGIN }]
    })

    expect(creators.get(APP_DID)).toEqual({
      name: 'Notes',
      appUrl: APP_URL,
      resourceId: await connectionResourceId({
        hmacKey: HMAC_KEY,
        did: APP_DID
      })
    })
  })

  it('names a retired app from its kept names, with no resource id', async () => {
    await connectApp({
      appKey: 'r-app-key',
      grants: [grantZcap({ id: 'urn:zcap:one', controller: APP_DID })]
    })
    await retireParty({ directory, did: APP_DID, zcapIds: ['urn:zcap:one'] })

    const creators = lookupCollectionCreators({
      connections: await listedConnections(directory),
      spaceUrl: SPACE_URL,
      generators: [{ id: APP_DID, origin: APP_ORIGIN }]
    })

    expect(creators.get(APP_DID)).toEqual({ name: 'Notes', appUrl: APP_URL })
  })

  it("reads the user's label ahead of the app's name", async () => {
    await connectApp({ appKey: 'r-app-key' })
    await setConnectionLabel({
      store: directory.store,
      hmacKey: HMAC_KEY,
      did: APP_DID,
      kind: 'app',
      label: 'My notes'
    })

    const creators = lookupCollectionCreators({
      connections: await listedConnections(directory),
      spaceUrl: SPACE_URL,
      generators: [{ id: APP_DID, origin: APP_ORIGIN }]
    })

    expect(creators.get(APP_DID)?.name).toBe('My notes')
  })

  it("drops an agent's stamp, an unstamped collection, and an agent entry", async () => {
    await recordConsent({
      directory,
      did: AGENT_DID,
      kind: 'agent',
      grants: [grantZcap({ id: 'urn:zcap:one', controller: AGENT_DID })],
      name: 'Backup Agent',
      origin: APP_ORIGIN,
      url: APP_URL
    })

    const creators = lookupCollectionCreators({
      connections: await listedConnections(directory),
      spaceUrl: SPACE_URL,
      generators: [
        { id: AGENT_DID, name: 'Backup Agent' },
        undefined,
        // An app stamp whose DID only an agent entry carries.
        { id: AGENT_DID, origin: APP_ORIGIN }
      ]
    })

    expect(creators.size).toBe(0)
  })

  it('leaves a creator no entry names absent', async () => {
    await connectApp({ appKey: 'r-app-key' })

    const creators = lookupCollectionCreators({
      connections: await listedConnections(directory),
      spaceUrl: SPACE_URL,
      generators: [{ id: OTHER_APP_DID, origin: 'https://other.example' }]
    })

    expect(creators.size).toBe(0)
  })

  it('answers a planted generator id with nothing, beside a listed one', async () => {
    await connectApp({ appKey: 'r-app-key' })

    const creators = lookupCollectionCreators({
      connections: await listedConnections(directory),
      spaceUrl: SPACE_URL,
      generators: [
        { id: APP_DID, origin: APP_ORIGIN },
        // A DID the host planted on a collection, which no entry carries.
        { id: OTHER_APP_DID, origin: 'https://planted.example' }
      ]
    })

    expect([...creators.keys()]).toEqual([APP_DID])
    expect(creators.get(APP_DID)).toEqual(
      expect.objectContaining({ name: 'Notes', appUrl: APP_URL })
    )
    expect(creators.has(OTHER_APP_DID)).toBe(false)
  })

  it('leaves its connections input and the Applications order unchanged', async () => {
    await connectApp({ did: APP_DID, appKey: 'r-1', at: FIRST_SEEN })
    await connectApp({ did: OTHER_APP_DID, appKey: 'r-2', at: LAST_SEEN })
    const connections = await listedConnections(directory)
    const snapshot = structuredClone(connections)
    const order = listConnectedApps({ connections }).map(app => app.subjectDid)

    lookupCollectionCreators({
      connections,
      spaceUrl: SPACE_URL,
      generators: [{ id: APP_DID, origin: APP_ORIGIN }]
    })

    // The same array the caller passed: no entry rewritten, none reordered.
    expect(connections).toEqual(snapshot)
    expect(connections.map(({ resourceId }) => resourceId)).toEqual(
      snapshot.map(({ resourceId }) => resourceId)
    )
    expect(
      listConnectedApps({ connections }).map(app => app.subjectDid)
    ).toEqual(order)
  })
})

describe('lookupCreatedByParty', () => {
  /**
   * The lookup over the fixture directory.
   *
   * @param did {string}
   * @param [rosterCollections] {string[] | Error}
   * @returns {Promise<object>}   the party and the storage double
   */
  async function partyOf(did: string, rosterCollections?: string[] | Error) {
    const storage = directoryStorage({ directory, rosterCollections })
    const party = await lookupCreatedByParty({
      storage: storage as unknown as StorageManager,
      connections: await listedConnections(directory),
      spaceUrl: SPACE_URL,
      did
    })
    return { party, storage }
  }

  it('names a listed app from its entry, with the resource id a link needs', async () => {
    await connectApp({ appKey: 'r-app-key' })

    const { party, storage } = await partyOf(APP_DID)

    expect(party).toEqual({
      name: 'Notes',
      resourceId: await connectionResourceId({
        hmacKey: HMAC_KEY,
        did: APP_DID
      })
    })
    expect(storage.granteeRosterCollections).not.toHaveBeenCalled()
  })

  it('names a listed agent from its entry', async () => {
    await recordConsent({
      directory,
      did: AGENT_DID,
      kind: 'agent',
      grants: [grantZcap({ id: 'urn:zcap:one', controller: AGENT_DID })],
      name: 'Backup Agent'
    })

    const { party } = await partyOf(AGENT_DID)

    expect(party).toEqual({
      name: 'Backup Agent',
      resourceId: await connectionResourceId({
        hmacKey: HMAC_KEY,
        did: AGENT_DID
      })
    })
  })

  it('links an expired agent while a collection still lists it, and not otherwise', async () => {
    await recordConsent({
      directory,
      did: AGENT_DID,
      kind: 'agent',
      grants: [
        grantZcap({ id: 'urn:zcap:gone', controller: AGENT_DID, expires: PAST })
      ],
      name: 'Backup Agent'
    })
    const resourceId = await connectionResourceId({
      hmacKey: HMAC_KEY,
      did: AGENT_DID
    })

    const listed = await partyOf(AGENT_DID, ['notes'])
    expect(listed.party).toEqual({ name: 'Backup Agent', resourceId })

    const dropped = await partyOf(AGENT_DID, [])
    expect(dropped.party).toEqual({ name: 'Backup Agent' })
  })

  it('names a share recipient by its entry', async () => {
    await connectApp({
      grants: [grantZcap({ id: 'urn:zcap:share', controller: APP_DID })],
      grantKind: 'share'
    })

    const { party } = await partyOf(APP_DID)

    expect(party?.name).toBe('Notes')
  })

  it('names a retired party from its kept names, with no resource id', async () => {
    await connectApp({
      appKey: 'r-app-key',
      grants: [grantZcap({ id: 'urn:zcap:one', controller: APP_DID })]
    })
    await retireParty({ directory, did: APP_DID, zcapIds: ['urn:zcap:one'] })

    const { party } = await partyOf(APP_DID)

    expect(party).toEqual({ name: 'Notes' })
  })

  it('answers nothing for a wallet-client entry or a DID no entry names', async () => {
    await recordConsent({
      directory,
      did: CLIENT_DID,
      kind: 'wallet-client',
      name: 'Work laptop'
    })
    await connectApp({ appKey: 'r-app-key' })

    expect((await partyOf(CLIENT_DID)).party).toBeUndefined()
    expect((await partyOf(OTHER_APP_DID)).party).toBeUndefined()
  })
})

describe('the read rule', () => {
  beforeEach(async () => {
    await connectApp({ appKey: 'r-app-key' })
    await recordConsent({
      directory,
      did: AGENT_DID,
      kind: 'agent',
      grants: [grantZcap({ id: 'urn:zcap:one', controller: AGENT_DID })]
    })
    // The writes above re-read their own ids; the rule covers what follows.
    directory.get.mockClear()
    directory.list.mockClear()
  })

  it('resolves both Applications listings against the listing', async () => {
    const connections = await listedConnections(directory)
    listConnectedApps({ connections, spaceUrl: SPACE_URL })
    await listConnectedAgents({
      storage: directoryStorage({ directory }) as unknown as StorageManager,
      connections,
      spaceUrl: SPACE_URL
    })

    expect(directory.list).toHaveBeenCalledTimes(1)
    expect(directory.get).not.toHaveBeenCalled()
  })
})
