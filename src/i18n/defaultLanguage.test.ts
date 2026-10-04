import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  localStorage.clear()
})

it('starts in Spanish on an English browser and preserves an explicit choice', async () => {
  vi.stubEnv('VITE_DEFAULT_LANGUAGE', '')
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US'])
  localStorage.clear()
  vi.resetModules()
  const { default: first } = await import('./index')
  expect(first.language).toBe('es')
  expect(document.documentElement.lang).toBe('es')
  localStorage.setItem('fw-ui-language', 'en')
  vi.resetModules()
  const { default: returning } = await import('./index')
  expect(returning.language).toBe('en')
})
