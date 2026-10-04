/**
 * The transient chain's mend report on a visit that had nothing to mend.
 *
 * Two registrations on the transient chain write the unlock-methods
 * registry: the backfill (`registry-lists-the-passphrase-method`) and the
 * management-zcap refresh (`acting-credential-manage-zcap-is-current`). A
 * second transient visit on a fresh account finds the registry current, so
 * neither writes, and each must report `noop`. A `clean` there would say a
 * repair ran on every login and hide the logins where one did.
 *
 * Run: `pnpm run test:harness`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startWalletHarness, type WalletHarness } from './walletHarness'

const PASSPHRASE = 'harness-mend-report-Zz9!-correct-horse'
const REGISTRY_WRITERS = [
  'registry-lists-the-passphrase-method',
  'acting-credential-manage-zcap-is-current'
]

describe('the transient mend report on a visit that wrote no registry', () => {
  let harness: WalletHarness

  beforeAll(async () => {
    harness = await startWalletHarness()
  })

  afterAll(async () => {
    await harness?.close()
  })

  it('reports both registry writers as noop on a second transient visit', async () => {
    const signup = await harness.signUp({
      passphrase: PASSPHRASE,
      name: 'signup'
    })
    await signup.settled()
    await signup.logout()

    const first = await harness.logIn({
      passphrase: PASSPHRASE,
      name: 'visit 1'
    })
    await first.settled()
    await first.logout()

    const second = await harness.logIn({
      passphrase: PASSPHRASE,
      name: 'visit 2'
    })
    expect(second.kind).toBe('transient')
    const { failures } = await second.settled()
    expect(failures, 'the visit ran clean').toEqual([])

    const registryWrites = second
      .serverRequests()
      .filter(
        record =>
          record.method !== 'GET' &&
          record.method !== 'HEAD' &&
          record.path.includes('/unlock-methods/')
      )
    expect(registryWrites, 'the visit wrote no registry').toEqual([])

    const report = (await second.session.mends) ?? []
    for (const invariant of REGISTRY_WRITERS) {
      const entries = report.filter(mend => mend.invariant === invariant)
      expect(entries, `${invariant} reported once`).toHaveLength(1)
      expect(entries[0]?.outcome, `${invariant} wrote nothing`).toBe('noop')
    }
    await second.logout()
  })
})
