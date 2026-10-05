/**
 * The server-observed "Created by" caption, one case per resolution arm:
 * each says the server observed it, and only a listed party is linked.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import type { CreatedByAttribution } from '@/lib/collectionAttribution'
import { ObservedCreatorAttribution } from './ObservedCreatorAttribution'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/**
 * Renders the caption for one resolution.
 *
 * @param attribution {CreatedByAttribution}
 * @returns {Promise<{ container: HTMLElement, unmount: () => Promise<void> }>}
 */
async function mount(attribution: CreatedByAttribution) {
  const container = document.createElement('div')
  const root: Root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ObservedCreatorAttribution attribution={attribution} />
      </MemoryRouter>
    )
  })
  return {
    container,
    unmount: () =>
      act(async () => {
        root.unmount()
      })
  }
}

describe('ObservedCreatorAttribution', () => {
  // Cartera UDGPlus arranca en español; estas aserciones son del texto en inglés.
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('says the server recorded no creator', async () => {
    const view = await mount({ kind: 'not-recorded' })
    expect(view.container.textContent).toBe(
      'Created by: not recorded by the server'
    )
    await view.unmount()
  })

  it('names the wallet itself', async () => {
    const view = await mount({ kind: 'wallet' })
    expect(view.container.textContent).toBe(
      'Created by this wallet, as the server observed it'
    )
    await view.unmount()
  })

  it('links a listed party to its application detail page', async () => {
    const view = await mount({
      kind: 'party',
      name: 'Editor',
      resourceId: 'entry-1'
    })
    expect(view.container.textContent).toBe(
      'Created by Editor, as the server observed it'
    )
    expect(view.container.querySelector('a')?.getAttribute('href')).toBe(
      '/applications/entry-1'
    )
    await view.unmount()
  })

  it('shows an unknown DID shortened, as plain text', async () => {
    const view = await mount({
      kind: 'unknown',
      name: 'did:key:z6MkUnkn...terial'
    })
    expect(view.container.textContent).toBe(
      'Created by did:key:z6MkUnkn...terial, as the server observed it'
    )
    expect(view.container.querySelector('a')).toBeNull()
    await view.unmount()
  })
})
