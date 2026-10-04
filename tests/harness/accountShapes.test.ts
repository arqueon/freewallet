/**
 * The account builder's named shapes, each built through the real
 * ceremonies and then logged in on every credential it holds.
 *
 * The passkey shape also shows two actors live at once on DIFFERENT
 * standing credentials of one account: a passphrase visit and a passkey
 * visit, each a transient session holding its own per-visit key.
 *
 * Run: `pnpm run test:harness`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startWalletHarness, type WalletHarness } from './walletHarness'
import {
  buildEnrolledClientAccount,
  buildPassphraseAccount,
  buildPasskeyAccount,
  buildRecoveryCodeAccount
} from './accountBuilder'

describe('the account builder shapes', () => {
  let harness: WalletHarness

  beforeAll(async () => {
    harness = await startWalletHarness()
  })

  afterAll(async () => {
    await harness?.close()
  })

  it('credential-anchored with one passphrase', async () => {
    const account = await buildPassphraseAccount({ harness })
    const visit = await harness.logIn({ passphrase: account.passphrase })
    expect(visit.kind).toBe('transient')
    expect(visit.spaceId).toBe(account.spaceId)
    expect(visit.session.profile.unlockMethod?.type).toBe('passphrase')
    expect((await visit.settled()).failures).toEqual([])
    await visit.logout()
  })

  it('with a passphrase and a passkey, both live at once', async () => {
    const account = await buildPasskeyAccount({ harness })
    const [onPassphrase, onPasskey] = await Promise.all([
      harness.logIn({ passphrase: account.passphrase, name: 'passphrase' }),
      harness.logIn({ passkey: account.passkey, name: 'passkey' })
    ])
    for (const { failures } of await Promise.all([
      onPassphrase.settled(),
      onPasskey.settled()
    ])) {
      expect(failures).toEqual([])
    }

    for (const actor of [onPassphrase, onPasskey]) {
      expect(actor.kind, `${actor.name} is a transient session`).toBe(
        'transient'
      )
      expect(actor.spaceId, `${actor.name} entered the account`).toBe(
        account.spaceId
      )
      expect(actor.state()).toBe('live')
    }
    expect(onPassphrase.session.profile.unlockMethod?.type).toBe('passphrase')
    expect(onPasskey.session.profile.unlockMethod?.type).toBe('passkey')
    expect(
      onPasskey.session.profile.unlockMethod?.unlockSpaceId,
      'the two visits entered on different standing credentials'
    ).not.toBe(onPassphrase.session.profile.unlockMethod?.unlockSpaceId)
    expect(onPasskey.session.user.id).not.toBe(onPassphrase.session.user.id)

    // Both read the account while both are live.
    const [viaPassphrase, viaPasskey] = await Promise.all([
      onPassphrase.run(session => session.storage.listCredentials()),
      onPasskey.run(session => session.storage.listCredentials())
    ])
    expect(viaPassphrase.length).toBeGreaterThan(0)
    expect(viaPasskey.map(credential => credential.cid).sort()).toEqual(
      viaPassphrase.map(credential => credential.cid).sort()
    )

    // The registry lists both standing credentials.
    const { getUnlockMethods } = await import('@/session/unlockMethods')
    const registry = await onPasskey.run(session =>
      getUnlockMethods({ session })
    )
    expect(
      registry?.methods.map(method => method.type).sort(),
      'the registry names the passphrase and the passkey'
    ).toEqual(['passkey', 'passphrase'])

    await Promise.all([onPassphrase.logout(), onPasskey.logout()])
  })

  it('with a recovery code issued', async () => {
    const account = await buildRecoveryCodeAccount({ harness })
    const visit = await harness.logIn({ passphrase: account.passphrase })
    expect(visit.kind).toBe('transient')
    expect(visit.spaceId).toBe(account.spaceId)
    expect((await visit.settled()).failures).toEqual([])

    const { listRecoveryCodeEntries, locateRecoveryAccount } =
      await import('@/session/recovery')
    const entries = await visit.run(session =>
      listRecoveryCodeEntries({ session })
    )
    expect(
      entries.map(entry => entry.recoveryKid),
      'the registry records the issued code'
    ).toEqual([account.recoveryKid])
    // The `/recover` page's locate step: read-only, so the code stays
    // unspent for whatever a test does with the shape next.
    await expect(
      locateRecoveryAccount({ code: account.recoveryCode })
    ).resolves.toBeUndefined()
    await visit.logout()
  })

  it('with one enrolled client', async () => {
    const account = await buildEnrolledClientAccount({ harness })

    // On the enrolled client's profile the routing finds the client-key
    // record and proceeds remembered, as that same client.
    const remembered = await harness.logIn({
      passphrase: account.passphrase,
      profile: account.enrolledProfile,
      name: 'remembered'
    })
    expect(remembered.kind).toBe('remembered')
    expect(remembered.spaceId).toBe(account.spaceId)
    expect(remembered.session.user.id).toBe(account.enrolledClientDid)
    expect((await remembered.settled()).failures).toEqual([])
    await remembered.logout()

    // Any other profile still enters transiently.
    const elsewhere = await harness.logIn({
      passphrase: account.passphrase,
      name: 'elsewhere'
    })
    expect(elsewhere.kind).toBe('transient')
    expect(elsewhere.spaceId).toBe(account.spaceId)
    expect((await elsewhere.settled()).failures).toEqual([])
    await elsewhere.logout()
  })
})
