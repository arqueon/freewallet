/**
 * The console-capture e2e fixture: collects every browser console line and
 * uncaught page exception of one test, from every page of every context the
 * test opens, and attaches them to the report when the test fails.
 *
 * It watches the default `context`, and through the browser's `context`
 * event every context the test creates itself (`browser.newContext()`, as
 * `coldTerminal` does), so a second terminal and an embedded CHAPI popup
 * frame are covered with no call from the spec. A context from some other
 * browser instance is watched once passed to `watch()`.
 *
 * Lines are kept in two lanes (`consoleLines.ts`): the app's namespaced
 * logger lines, and the bare lines of the CHAPI polyfill, the wallet worker,
 * RxDB, and the other dependencies that call `console.*` directly. Both are
 * kept and both are attached.
 *
 * Specs import `test` and `expect` from here, or from `ceremonyEvents.ts`,
 * whose `test` extends this one, in place of `@playwright/test`.
 */
import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
  type TestInfo,
  type WebError
} from '@playwright/test'
import {
  PAGE_ERROR_TYPE,
  classifyConsoleCall,
  formatConsoleLines,
  isErrorLine,
  type ConsoleLine
} from './consoleLines'

export { expect, formatConsoleLines, type ConsoleLine }

/**
 * The Vite dev client's script path.
 */
const VITE_CLIENT_PATH = '/@vite/client'

/**
 * The fixture's surface.
 */
export interface ConsoleCaptureFixture {
  /**
   * Watches a context: every page it holds or opens from now on is
   * captured. The default context and every context created on the test's
   * browser are watched already; watching one twice is a no-op.
   */
  watch(context: BrowserContext): void
  /**
   * Every line captured so far, on both lanes, in arrival order; only the
   * lines of one page when given.
   */
  lines(options?: { page?: Page }): ConsoleLine[]
  /**
   * The error lines captured so far (console `error` calls and uncaught
   * exceptions, on both lanes); only those of one page when given.
   */
  errors(options?: { page?: Page }): ConsoleLine[]
}

/**
 * Builds the capture for one test. `attach` writes the attachment and
 * `stop` makes every listener a no-op; the fixture calls both at teardown.
 *
 * @param options {object}
 * @param options.startedAt {number}   the wall-clock origin of `at`
 * @returns {ConsoleCaptureFixture & { attach: Function, stop: Function }}
 */
