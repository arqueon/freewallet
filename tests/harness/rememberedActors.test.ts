/**
 * Remembered actors over a browser profile the test owns.
 *
 * A remembered browser is one holding a client-key record for the
 * credential typed, so the login routing proceeds as that enrolled client
 * (the silent ratchet). A browser holding none takes the transient
 * composition, the default. The profile outlives its actors: a dropped
 * actor (a crashed tab) leaves the profile's store as it was, and a wipe
 * (cleared site data) removes it, at any point.
 *
 * Run: `pnpm run test:harness`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startWalletHarness, type WalletHarness } from './walletHarness'
import { buildEnrolledClientAccount } from './accountBuilder'

describe('remembered actors over a test-owned profile', () => {
  let harness: WalletHarness

  beforeAll(async () => {
    harness = await startWalletHarness()
  })

  afterAll(async () => {
    await harness?.close()
  })

  it('a dropped remembered actor keeps the store, and the next tab on the profile is the same enrolled client', async () => {
    const account = await buildEnrolledClientAccount({ harness })
    const profile = account.enrolledProfile

    const first = await harness.logIn({
      passphrase: account.passphrase,
      profile,
      name: 'first tab'
    })
    expect(first.kind).toBe('remembered')
    expect(first.session.user.id).toBe(account.enrolledClientDid)
    expect((await first.settled()).failures).toEqual([])
    const firstHistory = await first.run(session =>
      session.storage.listHistoryItems()
    )
    expect(firstHistory.entries.length).toBeGreaterThan(0)
    const keysBefore = [...profile.sessionStore.keys()].sort()
    first.drop()
    expect(first.state()).toBe('dropped')
    expect(
      first.session.disposal.aborted,
      'nothing tore the dropped session down'
    ).toBe(false)
    expect(
      [...profile.sessionStore.keys()].sort(),
      'the drop left the session database as it was'
    ).toEqual(keysBefore)
    expect(profile.replicaCollectionCount()).toBeGreaterThan(0)

    const second = await harness.logIn({
      passphrase: account.passphrase,
      profile,
      name: 'second tab'
    })
    expect(second.kind).toBe('remembered')
    expect(second.spaceId).toBe(account.spaceId)
    expect(
      second.session.user.id,
      'the second tab entered as the same enrolled client'
    ).toBe(account.enrolledClientDid)
    // The second tab reads the replica the first one wrote: every activity
    // the first tab saw is still there, beside the second tab's own Login.
    // Replication is not started, so none of it came from the server.
    expect((await second.settled()).failures).toEqual([])
    const secondHistory = await second.run(session =>
      session.storage.listHistoryItems()
    )
    const secondIds = new Set(secondHistory.entries.map(entry => entry.id))
    expect(
      firstHistory.entries.every(entry => secondIds.has(entry.id)),
      'the replica kept what the first tab held'
    ).toBe(true)
    expect(secondHistory.entries.length).toBeGreaterThan(
      firstHistory.entries.length
    )
    await second.logout()
  })

  it('two remembered actors on two profiles are two enrolled clients, live at once', async () => {
    const account = await buildEnrolledClientAccount({ harness })
    const otherProfile = harness.coldProfile({ name: 'other browser' })
    const enrollee = await harness.logIn({
      passphrase: account.passphrase,
      profile: otherProfile,
      rememberBrowser: true,
      name: 'second enrollment'
    })
    expect((await enrollee.settled()).failures).toEqual([])
    await enrollee.logout()

    // RxDB's open-collection cap stalls the second replica's open by about
    // two seconds; both still open.
    const first = await harness.logIn({
      passphrase: account.passphrase,
      profile: account.enrolledProfile,
      name: 'first browser'
    })
    const second = await harness.logIn({
      passphrase: account.passphrase,
      profile: otherProfile,
      name: 'second browser'
    })
    for (const { failures } of await Promise.all([
      first.settled(),
      second.settled()
    ])) {
      expect(failures).toEqual([])
    }
    expect(first.kind).toBe('remembered')
    expect(second.kind).toBe('remembered')
    expect(first.session.user.id).toBe(account.enrolledClientDid)
    expect(
      second.session.user.id,
      'each profile holds its own enrolled client'
    ).toBe(enrollee.session.user.id)
    expect(second.session.user.id).not.toBe(first.session.user.id)

    // Both records sit under the same unlock Space id, each in its own
    // profile, wrapping a different client's key set.
    const recordKey = `client-keys/${first.session.profile.unlockMethod?.unlockSpaceId}`
    const firstRecord = account.enrolledProfile.sessionStore.get(recordKey)
    const secondRecord = otherProfile.sessionStore.get(recordKey)
    expect(firstRecord).toBeDefined()
    expect(secondRecord).toBeDefined()
    expect(JSON.stringify(secondRecord)).not.toBe(JSON.stringify(firstRecord))

    await Promise.all([first.logout(), second.logout()])
  })

  it('a wiped profile routes the next login transient', async () => {
    const account = await buildEnrolledClientAccount({ harness })
    const profile = account.enrolledProfile

    const remembered = await harness.logIn({
      passphrase: account.passphrase,
      profile,
      name: 'remembered'
    })
    expect(remembered.kind).toBe('remembered')
    expect((await remembered.settled()).failures).toEqual([])
    await remembered.logout()

    profile.wipe()
    expect([...profile.databaseNames]).toEqual([])
    expect(profile.sessionStore.size).toBe(0)
    expect(profile.replicaCollectionCount()).toBe(0)

    const next = await harness.logIn({
      passphrase: account.passphrase,
      profile,
      name: 'after the wipe'
    })
    expect(
      next.kind,
      'a profile holding no client-key record takes the transient default'
    ).toBe('transient')
    expect(next.spaceId).toBe(account.spaceId)
    expect((await next.settled()).failures).toEqual([])
    expect(
      [...profile.databaseNames],
      'the transient visit created nothing in the wiped profile'
    ).toEqual([])
    await next.logout()
  })

  it('a profile wiped while its remembered actor is mid-login leaves the account loginable', async () => {
    const account = await buildEnrolledClientAccount({ harness })
    const profile = account.enrolledProfile

    // Wiped straight after entry: the login mender block is still running
    // against the session database when its store goes away.
    const torn = await harness.logIn({
      passphrase: account.passphrase,
      profile,
      name: 'torn'
    })
    expect(torn.kind).toBe('remembered')
    profile.wipe()
    torn.drop()
    // Waited out, not asserted clean: its mender block ran against a store
    // wiped under it, and the test is about the account, not that block.
    await torn.settled()

    const next = await harness.logIn({
      passphrase: account.passphrase,
      profile,
      name: 'after the torn wipe'
    })
    expect(next.kind).toBe('transient')
    expect(next.spaceId).toBe(account.spaceId)
    expect((await next.settled()).failures).toEqual([])
    await next.logout()

    // The enrolled client is still listed in the account document, so a
    // remembering login on the wiped profile self-enrolls a new client
    // beside it rather than reviving the lost one.
    const reenrolled = await harness.logIn({
      passphrase: account.passphrase,
      profile,
      rememberBrowser: true,
      name: 're-enrolled'
    })
    expect(reenrolled.kind).toBe('remembered')
    expect(reenrolled.session.user.id).not.toBe(account.enrolledClientDid)
    expect((await reenrolled.settled()).failures).toEqual([])
    await reenrolled.logout()
  })
})
