// @vitest-environment node
/**
 * Tests for the grant revocation ceremony's events: the three entry points
 * (`revokeApplication`, `revokeAgent`, `removeCollectionShare`) each mint one
 * run's emitter, the stages fire as their writes land, and the outcome
 * classifies the run. The detail carries counts only, so no party DID
 * reaches the event channel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listConnectedAgents,
  listConnectedApps,
  type ConnectedAgent,
  type ConnectedApp,
  type GrantRevocationStageHook
} from '@/lib/connectedApps'
import { revokeAgent, revokeApplication } from '@/session/applications'
import { removeCollectionShare } from '@/session/shares'
import type { Session, User } from '@/types/auth'
import { captureCeremonyEvents } from './ceremonyEventCapture'
import {
  AGENT_DID,
  APP_DID,
  SPACE_URL,
  asStorageManager,
  directoryStorage,
  fixtureDirectory,
  grantZcap,
  listedConnections,
  recordConsent,
  type FixtureDirectory
} from './connectionFixtures'

const user: User = { id: 'did:key:zUser', email: 'user@example.com' }

let directory: FixtureDirectory
let capture: ReturnType<typeof captureCeremonyEvents>

beforeEach(() => {
  directory = fixtureDirectory()
  capture = captureCeremonyEvents()
})

afterEach(() => {
  capture.stop()
})

/**
 * A session over the fixture directory's storage.
 *
 * @param storage {object}   the fixture storage
 * @returns {Session}
 */
function sessionOver(storage: unknown): Session {
  return {
    storage: asStorageManager(storage as ReturnType<typeof directoryStorage>),
    user
  } as unknown as Session
}

/**
 * Records an App Connect consent for the fixture app, with one grant and an
 * app key, and returns its listed row.
 *
 * @returns {Promise<ConnectedApp>}
 */
async function connectedApp(): Promise<ConnectedApp> {
  await recordConsent({
    directory,
    did: APP_DID,
    kind: 'app',
    grants: [grantZcap({ id: 'urn:zcap:one', controller: APP_DID })],
    appKey: 'r-app-key',
    name: 'Notes',
    origin: 'https://app.example',
    url: 'https://app.example/editor'
  })
  const [app] = listConnectedApps({
    connections: await listedConnections(directory),
    spaceUrl: SPACE_URL
  })
  return app
}

/**
 * Records an interaction-URL consent for the fixture agent and returns its
 * listed row.
 *
 * @returns {Promise<ConnectedAgent>}
 */
async function grantedAgent(): Promise<ConnectedAgent> {
  await recordConsent({
    directory,
    did: AGENT_DID,
    kind: 'agent',
    grants: [grantZcap({ id: 'urn:zcap:one', controller: AGENT_DID })],
    name: 'Deploy bot'
  })
  const [agent] = await listConnectedAgents({
    storage: asStorageManager(directoryStorage({ directory })),
    connections: await listedConnections(directory),
    spaceUrl: SPACE_URL
  })
  return agent
}

describe('the grant revocation events', () => {
  it('marks every stage of an app disconnect and ends clean, counts only', async () => {
    const app = await connectedApp()
    const storage = directoryStorage({ directory })

    await revokeApplication({
      session: sessionOver(storage),
      app,
      grantsState: 'active'
    })

    expect(capture.stageNames('grant-revocation')).toEqual([
      'rotate-recipients',
      'revoke-grants',
      'delete-app-key',
      'retire-entry',
      'record-activity'
    ])
    expect(capture.soleOutcome('grant-revocation').data).toMatchObject({
      outcome: 'clean',
      revoked: 1,
      withdrawn: 1,
      skipped: 0,
      rotated: 1
    })
    expect(capture.serialized()).not.toContain(APP_DID)
  })

  it('marks an agent revoke without the app-key stage', async () => {
    const agent = await grantedAgent()
    const storage = directoryStorage({ directory })

    await revokeAgent({ session: sessionOver(storage), agent })

    expect(capture.stageNames('grant-revocation')).toEqual([
      'rotate-recipients',
      'revoke-grants',
      'retire-entry',
      'record-activity'
    ])
    expect(capture.soleOutcome('grant-revocation').data).toMatchObject({
      outcome: 'clean'
    })
    expect(capture.serialized()).not.toContain(AGENT_DID)
  })

  it('reads a run that withdrew nothing as clean, by its counts', async () => {
    const agent = await grantedAgent()
    const storage = directoryStorage({ directory })
    storage.revokeCollectionRecipients.mockResolvedValueOnce({
      collections: 0,
      rotated: 0,
      failed: 0,
      revokedIds: []
    })
    storage.revokeConnectionGrants.mockResolvedValueOnce({
      revoked: 1,
      withdrawn: 0,
      skipped: 0,
      revokedIds: ['urn:zcap:one']
    })

    await revokeAgent({ session: sessionOver(storage), agent })

    expect(capture.soleOutcome('grant-revocation').data).toMatchObject({
      outcome: 'clean',
      withdrawn: 0,
      rotated: 0
    })
  })

  it('fails a run whose rotation tore, before the retirement', async () => {
    const agent = await grantedAgent()
    const storage = directoryStorage({ directory })
    storage.revokeCollectionRecipients.mockResolvedValueOnce({
      collections: 1,
      rotated: 0,
      failed: 1,
      revokedIds: []
    })

    await expect(
      revokeAgent({ session: sessionOver(storage), agent })
    ).rejects.toThrow('Could not rotate every collection')

    expect(capture.stageNames('grant-revocation')).toEqual(['revoke-grants'])
    expect(capture.soleOutcome('grant-revocation').data).toMatchObject({
      outcome: 'failed'
    })
  })

  it('refuses an app with no connections entry', async () => {
    const storage = directoryStorage({ directory })

    await expect(
      revokeApplication({
        session: sessionOver(storage),
        app: { subjectDid: APP_DID } as ConnectedApp,
        grantsState: 'active'
      })
    ).rejects.toMatchObject({ name: 'ConnectionEntryMissingError' })

    expect(capture.stageNames('grant-revocation')).toEqual([])
    expect(capture.soleOutcome('grant-revocation').data).toMatchObject({
      outcome: 'refused',
      errorName: 'ConnectionEntryMissingError'
    })
  })

  it('emits an unshare run from removeCollectionShare', async () => {
    const unshareCollection = vi.fn(
      async ({ onStage }: { onStage?: GrantRevocationStageHook }) => {
        onStage?.('rotate-recipients')
        onStage?.('revoke-grants', { revoked: 1, skipped: 0 })
        onStage?.('remove-grants')
        onStage?.('record-activity')
        return {}
      }
    )
    const session = {
      storage: { unshareCollection },
      user,
      profile: {}
    } as unknown as Session

    await removeCollectionShare({
      session,
      collectionId: 'private-credentials',
      recipientId: 'did:key:zReader#zKak'
    })

    expect(capture.stageNames('grant-revocation')).toEqual([
      'rotate-recipients',
      'revoke-grants',
      'remove-grants',
      'record-activity'
    ])
    expect(capture.soleOutcome('grant-revocation').data).toMatchObject({
      outcome: 'clean'
    })
  })
})