export function createConsoleCapture({
  startedAt
}: {
  startedAt: number
}): ConsoleCaptureFixture & {
  attach(testInfo: TestInfo): Promise<void>
  stop(): void
} {
  // Each line keeps the page it came from, for the per-page filter.
  const captured: Array<{ line: ConsoleLine; page: Page | null }> = []
  const contextLabels = new WeakMap<BrowserContext, string>()
  const pageLabels = new WeakMap<Page, string>()
  const pageCounts = new Map<string, number>()
  // The last URL each page was seen at, for the attachment's legend.
  const lastUrls = new Map<string, string>()
  let contextCount = 0
  let stopped = false

  /**
   * The label of a page, assigned on first sight in its context's order.
   *
   * @param options {object}
   * @param options.contextLabel {string}
   * @param options.page {Page}
   * @returns {string}
   */
  function labelPage({
    contextLabel,
    page
  }: {
    contextLabel: string
    page: Page
  }): string {
    const known = pageLabels.get(page)
    if (known) {
      return known
    }
    const index = pageCounts.get(contextLabel) ?? 0
    pageCounts.set(contextLabel, index + 1)
    const label = `${contextLabel}.p${index}`
    pageLabels.set(page, label)
    return label
  }

  /**
   * The source label of a line, and a note of the page's current URL.
   *
   * @param options {object}
   * @param options.contextLabel {string}
   * @param options.page {Page | null}
   * @returns {string}
   */
  function sourceOf({
    contextLabel,
    page
  }: {
    contextLabel: string
    page: Page | null
  }): string {
    if (!page) {
      return `${contextLabel}.worker`
    }
    const label = labelPage({ contextLabel, page })
    lastUrls.set(label, page.url())
    return label
  }

  /**
   * Records one console message.
   *
   * @param options {object}
   * @param options.contextLabel {string}
   * @param options.message {ConsoleMessage}
   */
  function onConsole({
    contextLabel,
    message
  }: {
    contextLabel: string
    message: ConsoleMessage
  }): void {
    if (stopped) {
      return
    }
    const page = message.page()
    // A JSHandle's string form is its preview: the value itself for a
    // primitive, a devtools-style rendering for an object.
    const previews = message.args().map(arg => arg.toString())
    const { lane, ns, text } = classifyConsoleCall({
      previews,
      fallbackText: message.text()
    })
    // The Vite dev client wraps `console.warn` and `console.error` to forward
    // them to the server, so those calls report its script as their origin.
    // That location names no caller, so it is left out.
    const reported = message.location().url
    const url = reported.endsWith(VITE_CLIENT_PATH) ? '' : reported
    captured.push({
      page,
      line: {
        at: message.timestamp() - startedAt,
        source: sourceOf({ contextLabel, page }),
        type: message.type(),
        lane,
        ...(ns === undefined ? {} : { ns }),
        text,
        ...(url ? { url } : {})
      }
    })
  }

  /**
   * Records one uncaught page exception, on the bare lane: the logger seam
   * never throws one.
   *
   * @param options {object}
   * @param options.contextLabel {string}
   * @param options.webError {WebError}
   */
  function onWebError({
    contextLabel,
    webError
  }: {
    contextLabel: string
    webError: WebError
  }): void {
    if (stopped) {
      return
    }
    const page = webError.page()
    const error = webError.error()
    captured.push({
      page,
      line: {
        at: Date.now() - startedAt,
        source: sourceOf({ contextLabel, page }),
        type: PAGE_ERROR_TYPE,
        lane: 'bare',
        text: error.stack ?? `${error.name}: ${error.message}`
      }
    })
  }

  /**
   * The captured lines, of one page when given.
   *
   * @param page {Page | undefined}
   * @returns {ConsoleLine[]}
   */
  function linesOf(page: Page | undefined): ConsoleLine[] {
    return captured
      .filter(entry => page === undefined || entry.page === page)
      .map(entry => entry.line)
  }

  return {
    watch(context) {
      if (contextLabels.has(context)) {
        return
      }
      const contextLabel = `c${contextCount}`
      contextCount += 1
      contextLabels.set(context, contextLabel)
      for (const page of context.pages()) {
        labelPage({ contextLabel, page })
      }
      context.on('page', page => {
        labelPage({ contextLabel, page })
      })
      context.on('console', message => {
        onConsole({ contextLabel, message })
      })
      context.on('weberror', webError => {
        onWebError({ contextLabel, webError })
      })
    },
    lines(options) {
      return linesOf(options?.page)
    },
    errors(options) {
      return linesOf(options?.page).filter(isErrorLine)
    },
    async attach(testInfo) {
      const lines = linesOf(undefined)
      if (lines.length === 0) {
        return
      }
      const namespaced = lines.filter(line => line.lane === 'ns').length
      const legend = [...lastUrls.entries()].map(
        ([label, url]) => `#   ${label} last seen at ${url}`
      )
      const header = [
        `# ${lines.length} console lines: ${namespaced} ns, ` +
          `${lines.length - namespaced} bare. ` +
          'Columns: offset, source page, console type, lane, text.',
        '# Sources: c0 is the default context, c1 onward the contexts the ' +
          'test created, in order.',
        ...legend
      ]
      await testInfo.attach('console', {
        body: `${header.join('\n')}\n${formatConsoleLines(lines)}\n`,
        contentType: 'text/plain'
      })
    },
    stop() {
      stopped = true
    }
  }
}

/**
 * Watches every context created on `browser` until the returned function
 * is called.
 *
 * @param options {object}
 * @param options.browser {Browser}
 * @param options.capture {ConsoleCaptureFixture}
 * @returns {() => void}   stops watching new contexts
 */
function watchNewContexts({
  browser,
  capture
}: {
  browser: Browser
  capture: ConsoleCaptureFixture
}): () => void {
  function onContext(context: BrowserContext): void {
    capture.watch(context)
  }
  browser.on('context', onContext)
  return function unwatch(): void {
    browser.off('context', onContext)
  }
}

/**
 * The Playwright `test` with the `consoleCapture` fixture. The fixture is
 * automatic, so every test on this `test` gets its console lines attached on
 * failure without asking for the fixture; a spec asks for it by name only to
 * read the lines itself.
 */
export const test = base.extend<{ consoleCapture: ConsoleCaptureFixture }>({
  consoleCapture: [
    async ({ browser, context }, use, testInfo) => {
      const capture = createConsoleCapture({ startedAt: Date.now() })
      capture.watch(context)
      const unwatch = watchNewContexts({ browser, capture })
      await use(capture)
      unwatch()
      capture.stop()
      if (testInfo.status !== testInfo.expectedStatus) {
        await capture.attach(testInfo)
      }
    },
    { auto: true }
  ]
})
