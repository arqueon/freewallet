import { describe, it, expect } from 'vitest'
import {
  attributeCollectionsToApps,
  collectionCreatorLabel,
  resolveCreatedBy
} from './collectionAttribution'
import type { CollectionCreator } from '@/lib/connectedApps'
import type { StorageCollection } from '@/lib/storage'

/**
 * A listing entry, in the server-relative URL form the Space listing reports.
 *
 * @param options {object}
 * @param options.id {string}
 * @param [options.generator] {string}   the stamped `generator.id`, stamped
 *   as an app's (with an `origin`)
 * @returns {StorageCollection}
 */
function collectionEntry({
  id,
  generator
}: {
  id: string
  generator?: `did:${string}`
}): StorageCollection {
  return {
    id,
    url: `/space/abc/${id}`,
    ...(generator && {
      generator: { id: generator, origin: 'https://app.example' }
    })
  }
}

const AGENT_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'

const CONNECTED: CollectionCreator = {
  name: 'Editor',
  appUrl: 'https://app.example/editor',
  resourceId: 'entry-1'
}

describe('attributeCollectionsToApps', () => {
  it('matches a collection on its stamped generator', () => {
    const attribution = attributeCollectionsToApps({
      collections: [collectionEntry({ id: 'docs', generator: 'did:key:zApp' })],
      creators: new Map([['did:key:zApp', CONNECTED]])
    })
    expect(attribution.get('docs')).toBe(CONNECTED)
  })

  it('leaves a collection with no generator unattributed', () => {
    const attribution = attributeCollectionsToApps({
      collections: [collectionEntry({ id: 'docs' })],
      creators: new Map([['did:key:zApp', CONNECTED]])
    })
    expect(attribution.size).toBe(0)
  })

  it('leaves a collection naming an app no record knows unattributed', () => {
    const attribution = attributeCollectionsToApps({
      collections: [
        collectionEntry({ id: 'docs', generator: 'did:key:zGone' })
      ],
      creators: new Map([['did:key:zApp', CONNECTED]])
    })
    expect(attribution.size).toBe(0)
  })

  it('attributes a disconnected creator by its recorded name', () => {
    const disconnected: CollectionCreator = {
      name: 'Notes',
      appUrl: 'https://app.example/notes'
    }
    const attribution = attributeCollectionsToApps({
      collections: [
        collectionEntry({ id: 'notes', generator: 'did:key:zNotes' })
      ],
      creators: new Map([['did:key:zNotes', disconnected]])
    })
    expect(attribution.get('notes')).toBe(disconnected)
  })

  it("leaves an agent's stamp (no origin) out, even when a record shares its DID", () => {
    const attribution = attributeCollectionsToApps({
      collections: [
        {
          id: 'agent-notes',
          url: '/space/abc/agent-notes',
          generator: { id: 'did:key:zApp', name: 'Backup Agent' }
        }
      ],
      creators: new Map([['did:key:zApp', CONNECTED]])
    })
    expect(attribution.size).toBe(0)
  })
})

describe('collectionCreatorLabel', () => {
  const STAMPED: StorageCollection = {
    id: 'docs',
    url: '/space/abc/docs',
    generator: {
      id: 'did:key:zApp',
      origin: 'https://app.example',
      url: 'https://app.example/editor',
      name: 'Stamped Editor'
    }
  }

  it('prefers the stamped generator.name', () => {
    expect(
      collectionCreatorLabel({
        generator: STAMPED.generator,
        recordName: CONNECTED.name
      })
    ).toBe('Stamped Editor')
  })

  it("falls back to the wallet records' name when generator.name is absent", () => {
    const generator = { ...STAMPED.generator!, name: undefined }
    expect(
      collectionCreatorLabel({ generator, recordName: CONNECTED.name })
    ).toBe('Editor')
  })

  it('falls back to the stamped origin when nothing names the app', () => {
    const generator = {
      id: 'did:key:zApp' as const,
      origin: 'https://app.example'
    }
    expect(collectionCreatorLabel({ generator })).toBe('https://app.example')
  })

  it("names an agent's stamp by its generator.name, ignoring any record name", () => {
    expect(
      collectionCreatorLabel({
        generator: { id: AGENT_DID, name: 'Backup Agent' },
        recordName: CONNECTED.name
      })
    ).toBe('Backup Agent')
  })

  it("names an unnamed agent's stamp by its shortened DID", () => {
    expect(
      collectionCreatorLabel({
        generator: { id: AGENT_DID },
        recordName: CONNECTED.name
      })
    ).toBe('did:key:z6MkhaXg...ta2doK')
  })

  it("shows an unnamed agent's short DID whole", () => {
    expect(collectionCreatorLabel({ generator: { id: 'did:key:zApp' } })).toBe(
      'did:key:zApp'
    )
  })

  it('names nothing for an unattributed collection', () => {
    expect(
      collectionCreatorLabel({
        generator: collectionEntry({ id: 'docs' }).generator
      })
    ).toBeUndefined()
  })
})

describe('resolveCreatedBy', () => {
  const ACCOUNT_DID = 'did:webvh:QmScid:was.example:space:s:id'
  const CLIENT_DID = 'did:key:z6MkEnrolledClientKey'
  const ANNEX_DID = 'did:webvh:QmAnnex:was.example:space:a:id'
  const APP_DID = 'did:key:z6MkConnectedAppKey'
  const WALLET_DIDS = new Set([ACCOUNT_DID, CLIENT_DID, ANNEX_DID])

  it('reads an absent createdBy as not recorded', () => {
    expect(resolveCreatedBy({ walletDids: WALLET_DIDS })).toEqual({
      kind: 'not-recorded'
    })
  })

  it.each([
    ['the account did:webvh', ACCOUNT_DID],
    ["an enrolled client's did:key", CLIENT_DID],
    ['the client-annex DID', ANNEX_DID]
  ])('names %s as the wallet itself', (_label, createdBy) => {
    expect(resolveCreatedBy({ createdBy, walletDids: WALLET_DIDS })).toEqual({
      kind: 'wallet'
    })
  })

  it('names the wallet ahead of a party entry carrying the same DID', () => {
    expect(
      resolveCreatedBy({
        createdBy: CLIENT_DID,
        walletDids: WALLET_DIDS,
        party: { name: 'Planted' }
      })
    ).toEqual({ kind: 'wallet' })
  })

  it('names a listed party by its entry, with the resource id a link needs', () => {
    expect(
      resolveCreatedBy({
        createdBy: APP_DID,
        walletDids: WALLET_DIDS,
        party: { name: 'Editor', resourceId: 'entry-1' }
      })
    ).toEqual({ kind: 'party', name: 'Editor', resourceId: 'entry-1' })
  })

  it('names an unlisted party by its entry, with no link', () => {
    expect(
      resolveCreatedBy({
        createdBy: AGENT_DID,
        walletDids: WALLET_DIDS,
        party: { name: 'Backup Agent' }
      })
    ).toEqual({ kind: 'party', name: 'Backup Agent' })
  })

  it('shows a DID nothing names shortened', () => {
    expect(
      resolveCreatedBy({
        createdBy: 'did:key:z6MkUnknownCreatorKeyMaterial',
        walletDids: WALLET_DIDS
      })
    ).toEqual({ kind: 'unknown', name: 'did:key:z6MkUnkn...terial' })
  })
})
