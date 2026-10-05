/**
 * The pure half of the console-capture e2e fixture (`consoleCapture.ts`):
 * sorting one browser console message into its lane, rendering its text, and
 * formatting a test's lines for an attachment or an assertion message.
 *
 * Two lanes. A line from the app's `@interop/logger` seam (`src/lib/log.ts`)
 * is the namespaced lane: the package's console sink calls
 * `console[level]('%s [%s] %s', time, ns, msg, ...extras)`, so its first
 * argument is that exact format string and its third is the namespace
 * (`fw:*`, `wc`, `sync`, `request`). Every other line is the bare lane: the
 * CHAPI polyfill, `public/wallet-worker.html`, RxDB, React, and any other
 * dependency that calls `console.*` directly. The bare lane is kept, never
 * filtered away, since the CHAPI-flow errors a capture exists to surface are
 * mostly bare.
 *
 * Playwright's `ConsoleMessage.text()` joins the argument previews with
 * spaces and does no `%s` substitution, so a namespaced line's text reads
 * `%s [%s] %s 12:00:00.000 fw:session ...`. The lane is therefore decided on
 * the argument previews, by equality with the whole format string, and the
 * text is rendered here the way devtools shows it. Nothing matches a
 * message substring at a fixed position: a change to the sink's format
 * moves its lines into the bare lane, where they are still kept.
 *
 * Console text is untrusted page output. It is shown to a reader and never
 * acted on.
 */

/**
 * The format string `@interop/logger`'s console sink passes as its first
 * argument.
 */
export const LOGGER_CONSOLE_FORMAT = '%s [%s] %s'

/**
 * The console type the fixture records an uncaught page exception under.
 */
export const PAGE_ERROR_TYPE = 'pageerror'

/**
 * One captured console line.
 */
export interface ConsoleLine {
  /**
   * Milliseconds since the capture started.
   */
  at: number
  /**
   * The page the line came from, as the fixture labels it: `c<n>.p<m>`, the
   * m-th page of the n-th watched context (`c0` is the test's default
   * context), or `c<n>.worker` for a worker.
   */
  source: string
  /**
   * The console type (`log`, `warning`, `error`, ...), or
   * {@link PAGE_ERROR_TYPE} for an uncaught exception.
   */
  type: string
  /**
   * `ns` for a line from the app's logger seam, `bare` for every other.
   */
  lane: 'ns' | 'bare'
  /**
   * The logger namespace, on the namespaced lane only.
   */
  ns?: string
  /**
   * The rendered text, `%s` placeholders substituted.
   */
  text: string
  /**
   * The script URL the console call came from, when the browser reports
   * one.
   */
  url?: string
}

/**
 * Substitutes printf-style placeholders in the first preview with the
 * previews after it, the way the devtools console renders the call, and
 * appends the previews no placeholder consumed. `%c` consumes its argument
 * (a CSS string) and renders nothing; `%%` renders one `%`.
 *
 * @param previews {string[]}   the argument previews, in call order
 * @returns {string}
 */
export function renderConsoleArgs(previews: string[]): string {
  if (previews.length === 0) {
    return ''
  }
  const [format, ...rest] = previews
  let next = 0
  const head = format.replace(/%[sdifoOc%]/g, function substitute(token) {
    if (token === '%%') {
      return '%'
    }
    if (next >= rest.length) {
      return token
    }
    const value = rest[next]
    next += 1
    return token === '%c' ? '' : value
  })
  return [head, ...rest.slice(next)].join(' ')
}

/**
 * Sorts one console call into its lane and renders its text.
 *
 * @param options {object}
 * @param options.previews {string[]}   the argument previews, in call order
 * @param options.fallbackText {string}   Playwright's `text()`, used when no
 *   preview is available
 * @returns {{ lane: 'ns' | 'bare', ns?: string, text: string }}
 */
export function classifyConsoleCall({
  previews,
  fallbackText
}: {
  previews: string[]
  fallbackText: string
}): { lane: 'ns' | 'bare'; ns?: string; text: string } {
  if (previews.length === 0) {
    return { lane: 'bare', text: fallbackText }
  }
  const text = renderConsoleArgs(previews)
  if (previews[0] === LOGGER_CONSOLE_FORMAT && previews.length >= 4) {
    return { lane: 'ns', ns: previews[2], text }
  }
  return { lane: 'bare', text }
}

/**
 * Whether a line is an error: a console `error` call or an uncaught page
 * exception, on either lane.
 *
 * @param line {ConsoleLine}
 * @returns {boolean}
 */
export function isErrorLine(line: ConsoleLine): boolean {
  return line.type === 'error' || line.type === PAGE_ERROR_TYPE
}

/**
 * Formats lines one per row, in arrival order: the offset since the capture
 * started, the source page, the console type, the lane, the text, and for a
 * bare line the script URL. A multi-line text (a stack) keeps its line
 * breaks, indented under its row.
 *
 * @param lines {ConsoleLine[]}
 * @returns {string}
 */
export function formatConsoleLines(lines: ConsoleLine[]): string {
  return lines
    .map(function formatLine(line) {
      const at = `+${(line.at / 1000).toFixed(3)}s`
      const where = line.lane === 'bare' && line.url ? `  (${line.url})` : ''
      const text = line.text.split('\n').join('\n    ')
      return `${at} ${line.source} ${line.type} ${line.lane} ${text}${where}`
    })
    .join('\n')
}
