import { test, expect } from '@playwright/test'
import { startCertoExchange } from './helpers/certoExchange'

/**
 * Overrides the legacy English test preference: a fresh English-language
 * browser must still open this deployment in Spanish.
 */
test.use({ locale: 'en-US' })

test('Certo: holder proof, signed OB3, local persistence and Spanish detail', async ({
  page
}) => {
  test.setTimeout(120000)
  const exchange = await startCertoExchange()
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  try {
    await page.addInitScript(() => {
      if (window === window.top) {
        localStorage.removeItem('fw-ui-language')
      }
    })
    await page.route(
      url => !['localhost', '127.0.0.1'].includes(url.hostname),
      async route => {
        // Registries are deliberately empty: signature validity must not imply trust.
        if (route.request().url().includes('registr')) {
          await route.fulfill({
            json: route.request().url().includes('known-did-registries')
              ? []
              : {}
          })
        } else {
          await route.abort()
        }
      }
    )
    await page.goto('/#/signup')
    const passphrase = 'Certo-Prueba-Segura-OnlyTest-2026!'
    await page.locator('input[type="password"]').fill(passphrase)
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
    await page.locator('input[type="email"]').fill('certo-test@example.invalid')
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
    await page
      .getByRole('button', { name: 'Crear billetera', exact: true })
      .click()
    await expect(page).toHaveURL(/#\/dashboard/)
    const request = JSON.stringify({
      protocols: { vcapi: exchange.exchangeUrl }
    })
    await page.goto(`/#/request?request=${encodeURIComponent(request)}`)
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Guardar tu credencial' })
    ).toBeVisible()
    expect(exchange.state().posts).toBe(0)
    await page
      .getByRole('button', { name: 'Abrir oferta', exact: true })
      .click()
    // A document navigation drops the in-memory session; login must retain the offer.
    await page.locator('input[type="password"]').fill(passphrase)
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Identificarme y recibir credencial' })
    ).toBeEnabled()
    await page.screenshot({ path: '/tmp/udg-claim-light.png', fullPage: true })
    await page
      .getByRole('button', { name: 'Identificarme y recibir credencial' })
      .click()
    await expect(
      page.getByRole('heading', {
        name: 'Microcredencial de prueba Certo',
        exact: true
      })
    ).toBeVisible({ timeout: 30000 })
    expect(exchange.state()).toMatchObject({
      posts: 2,
      used: true,
      verifiedHolder: true
    })
    await expect(
      page.getByText('Evaluación de fuentes', { exact: true })
    ).toBeVisible()
    await expect(page.getByText('Resultado: 95', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Ver comprobaciones/ }).click()
    await expect(
      page.getByText('tiene una firma válida', { exact: false })
    ).toBeVisible({ timeout: 30000 })
    await expect(
      page.getByText('no ha sido revocada', { exact: true })
    ).toBeVisible()
    await expect(
      page.getByText('no figura en un registro de emisores conocido', {
        exact: true
      })
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Guardar en mi cartera', exact: true })
      .click()
    await expect(page).toHaveURL(/#\/dashboard/)
    await expect(
      page.getByRole('heading', {
        name: 'Panel de Cartera UDGPlus',
        exact: true
      })
    ).toBeVisible()
    await page
      .getByRole('heading', {
        name: 'Microcredencial de prueba Certo',
        exact: true
      })
      .click()
    await expect(
      page.getByText('Resultados por criterio', { exact: true })
    ).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: '/tmp/udg-detail-light.png', fullPage: true })
    await page.getByRole('button', { name: /oscuro/i }).click()
    await expect(page.locator('.MuiChip-colorWarning').first()).toHaveCSS(
      'background-color',
      'rgb(255, 183, 77)'
    )
    await page.screenshot({ path: '/tmp/udg-detail-dark.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible()
    await expect(page.locator('.MuiDrawer-docked')).toHaveCount(0)
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      )
      .toBe(true)
    await page.screenshot({
      path: '/tmp/udg-detail-mobile.png',
      fullPage: false,
      animations: 'disabled'
    })
    await page.getByRole('button', { name: /Ver comprobaciones/ }).click()
    await page
      .getByRole('heading', {
        name: 'Verificación y validación de la credencial'
      })
      .scrollIntoViewIfNeeded()
    await page.screenshot({
      path: '/tmp/udg-verification-mobile.png',
      fullPage: false,
      animations: 'disabled'
    })
    // Reopen the local replica via normal login, proving the VC was persisted.
    await page.reload()
    await page.goto('/#/login')
    await page.locator('input[type="password"]').fill(passphrase)
    await page
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click()
    await expect(
      page.getByRole('heading', {
        name: 'Microcredencial de prueba Certo',
        exact: true
      })
    ).toBeVisible()
    expect(exchange.state().posts).toBe(2)
    expect(
      failures.filter(
        message => !message.includes('Loading Web application window timed out')
      )
    ).toEqual([])
  } finally {
    await exchange.close()
  }
})

