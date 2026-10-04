/**
 * Per-tab attribution of the process-wide log stream.
 *
 * `@interop/logger` keeps one sink list for the whole process, and the
 * ceremony event channel (wallet-core's `ceremonyEvents`, freewallet's
 * `stageMarker`) rides it. Several harness actors can be live at once, so a
 * captured event has to be traced back to the tab that caused it. The
 * harness runs every actor's work inside an `AsyncLocalStorage` scope bound
 * to that actor's recorder. Node carries the scope across `await`, promise
 * continuations, and timers, so work an actor starts and does not await (the
 * login mender block, the welcome-content seed, a fire-and-forget activity
 * write) still lands in that actor's recorder. The one sink installed here
 * reads the scope at dispatch, which `@interop/logger` runs synchronously
 * inside the log call.
 *
 * The limit: an event belongs to the async chain that emitted it, which is
 * the chain that created the work, not every chain that awaits it. Module
 * level memos shared by every tab in the process are created once, inside
 * whichever actor asked first, so their lines go to that actor. Today that
 * is the service discovery memo in `src/lib/wasService.ts` (its one
 * `Service discovered` debug line). An event emitted outside any actor
 * scope lands in `unattributed`.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { addSink, configure, type LogEvent } from '@interop/logger'
import { LOGGER_FILTER } from '../shared/ceremonyEventLines'

/**
 * One tab's slice of the log stream, in dispatch order.
 */
export interface TabRecorder {
  readonly name: string
  readonly events: LogEvent[]
}

const tabScope = new AsyncLocalStorage<TabRecorder>()

/**
 * Runs `work` inside a tab's scope, so every event its async chain emits is
 * recorded on that tab.
 *
 * @param options {object}
 * @param options.recorder {TabRecorder}
 * @param options.work {() => Promise<T>}
 * @returns {Promise<T>}
 */
export function inTab<T>({
  recorder,
  work
}: {
  recorder: TabRecorder
  work: () => Promise<T>
}): Promise<T> {
  return tabScope.run(recorder, work)
}

/**
 * Installs the attributing sink and the logger configuration the harness
 * runs under: the default console sink off (unless asked for), and the
 * debug filter the e2e fixture uses, so `ceremony stage` events and `noop`
 * outcomes (both debug) are dispatched rather than dropped.
 *
 * @param options {object}
 * @param options.console {boolean}   keep the default console sink
 * @returns {{ unattributed: LogEvent[], uninstall: () => void }}
 */
export function installTabAttribution({
  console: keepConsole
}: {
  console: boolean
}): {
  unattributed: LogEvent[]
  uninstall: () => void
} {
  const unattributed: LogEvent[] = []
  configure({ console: keepConsole, filter: LOGGER_FILTER })
  const remove = addSink(event => {
    const recorder = tabScope.getStore()
    if (recorder) {
      recorder.events.push(event)
    } else {
      unattributed.push(event)
    }
  })
  return {
    unattributed,
    uninstall: () => {
      remove()
      configure({ console: true, filter: null })
    }
  }
}
