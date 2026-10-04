/**
 * How a harness visit ends, and several visits live at once.
 *
 * A visit ends either by the session's own logout (the shared teardown the
 * auth store's logout runs) or by being dropped (a tab that dies with no
 * teardown and tells the server nothing). Neither may leave the account
 * unloginable. Two visits may also be live on one account at once, each
 * holding its own session in its own tab memory.
 *
 * Run: `pnpm run test:harness`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startWalletHarness, type WalletHarness } from './walletHarness'

const PASSPHRASE = 'harness-visit-ends-Zz9!-correct-horse-battery'

describe('ending a visit, and visits live at once', () => {
  let harness: WalletHarness
  let spaceId: string

  beforeAll(async () => {
    harness = await startWalletHarness()
    const signup = await harness.signUp({ passphrase: PASSPHRASE })
    expect((await signup.settled()).failures).toEqual([])
    spaceId = signup.spaceId
    await signup.logout()
  })

  afterAll(async () => {
    await harness?.close()
  })

  it('a logged-out visit leaves the account loginable', async () => {
    const visit = await harness.logIn({ passphrase: PASSPHRASE })
    expect((await visit.settled()).failures).toEqual([])
    await visit.logout()
    expect(visit.state()).toBe('logged-out')
    expect(
      visit.session.disposal.aborted,
      'the teardown aborted the session'
    ).toBe(true)
    expect(
      [...visit.profile.databaseNames],
      'a transient visit leaves no database in the browser profile'
    ).toEqual([])
    expect(visit.profile.sessionStore.size).toBe(0)

    const next = await harness.logIn({ passphrase: PASSPHRASE })
    expect(next.spaceId).toBe(spaceId)
    expect((await next.settled()).failures).toEqual([])
    await next.logout()
  })

  it('a dropped visit leaves the account loginable', async () => {
    // Dropped straight after entry: its login mender block is still running
    // in the process when the next visit logs in, as a dying tab's last
    // requests can still land.
    const dropped = await harness.logIn({ passphrase: PASSPHRASE })
    dropped.drop()
    expect(dropped.state()).toBe('dropped')
    expect(
      dropped.session.disposal.aborted,
      'nothing tore the dropped session down'
    ).toBe(false)

    const next = await harness.logIn({ passphrase: PASSPHRASE })
    expect(next.spaceId).toBe(spaceId)
    expect((await next.settled()).failures).toEqual([])
    await next.logout()
    // The dropped visit's own work, waited out so it cannot outlive the
    // server. Nothing tore it down, so it ran to the end.
    expect((await dropped.settled()).failures).toEqual([])
  })

  it('two visits are live at once on one account', async () => {
    const [first, second] = await Promise.all([
      harness.logIn({ passphrase: PASSPHRASE, name: 'first' }),
      harness.logIn({ passphrase: PASSPHRASE, name: 'second' })
    ])
    for (const { failures } of await Promise.all([
      first.settled(),
      second.settled()
    ])) {
      expect(failures).toEqual([])
    }
    expect(first.spaceId).toBe(spaceId)
    expect(second.spaceId).toBe(spaceId)
    expect(
      first.session.user.id,
      'each tab holds its own per-visit key'
    ).not.toBe(second.session.user.id)

    // Both sessions read the account while both are live.
    const [firstCredentials, secondCredentials] = await Promise.all([
      first.run(session => session.storage.listCredentials()),
      second.run(session => session.storage.listCredentials())
    ])
    expect(firstCredentials.length).toBeGreaterThan(0)
    expect(secondCredentials.map(credential => credential.cid).sort()).toEqual(
      firstCredentials.map(credential => credential.cid).sort()
    )

    // Each tab's events are its own: both ran a whole login mender block.
    for (const actor of [first, second]) {
      expect(
        actor.events.some(
          event =>
            event.msg === 'ceremony mender' &&
            (event.data as { invariant?: string } | undefined)?.invariant ===
              'acting-credential-manage-zcap-is-current'
        ),
        `${actor.name} recorded its own mender block`
      ).toBe(true)
    }
    expect(
      first.events.some(event => second.events.includes(event)),
      'no event is attributed to both tabs'
    ).toBe(false)

    await first.logout()
    expect(second.state(), 'logging one tab out leaves the other live').toBe(
      'live'
    )
    expect(second.session.disposal.aborted).toBe(false)
    expect(
      (await second.run(session => session.storage.listCredentials())).length
    ).toBeGreaterThan(0)
    await second.logout()
  })
})
