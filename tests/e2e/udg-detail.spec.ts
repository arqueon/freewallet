import { test, expect } from '@playwright/test'
import { startCertoExchange } from './helpers/certoExchange'

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 }
]) {
  for (const mode of ['light', 'dark'] as const) {
    const size = viewport.width === 390 ? 'mobile' : 'desktop'
    test(`UDG complete badge: ${size} ${mode}`, async ({ page }) => {
      test.setTimeout(90000)
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: mode })
      const exchange = await startCertoExchange({ rich: true })
      const failures: string[] = []
      page.on('pageerror', error => failures.push(error.message))
      try {
        await page.route(
          url => !['localhost', '127.0.0.1'].includes(url.hostname),
          async route => {
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
        await page.goto('/#/guest-login')
        await page.getByRole('button', { name: 'Entrar como invitado' }).click()
        await expect(page).toHaveURL(/#\/dashboard/)
        await page.goto(
          `/#/request?request=${encodeURIComponent(exchange.exchangeUrl)}`
        )
        await page
          .getByRole('button', { name: 'Abrir oferta', exact: true })
          .click()
        await page
          .getByRole('button', { name: 'Identificarme y recibir credencial' })
          .click()
        const card = page.getByTestId('udg-credential')
        await expect(card).toBeVisible({ timeout: 30000 })
        await expect(
          card.getByText('Ana García (persona ficticia)', { exact: true })
        ).toBeVisible()
        await expect(
          card.getByText('Universidad de Guadalajara › UDGPlus')
        ).toBeVisible()
        await expect(card.getByText('2026-B', { exact: true })).toBeVisible()
        await expect(
          card.getByText('Arizona State University', { exact: true })
        ).toBeVisible()
        await expect(
          card.getByText('Nivel alcanzado: Avanzado', { exact: true })
        ).toBeVisible()
        await expect(
          card.getByText('Nivel requerido: Competente', { exact: true })
        ).toBeVisible()
        await expect(
          card.getByText('Nivel alcanzado: Sólido', { exact: true })
        ).toBeVisible()
        await expect(
          card.getByText('Nivel 6 del MNC', { exact: true })
        ).toBeVisible()
        await expect(
          card.getByText('español de México', { exact: true })
        ).toBeVisible()
        await expect(
          card.getByRole('link', { name: 'Ver la ficha', exact: true })
        ).toHaveAttribute('href', 'https://example.org/fichas/fuentes/v1')
        await expect(
          card.getByRole('heading', {
            name: 'Verificación y validación de la credencial'
          })
        ).not.toBeVisible()
        await card.getByRole('button', { name: /Ver comprobaciones/ }).click()
        await expect(
          card.getByText('tiene una firma válida', { exact: false })
        ).toBeVisible({ timeout: 30000 })
        await expect(
          card.getByText('no figura en un registro de emisores conocido', {
            exact: true
          })
        ).toBeVisible()
        await card.getByRole('button', { name: /Ver comprobaciones/ }).click()
        await page
          .getByRole('button', { name: 'Guardar en mi cartera', exact: true })
          .click()
        await expect(page).toHaveURL(/#\/dashboard/)
        await page
          .getByRole('heading', {
            name: 'Credencial de evaluación de fuentes',
            exact: true
          })
          .click()
        await expect(
          card.getByRole('heading', {
            name: 'Evaluación crítica de fuentes digitales'
          })
        ).toBeVisible()
        const badge = card.getByRole('img', {
          name: 'Insignia de Evaluación crítica de fuentes digitales'
        })
        await expect
          .poll(() =>
            badge.evaluate(
              (img: HTMLImageElement) => img.complete && img.naturalWidth > 0
            )
          )
          .toBe(true)
        await expect
          .poll(() =>
            card
              .getByRole('img', {
                name: 'Universidad de Guadalajara',
                exact: true
              })
              .evaluate(
                (img: HTMLImageElement) => img.complete && img.naturalWidth > 0
              )
          )
          .toBe(true)
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth
            )
          )
          .toBe(true)
        await expect(card).not.toContainText('did:key:')
        await expect(page.locator('.MuiSnackbar-root')).toHaveCount(0, {
          timeout: 10000
        })
        await expect(page.locator('.MuiAppBar-root')).toHaveCSS(
          'background-color',
          'rgb(0, 66, 123)'
        )
        await page.evaluate(async () => {
          window.scrollTo(0, 0)
          await new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          )
        })
        await page.screenshot({
          path: `/tmp/udg-ficha-${size}-${mode}.png`,
          fullPage: true,
          animations: 'disabled'
        })
        await card.getByRole('button', { name: /Ver comprobaciones/ }).click()
        await page.evaluate(async () => {
          window.scrollTo(0, 0)
          await new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          )
        })
        await page.screenshot({
          path: `/tmp/udg-ficha-${size}-${mode}-checks.png`,
          fullPage: true,
          animations: 'disabled'
        })
        expect(exchange.state()).toMatchObject({
          posts: 2,
          used: true,
          verifiedHolder: true
        })
        expect(
          failures.filter(
            message =>
              !message.includes('Loading Web application window timed out')
          )
        ).toEqual([])
      } finally {
        await exchange.close()
      }
    })
  }
}