for (const format of ['json', 'url', 'lcw'] as const) {
  test(`Certo: pasted ${format} opens the same consent route without sending a proof`, async ({
    page
  }) => {
    const exchange = await startCertoExchange()
    try {
      await page.goto('/#/guest-login')
      await page.getByRole('button', { name: 'Entrar como invitado' }).click()
      await expect(page).toHaveURL(/#\/dashboard/)
      await page.goto('/#/add-credential')
      const json = JSON.stringify({
        protocols: { vcapi: exchange.exchangeUrl }
      })
      const input =
        format === 'json'
          ? json
          : format === 'url'
            ? exchange.exchangeUrl
            : `https://lcw.app/request.html?request=${encodeURIComponent(json)}`
      await page.getByRole('textbox').fill(input)
      await page.getByRole('button', { name: 'Añadir', exact: true }).click()
      await expect(
        page.getByRole('heading', { name: 'Guardar tu credencial' })
      ).toBeVisible()
      expect(exchange.state().posts).toBe(0)
      await page
        .getByRole('button', { name: 'Abrir oferta', exact: true })
        .click()
      await expect(
        page.getByRole('button', { name: 'Identificarme y recibir credencial' })
      ).toBeEnabled()
      expect(exchange.state()).toMatchObject({
        posts: 1,
        used: false,
        verifiedHolder: false
      })
      await page.getByRole('link', { name: 'Cancelar', exact: true }).click()
      expect(exchange.state().posts).toBe(1)
    } finally {
      await exchange.close()
    }
  })
}

test('Certo: the plain /request alias and a consumed offer fail without signing', async ({
  page
}) => {
  const url = 'https://issuer.example/api/exchanges/expired'
  let posts = 0
  await page.route(url, async route => {
    posts++
    await route.fulfill({ status: 410, json: {} })
  })
  await page.goto(`/request?request=${encodeURIComponent(url)}`)
  await expect(page).toHaveURL(/\/#\/request\?request=/)
  await page.getByRole('button', { name: 'Abrir oferta', exact: true }).click()
  await expect(page.getByText(/Puede haber caducado/)).toBeVisible()
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  expect(posts).toBe(1)
})

test('Certo: an offer opened in a new tab goes to the unlocked tab without asking the passphrase again', async ({
  context
}) => {
  const exchange = await startCertoExchange()
  try {
    const unlocked = await context.newPage()
    await unlocked.goto('/#/guest-login')
    await unlocked.getByRole('button', { name: 'Entrar como invitado' }).click()
    await expect(unlocked).toHaveURL(/#\/dashboard/)

    // The issuer portal's button opens a new document: no session there.
    const fresh = await context.newPage()
    const request = JSON.stringify({
      protocols: { vcapi: exchange.exchangeUrl }
    })
    await fresh.goto(`/#/request?request=${encodeURIComponent(request)}`)
    await expect(
      fresh.getByText(/ya está abierta en otra pestaña/)
    ).toBeVisible()
    await expect(fresh.locator('input[type="password"]')).toHaveCount(0)

    await expect(unlocked).toHaveURL(/#\/request\?request=/)
    await unlocked
      .getByRole('button', { name: 'Abrir oferta', exact: true })
      .click()
    await expect(
      unlocked.getByRole('button', {
        name: 'Identificarme y recibir credencial'
      })
    ).toBeEnabled()
    await expect(unlocked.locator('input[type="password"]')).toHaveCount(0)

    // The locked tab can still log in on its own.
    await fresh
      .getByRole('button', { name: 'Prefiero continuar en esta pestaña' })
      .click()
    await expect(
      fresh.getByRole('button', { name: 'Abrir oferta', exact: true })
    ).toBeEnabled()
    expect(exchange.state().posts).toBe(1)
  } finally {
    await exchange.close()
  }
})

test('Add credential offers the same QR scanner as the dashboard', async ({
  page
}) => {
  await page.goto('/#/guest-login')
  await page.getByRole('button', { name: 'Entrar como invitado' }).click()
  await expect(page).toHaveURL(/#\/dashboard/)
  await page.goto('/#/add-credential')
  await page.getByRole('button', { name: 'Escanear QR' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Escanear QR de credencial' })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
