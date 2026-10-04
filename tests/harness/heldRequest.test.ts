/**
 * Two visits interleaved at a chosen write with the server's request hold
 * (`harness.faults.hold`): the first visit's annex enrollment is paused at
 * the server while a second visit on the same credential logs in and
 * enrolls, then released.
 *
 * Run: `pnpm run test:harness`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startWalletHarness, type WalletHarness } from './walletHarness'
import { buildPassphraseAccount } from './accountBuilder'
import { readAccountLogSizes } from '../shared/storedLogs'

describe('two visits interleaved at a held write', () => {
  let harness: WalletHarness

  beforeAll(async () => {
    harness = await startWalletHarness()
  })

  afterAll(async () => {
    await harness?.close()
  })

  it('a visit whose annex enrollment is held past another visit converges', async () => {
    const account = await buildPassphraseAccount({ harness })
    const { dataDir, faults } = harness
    const before = await readAccountLogSizes({
      dataDir,
      spaceId: account.spaceId
    })
    const generationLog = /\/gen-[^/]+\/did\.jsonl$/
    const firstRequest = faults.requests.length
    const { held, release } = faults.hold({
      match: { method: 'PUT', path: generationLog }
    })

    const firstEntry = harness.logIn({
      passphrase: account.passphrase,
      name: 'held'
    })
    const heldRequest = await held
    // The second visit runs from start to settle while the first one's
    // enrollment waits at the server.
    const second = await harness.logIn({
      passphrase: account.passphrase,
      name: 'second'
    })
    expect((await second.settled()).failures).toEqual([])
    const releasedAt = faults.requests.length
    release()
    const first = await firstEntry
    expect((await first.settled()).failures).toEqual([])

    // The held append was built on a head the second visit moved, so it is
    // refused as stale once released. The first visit re-reads and appends
    // after the second visit's entry.
    expect(heldRequest.status).toBe(412)
    const enrollments = faults.requests
      .map((request, index) => ({ ...request, index }))
      .slice(firstRequest)
      .filter(
        request =>
          request.method === 'PUT' &&
          request.path === heldRequest.path &&
          request.fault === undefined
      )
    expect(
      enrollments.map(request => request.index < releasedAt),
      "the second visit's enrollment, then the first visit's re-attempt"
    ).toEqual([true, false])
    expect(enrollments.map(request => request.status)).toEqual([200, 200])

    // One enrollment entry each in the pointed generation.
    const after = await readAccountLogSizes({
      dataDir,
      spaceId: account.spaceId
    })
    expect(after.annexGeneration.generationId).toBe(
      before.annexGeneration.generationId
    )
    expect(after.annexGeneration.entries).toBe(
      before.annexGeneration.entries + 2
    )
    await Promise.all([first.logout(), second.logout()])
  })
})
