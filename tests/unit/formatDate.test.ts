import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from '@/lib/viewMappers/formatDate'

describe('formatDate', () => {
  it('formats an ISO date into a human-readable form', () => {
    // Noon UTC keeps the calendar day stable across test-runner timezones.
    const formatted = formatDate({
      isoDate: '2025-06-15T12:00:00Z',
      locale: 'en-US'
    })
    expect(formatted).toMatch(/Jun\s+\d{1,2},\s+2025/)
  })

  it('honors an explicit locale', () => {
    const formatted = formatDate({
      isoDate: '2025-06-15T12:00:00Z',
      locale: 'es-ES'
    })
    expect(formatted).toMatch(/2025/)
  })

  it('renders a civil day carried as midnight UTC on that same day', () => {
    // An activity date: 7 September, also for a viewer in Mexico (UTC-6),
    // where the instant itself falls on the evening of 6 September.
    const previousTz = process.env.TZ
    process.env.TZ = 'America/Mexico_City'
    try {
      const isoDate = '2026-09-07T00:00:00Z'
      expect(formatDate({ isoDate, locale: 'es-MX', civil: true })).toMatch(
        /^7 /
      )
      expect(formatDate({ isoDate, locale: 'es-MX' })).toMatch(/^6 /)
    } finally {
      process.env.TZ = previousTz
    }
  })

  it('returns an empty string for falsy input', () => {
    expect(formatDate({ isoDate: '', locale: 'en-US' })).toBe('')
  })

  it('falls back to the raw string on an unparseable date', () => {
    expect(formatDate({ isoDate: 'not-a-date', locale: 'en-US' })).toBe(
      'not-a-date'
    )
  })
})

describe('formatDateTime', () => {
  it('formats a Date into a medium date with short time', () => {
    const formatted = formatDateTime({
      date: new Date('2025-06-15T12:00:00Z'),
      locale: 'en-US'
    })
    expect(formatted).toMatch(/2025/)
  })
})