// The original signed file stays outside Git; pass its local path explicitly.
test('UDG legacy credential: local import and four visual variants', async ({
  page
}) => {
  test.skip(
    !process.env.UDG_LEGACY_CREDENTIAL,
    'Set UDG_LEGACY_CREDENTIAL to the local signed laboratory JSON'
  )
  test.setTimeout(120000)
  const { readFile } = await import('node:fs/promises')
  const raw = await readFile(process.env.UDG_LEGACY_CREDENTIAL!, 'utf8')
  const vc = JSON.parse(raw)
  // Fetch only the public verification material and images from the issuer.
  // The imported file and its identity data never leave this browser.
  await page.route(
    url => !['localhost', '127.0.0.1'].includes(url.hostname),
    async route => {
      const request = route.request()
      if (request.url().includes('registr')) {
        await route.fulfill({
          json: request.url().includes('known-did-registries') ? [] : {}
        })
      } else if (
        request.method() === 'GET' &&
        new URL(request.url()).hostname === 'microcredenciales.arqueonautis.org'
      ) {
        await route.continue()
      } else {
        await route.abort()
      }
    }
  )
  await page.goto('/#/guest-login')
  await page.getByRole('button', { name: 'Entrar como invitado' }).click()
  await expect(page).toHaveURL(/#\/dashboard/)
  await page.goto('/#/add-credential')
  await page.getByRole('textbox').fill(raw)
  await page.getByRole('button', { name: 'Añadir', exact: true }).click()
  await page.getByRole('button', { name: 'Aceptar todas', exact: true }).click()
  await expect(page).toHaveURL(/#\/dashboard/)
  await page
    .getByRole('heading', {
      name: vc.name || vc.credentialSubject.achievement.name,
      exact: true
    })
    .click()
  const card = page.getByTestId('udg-credential')
  await expect(card).toBeVisible()
  await expect(card.getByText('Curso', { exact: true })).toBeVisible()
  await expect(
    card.getByText('Vinculada a esta cartera', { exact: true })
  ).toBeVisible()
  await expect(card).not.toContainText('Criteria not specified')
  await expect(card).not.toContainText('did:')
  await expect(
    card.getByText('Créditos obtenidos', { exact: true })
  ).toHaveCount(0)
  for (const result of vc.credentialSubject.result || []) {
    const descriptor = vc.credentialSubject.achievement.resultDescription?.find(
      (entry: { id: string }) => entry.id === result.resultDescription
    )
    const level = descriptor?.rubricCriterionLevel?.find(
      (entry: { id: string }) => entry.id === result.achievedLevel
    )
    if (level?.name) {
      await expect(
        card
          .getByText(`Nivel alcanzado: ${level.name}`, { exact: true })
          .first()
      ).toBeVisible()
    }
  }
  await card.getByRole('button', { name: /Ver comprobaciones/ }).click()
  await expect(
    card.getByText('tiene una firma válida', { exact: false })
  ).toBeVisible({ timeout: 45000 })
  await card.getByRole('button', { name: /Ver comprobaciones/ }).click()
  await expect(page.locator('.MuiSnackbar-root')).toHaveCount(0, {
    timeout: 10000
  })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          )
        )
        .toBe(true)
      await page.evaluate(async () => {
        window.scrollTo(0, 0)
        await new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
      })
      await page.screenshot({
        path: `/tmp/udg-ficha-legacy-${width === 390 ? 'mobile' : 'desktop'}-${mode}.png`,
        fullPage: true,
        animations: 'disabled'
      })
    }
  }
})

test('another issuer retains the original credential layout', async ({
  page
}) => {
  const { default: fixture } = await import('../fixtures/udg-ob3.json', {
    with: { type: 'json' }
  })
  const vc = {
    ...fixture,
    issuer: { id: 'did:example:other', name: 'Otra institución' }
  }
  await page.route(
    url => !['localhost', '127.0.0.1'].includes(url.hostname),
    route => route.abort()
  )
  await page.goto('/#/guest-login')
  await page.getByRole('button', { name: 'Entrar como invitado' }).click()
  await expect(page).toHaveURL(/#\/dashboard/)
  await page.goto('/#/add-credential')
  await page.getByRole('textbox').fill(JSON.stringify(vc))
  await page.getByRole('button', { name: 'Añadir', exact: true }).click()
  await page.getByRole('button', { name: 'Aceptar todas', exact: true }).click()
  await expect(page).toHaveURL(/#\/dashboard/)
  await page.getByRole('heading', { name: vc.name, exact: true }).click()
  await expect(page.getByTestId('udg-credential')).toHaveCount(0)
  await expect(
    page.getByText('Otra institución', { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('heading', {
      name: 'Verificación y validación de la credencial'
    })
  ).toBeVisible()
  await expect(
    page.getByText('Nivel alcanzado: Avanzado', { exact: true })
  ).toBeVisible()
})
