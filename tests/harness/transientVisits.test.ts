/**
 * Twenty transient visits on one credential-anchored account, each a real
 * session against the in-process teaching server.
 *
 * A credential-anchored account's pointed annex generation gains one entry
 * per transient visit, with nothing collecting it, and the server
 * re-verifies the did:webvh log on every zcap request. This test measures
 * that growth: per visit, the entry count and byte size of the account log,
 * the pointed annex generation log, and the user key roster, plus the
 * visit's wall-clock times, its server requests, and its ceremony timeline.
 * It prints the tables and asserts that every visit logs in and that its
 * background work ran clean: no failed part and no error-level log event, so
 * no row is measured off a visit that broke. It sets no growth budget: a
 * budget belongs to the change that alters the growth.
 *
 * Run: `pnpm run test:harness`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startWalletHarness, type WalletHarness } from './walletHarness'
import {
  measureVisit,
  printTimelineTable,
  printVisitTable,
  type VisitMeasurement
} from './visitMeasurements'

const PASSPHRASE = 'harness-transient-visits-Zz9!-correct-horse'
const VISITS = 20

describe('transient visits on one credential-anchored account', () => {
  let harness: WalletHarness

  beforeAll(async () => {
    harness = await startWalletHarness()
  })

  afterAll(async () => {
    await harness?.close()
  })

  it(`logs in ${VISITS} times in a row, each visit a fresh tab`, async () => {
    const measurements: VisitMeasurement[] = []

    const signup = await harness.signUp({
      passphrase: PASSPHRASE,
      name: 'signup'
    })
    measurements.push(await measureVisit({ harness, actor: signup }))
    await signup.logout()

    for (let index = 1; index <= VISITS; index++) {
      const visit = await harness.logIn({
        passphrase: PASSPHRASE,
        name: `visit ${index}`
      })
      expect(visit.state()).toBe('live')
      expect(visit.spaceId, 'the visit entered the signed-up account').toBe(
        signup.spaceId
      )
      measurements.push(await measureVisit({ harness, actor: visit }))
      await visit.logout()
    }

    console.log('Per visit (row 0 is the signup):')
    printVisitTable({ measurements })
    console.log('The signup ceremony timeline:')
    printTimelineTable({ measurements: measurements.slice(0, 1) })
    console.log(`The ceremony timeline across the ${VISITS} transient visits:`)
    printTimelineTable({ measurements: measurements.slice(1) })
    expect(measurements).toHaveLength(VISITS + 1)
    for (const measurement of measurements) {
      expect(
        measurement.failures,
        `${measurement.visit}: its background work failed`
      ).toEqual([])
      expect(
        measurement.errors,
        `${measurement.visit}: it logged an error-level event`
      ).toBe(0)
    }
  })
})
