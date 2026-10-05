// @vitest-environment node
/**
 * The console-capture e2e fixture's pure half (`tests/shared/consoleLines.ts`):
 * the two lanes, the devtools-style rendering of a printf call, and the
 * attachment format.
 */
import { describe, expect, it } from 'vitest'
import {
  LOGGER_CONSOLE_FORMAT,
  PAGE_ERROR_TYPE,
  classifyConsoleCall,
  formatConsoleLines,
  isErrorLine,
  renderConsoleArgs,
  type ConsoleLine
} from '../shared/consoleLines'

describe('renderConsoleArgs', () => {
  it('substitutes placeholders and appends the unconsumed previews', () => {
    expect(
      renderConsoleArgs([
        LOGGER_CONSOLE_FORMAT,
        '12:00:00.000',
        'wc',
        'hi',
        '{a: 1}'
      ])
    ).toBe('12:00:00.000 [wc] hi {a: 1}')
  })

  it('drops a %c style argument and keeps %%', () => {
    expect(renderConsoleArgs(['%cstyled 100%%', 'color: red'])).toBe(
      'styled 100%'
    )
  })

  it('leaves a placeholder with no argument in place', () => {
    expect(renderConsoleArgs(['%s and %s', 'one'])).toBe('one and %s')
  })
})

describe('classifyConsoleCall', () => {
  it('puts a logger-seam call on the namespaced lane', () => {
    expect(
      classifyConsoleCall({
        previews: [
          LOGGER_CONSOLE_FORMAT,
          '12:00:00.000',
          'fw:session',
          'Hello there'
        ],
        fallbackText: 'unused'
      })
    ).toEqual({
      lane: 'ns',
      ns: 'fw:session',
      text: '12:00:00.000 [fw:session] Hello there'
    })
  })

  it('keeps a bare line, even one carrying a bracketed token', () => {
    expect(
      classifyConsoleCall({
        previews: ['[interop:logger] a sink threw', 'Error: x'],
        fallbackText: 'unused'
      })
    ).toEqual({ lane: 'bare', text: '[interop:logger] a sink threw Error: x' })
  })

  it('falls back to the message text when there are no previews', () => {
    expect(classifyConsoleCall({ previews: [], fallbackText: 'raw' })).toEqual({
      lane: 'bare',
      text: 'raw'
    })
  })
})

describe('formatConsoleLines and isErrorLine', () => {
  const lines: ConsoleLine[] = [
    {
      at: 1234,
      source: 'c1.p0',
      type: 'warning',
      lane: 'ns',
      ns: 'wc',
      text: '12:00:00.000 [wc] slow',
      url: 'http://localhost/node_modules/@interop/logger/dist/core.js'
    },
    {
      at: 2000,
      source: 'c1.p0',
      type: 'error',
      lane: 'bare',
      text: 'polyfill failed',
      url: 'http://localhost/js/credential-handler-polyfill.min.js'
    },
    {
      at: 2500,
      source: 'c1.p0',
      type: PAGE_ERROR_TYPE,
      lane: 'bare',
      text: 'Error: boom\n    at f (x.js:1:1)'
    }
  ]

  it('labels each row with its source, type, and lane', () => {
    expect(formatConsoleLines(lines)).toBe(
      [
        '+1.234s c1.p0 warning ns 12:00:00.000 [wc] slow',
        '+2.000s c1.p0 error bare polyfill failed  ' +
          '(http://localhost/js/credential-handler-polyfill.min.js)',
        '+2.500s c1.p0 pageerror bare Error: boom',
        '        at f (x.js:1:1)'
      ].join('\n')
    )
  })

  it('counts console errors and page exceptions on both lanes', () => {
    expect(lines.filter(isErrorLine).map(line => line.type)).toEqual([
      'error',
      PAGE_ERROR_TYPE
    ])
  })
})
