/**
 * What one harness visit cost, and the tables a run prints.
 *
 * A visit's measurement is taken once it has settled: the sizes of the three
 * logs a transient visit can grow (read off the store), its wall-clock
 * times, the server requests in its window, and its ceremony event channel
 * as a timeline. A timeline row is one event of the channel with the
 * milliseconds since the visit's entry call started. The stage events carry
 * no duration of their own, so the offset is what places a stage, a mender
 * report, or an outcome within the visit. A `Stage timing` line (freewallet's
 * `stageMarker`) carries its own span, and its row keeps that span instead.
 */
import type { LogEvent } from '@interop/logger'
import {
  CEREMONY_MENDER_MSG,
  CEREMONY_OUTCOME_MSG,
  CEREMONY_STAGE_MSG
} from '../shared/ceremonyEventLines'
import type {
  BackgroundFailure,
  WalletActor,
  WalletHarness
} from './walletHarness'

/**
 * The `stageMarker` line freewallet's own ceremonies log at each boundary.
 */
const STAGE_TIMING_MSG = 'Stage timing'

/**
 * Size of one log after a visit.
 */
export interface LogSize {
  entries: number
  bytes: number
}

/**
 * One row of a visit's ceremony timeline.
 *
 * - `kind`: `stage`, `outcome`, `mender`, or `timing` (a `Stage timing`
 *   line).
 * - `label`: `<ceremony>/<stage>`, `<ceremony>/<outcome>`, or
 *   `<invariant>/<outcome>` for a mender report.
 * - `ms`: the offset from the entry call's start, or a `timing` row's own
 *   span.
 */
export interface TimelineRow {
  kind: 'stage' | 'outcome' | 'mender' | 'timing'
  label: string
  ms: number
}

/**
 * One visit's measurement.
 */
export interface VisitMeasurement {
  visit: string
  entryMs: number
  settledMs: number
  accountLog: LogSize
  annexGeneration: LogSize & { generationId?: string }
  userKeyRoster: LogSize
  requests: number
  writes: number
  warnings: number
  errors: number
  /**
   * The visit's background work that failed (`WalletActor.settled()`).
   */
  failures: BackgroundFailure[]
  timeline: TimelineRow[]
}

/**
 * The methods that change server state.
 */
const WRITE_METHODS = new Set(['PUT', 'POST', 'PATCH', 'DELETE'])

/**
 * Settles a visit and measures it.
 *
 * @param options {object}
 * @param options.harness {WalletHarness}
 * @param options.actor {WalletActor}
 * @returns {Promise<VisitMeasurement>}
 */
export async function measureVisit({
  harness,
  actor
}: {
  harness: WalletHarness
  actor: WalletActor
}): Promise<VisitMeasurement> {
  const { settledMs, failures } = await actor.settled()
  const sizes = await harness.readLogSizes({ spaceId: actor.spaceId })
  const requests = actor.serverRequests()
  return {
    visit: actor.name,
    entryMs: Math.round(actor.entryMs),
    settledMs: Math.round(settledMs),
    ...sizes,
    requests: requests.length,
    writes: requests.filter(record => WRITE_METHODS.has(record.method)).length,
    warnings: actor.events.filter(event => event.level === 'warn').length,
    errors: actor.events.filter(event => event.level === 'error').length,
    failures,
    timeline: ceremonyTimeline({
      events: actor.events,
      startedAt: actor.startedAt
    })
  }
}

/**
 * A visit's ceremony event channel as timeline rows, in dispatch order.
 *
 * @param options {object}
 * @param options.events {readonly LogEvent[]}   the visit's events
 * @param options.startedAt {number}   the entry call's start, epoch ms
 * @returns {TimelineRow[]}
 */
export function ceremonyTimeline({
  events,
  startedAt
}: {
  events: readonly LogEvent[]
  startedAt: number
}): TimelineRow[] {
  const rows: TimelineRow[] = []
  for (const event of events) {
    const data = (event.data ?? {}) as Record<string, unknown>
    const offset = event.ts - startedAt
    if (event.msg === CEREMONY_STAGE_MSG) {
      rows.push({
        kind: 'stage',
        label: `${String(data.ceremony)}/${String(data.stage)}`,
        ms: offset
      })
    } else if (event.msg === CEREMONY_OUTCOME_MSG) {
      rows.push({
        kind: 'outcome',
        label: `${String(data.ceremony)}/${String(data.outcome)}`,
        ms: offset
      })
    } else if (event.msg === CEREMONY_MENDER_MSG) {
      rows.push({
        kind: 'mender',
        label: `${String(data.invariant)}/${String(data.outcome)}`,
        ms: offset
      })
    } else if (event.msg === STAGE_TIMING_MSG) {
      rows.push({
        kind: 'timing',
        label: `${String(data.ceremony)}/${String(data.stage)}`,
        ms: Number(data.ms)
      })
    }
  }
  return rows
}

/**
 * Prints one row per visit: times, the three logs' sizes, the request
 * counts, the warn and error counts, and the failed background work count.
 *
 * @param options {object}
 * @param options.measurements {VisitMeasurement[]}
 * @returns {void}
 */
export function printVisitTable({
  measurements
}: {
  measurements: VisitMeasurement[]
}): void {
  console.table(
    measurements.map(measurement => ({
      visit: measurement.visit,
      entryMs: measurement.entryMs,
      settledMs: measurement.settledMs,
      'account log n': measurement.accountLog.entries,
      'account log B': measurement.accountLog.bytes,
      'annex gen n': measurement.annexGeneration.entries,
      'annex gen B': measurement.annexGeneration.bytes,
      'roster n': measurement.userKeyRoster.entries,
      'roster B': measurement.userKeyRoster.bytes,
      requests: measurement.requests,
      writes: measurement.writes,
      warn: measurement.warnings,
      error: measurement.errors,
      failed: measurement.failures.length
    }))
  )
}

/**
 * Prints the ceremony timeline across visits: one row per timeline label,
 * with how many times it was reported and the minimum, median, and maximum of
 * its milliseconds (an offset from the entry call, or a `timing` row's own
 * span).
 *
 * @param options {object}
 * @param options.measurements {VisitMeasurement[]}
 * @returns {void}
 */
export function printTimelineTable({
  measurements
}: {
  measurements: VisitMeasurement[]
}): void {
  const byLabel = new Map<string, number[]>()
  for (const measurement of measurements) {
    for (const row of measurement.timeline) {
      const key = `${row.kind} ${row.label}`
      const values = byLabel.get(key) ?? []
      values.push(row.ms)
      byLabel.set(key, values)
    }
  }
  console.table(
    [...byLabel.entries()].map(([key, values]) => {
      const sorted = [...values].sort((left, right) => left - right)
      return {
        event: key,
        count: values.length,
        minMs: Math.round(sorted[0]!),
        medianMs: Math.round(sorted[Math.floor(sorted.length / 2)]!),
        maxMs: Math.round(sorted[sorted.length - 1]!)
      }
    })
  )
}
