/**
 * The server-state shapes: accounts built by `@interop/wallet-core/testing`
 * against the harness's server, read back through the store oracle. Each
 * exists as server-side state alone, so the app's login finds none of them.
 *
 * Run: `pnpm run test:harness`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  readAccountLogVersions,
  readPointedAnnexGeneration,
  readUserKeyRoster
} from '../shared/storedLogs'
import { buildServerStateAccount } from './accountBuilder'
import { startWalletHarness, type WalletHarness } from './walletHarness'

/**
 * What the store holds for an account: the key sets at the account log's
 * head, the roster's state, and the annex Space the head points into.
 *
 * @param options {object}
 * @param options.harness {WalletHarness}
 * @param options.spaceId {string}
 * @returns {Promise<object>}
 */
async function readShape({
  harness,
  spaceId
}: {
  harness: WalletHarness
  spaceId: string
}) {
  const { dataDir } = harness
  const versions = await readAccountLogVersions({ dataDir, spaceId })
  const head = versions[versions.length - 1]
  return {
    assertionKeys: head?.assertionKeys ?? new Set<string>(),
    invocationKeys: head?.invocationKeys ?? new Set<string>(),
    roster: await readUserKeyRoster({ dataDir, spaceId }),
    annexSpaceId: (await readPointedAnnexGeneration({ dataDir, spaceId }))
      ?.annexSpaceId
  }
}

describe('the server-state account shapes', () => {
  let harness: WalletHarness

  beforeAll(async () => {
    harness = await startWalletHarness()
  })

  afterAll(async () => {
    await harness?.close()
  })

  it('credential-anchored with one passphrase, which no login finds', async () => {
    const account = await buildServerStateAccount({
      harness,
      shape: 'passphrase'
    })
    const shape = await readShape({ harness, spaceId: account.spaceId })
    expect(shape.annexSpaceId).toBe(account.annexSpaceId)
    expect(shape.assertionKeys.size, 'one ladder VM').toBe(1)
    expect(shape.invocationKeys.size, 'no enrolled client').toBe(0)
    expect(shape.roster.currentEpoch).toBeDefined()

    // The shared builder binds no unlock record the app's login can locate.
    await expect(
      harness.logIn({ passphrase: account.passphrase })
    ).rejects.toThrow()
  })

  it('with a second standing credential', async () => {
    const account = await buildServerStateAccount({
      harness,
      shape: 'second-credential'
    })
    const shape = await readShape({ harness, spaceId: account.spaceId })
    expect(shape.assertionKeys.size, 'one ladder VM per credential').toBe(2)
    expect(shape.invocationKeys.size).toBe(0)
    expect(account.second.passphrase).not.toBe(account.passphrase)
  })

  it('with a recovery code issued', async () => {
    const account = await buildServerStateAccount({
      harness,
      shape: 'recovery-code'
    })
    const shape = await readShape({ harness, spaceId: account.spaceId })
    expect(shape.assertionKeys.size, "the code's ladder VM published").toBe(2)
    expect(shape.invocationKeys.size).toBe(0)
    expect(account.recovery.recoveryKid).toBe(
      account.recovery.client.recipientKid
    )
  })

  it('with one enrolled client', async () => {
    const account = await buildServerStateAccount({
      harness,
      shape: 'enrolled-client'
    })
    const shape = await readShape({ harness, spaceId: account.spaceId })
    expect([...shape.invocationKeys]).toEqual([
      account.client.signingKeyMultibase
    ])
  })
})
