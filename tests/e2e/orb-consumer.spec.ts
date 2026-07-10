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
