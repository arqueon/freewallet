/**
 * The revoke-access confirmation names the wallet collections the app holds
 * a share of, and says nothing about shares when it holds none.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { RevokeAppDialog } from './RevokeAppDialog'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('RevokeAppDialog', () => {
  // Cartera UDGPlus arranca en español; estas aserciones son del texto en inglés.
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })

  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  /**
   * Renders the open dialog and returns the text of its content.
   *
   * @param options {object}
   * @param [options.sharedCollections] {string[]}
   * @returns {Promise<string>}
   */
  async function renderDialog({
    sharedCollections
  }: {
    sharedCollections?: string[]
  }): Promise<string> {
    await act(async () => {
      root.render(
        <RevokeAppDialog
          open
          appName="Notes"
          sharedCollections={sharedCollections}
          revoking={false}
          error={false}
          onCancel={() => undefined}
          onConfirm={() => undefined}
        />
      )
    })
    // MUI portals the dialog to the document body.
    return document.body.querySelector('[role="dialog"]')?.textContent ?? ''
  }

  it('names the shared collections the revoke un-shares', async () => {
    const text = await renderDialog({
      sharedCollections: ['Verifiable Credentials', 'Contacts']
    })
    expect(text).toContain(
      'Notes also holds a share of these wallet collections'
    )
    expect(text).toContain('Verifiable Credentials, Contacts')
  })

  it('says nothing about shares for an app holding none', async () => {
    const text = await renderDialog({})
    expect(text).toContain('Revoking access removes Notes')
    expect(text).not.toContain('holds a share')
  })
})
