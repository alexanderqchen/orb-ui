import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

function collectBrowserErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test('loads the built package and public adapter exports', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page)

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'orb-ui browser consumer' })).toBeVisible()
  await expect(page.getByTestId('adapter-exports')).toHaveText('ready')
  await expect(page.getByTestId('controlled-orb')).toBeVisible()
  await expect(page.getByTestId('radial-orb')).toBeVisible()
  await expect(page.getByTestId('radial-orb').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('controlled-output-volume')).toHaveText('0.70')
  expect(browserErrors).toEqual([])
})

test('runs adapter start and stop through the rendered Orb', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page)

  await page.goto('/')

  await expect(page.getByTestId('adapter-state')).toHaveText('idle')
  await page.getByRole('button', { name: 'Start voice session' }).click()

  await expect(page.getByTestId('adapter-state')).toHaveText('listening')
  await expect(page.getByTestId('adapter-input-volume')).toHaveText('0.42')
  await page.getByRole('button', { name: 'Stop voice session' }).click()

  await expect(page.getByTestId('adapter-state')).toHaveText('idle')
  await expect(page.getByTestId('adapter-input-volume')).toHaveText('0.00')
  expect(browserErrors).toEqual([])
})

test('supports passive visuals with external adapter controls', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page)

  await page.goto('/')

  await expect(page.getByTestId('external-cloud-orb')).toBeVisible()
  await expect(page.getByTestId('external-cloud-orb')).toHaveJSProperty('tagName', 'DIV')

  await page.getByRole('button', { name: 'Start externally' }).click()
  await expect(page.getByTestId('adapter-state')).toHaveText('listening')

  await page.getByRole('button', { name: 'Stop externally' }).click()
  await expect(page.getByTestId('adapter-state')).toHaveText('idle')
  expect(browserErrors).toEqual([])
})

test('uses the radial phone control for adapter lifecycle', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page)

  await page.goto('/')

  const radial = page.getByTestId('interactive-radial-orb')
  await expect(radial.locator('..').locator('canvas')).toBeVisible()
  await radial.click()
  await expect(page.getByTestId('adapter-state')).toHaveText('listening')
  await expect(radial).toHaveAttribute('aria-label', 'Toggle radial session')
  await radial.click()
  await expect(page.getByTestId('adapter-state')).toHaveText('idle')
  expect(browserErrors).toEqual([])
})

test('applies global defaults, slots, responsive size, and CSS theme variables', async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page)

  await page.goto('/')

  const orb = page.getByTestId('css-variable-orb')
  await expect(orb).toHaveClass(/fixture-brand-orb/)
  await expect(orb).toHaveAttribute('data-orb-ui-preset', 'calm')
  await expect(orb.locator('[data-orb-ui-slot="surface"]')).toHaveClass(/fixture-brand-surface/)
  await expect(orb).toHaveCSS('width', '180px')
  await expect(orb.locator('[data-orb-ui-slot="surface"]')).toHaveCSS('width', '126px')
  expect(browserErrors).toEqual([])
})

test('keeps adapter lifecycle and normalized activity in a custom renderer', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page)

  await page.goto('/')

  const control = page.getByTestId('custom-renderer-control')
  await expect(control).toHaveText('idle:0.00')
  await expect(control.locator('..')).toHaveAttribute('data-orb-ui-theme', 'custom')

  await control.click()
  await expect(control).toHaveText('listening:0.42')
  await control.click()
  await expect(control).toHaveText('idle:0.00')
  expect(browserErrors).toEqual([])
})

test('keeps Cloud visible through live customization and still enters on a new session', async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page)
  await page.goto('/')
  const cloud = page.getByTestId('continuous-cloud')
  const surface = cloud.locator('canvas')
  await expect(surface).toHaveCSS('opacity', '1')
  // Wait for the real connection entrance to settle before changing visual configuration.
  await expect
    .poll(() =>
      surface.evaluate((element) => Number(element.style.transform.match(/scale\(([^)]+)\)/)?.[1])),
    )
    .toBeGreaterThan(1.1)
  await page.waitForTimeout(1800)

  for (const control of ['cloud-preset', 'cloud-size', 'cloud-color']) {
    const frames = await page.evaluate(async (testId) => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        '[data-testid="continuous-cloud"] canvas',
      )!
      const measurements: Array<{ scale: number; opacity: number }> = []
      const started = performance.now()
      document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!.click()
      await new Promise<void>((resolve) => {
        const sample = () => {
          measurements.push({
            scale: Number(canvas.style.transform.match(/scale\(([^)]+)\)/)?.[1]),
            opacity: Number(canvas.style.opacity),
          })
          if (performance.now() - started >= 650) resolve()
          else requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })
      return measurements
    }, control)
    expect(frames.length).toBeGreaterThan(3)
    expect(Math.min(...frames.map((frame) => frame.scale)), control).toBeGreaterThan(1)
    expect(Math.min(...frames.map((frame) => frame.opacity)), control).toBeGreaterThan(0.99)
  }

  await page.getByRole('button', { name: 'Stop cloud', exact: true }).click()
  await expect
    .poll(() => surface.evaluate((element) => Number(element.style.opacity)))
    .toBeLessThan(0.01)
  await page.getByRole('button', { name: 'Restart cloud', exact: true }).click()
  await expect
    .poll(() => surface.evaluate((element) => Number(element.style.opacity)))
    .toBeGreaterThan(0.99)
  expect(browserErrors).toEqual([])
})
