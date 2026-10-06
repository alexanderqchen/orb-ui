import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { integrations, recipes } from '../../demo/expansion/catalog'

const origin = process.env.ORB_PREVIEW_URL ?? 'http://127.0.0.1:4174'
const observations = new WeakMap<Page, ReturnType<typeof watch>>()
if (process.env.ORB_PREVIEW_URL) test.use({ trace: 'off' })
test.beforeEach(async ({ page }) => {
  if (process.env.ORB_PREVIEW_ACCESS_URL) await page.goto(process.env.ORB_PREVIEW_ACCESS_URL)
  observations.set(page, watch(page))
})
test.afterEach(async ({ page }) => {
  expect(observations.get(page)).toEqual({ errors: [], providerRequests: [] })
})
function watch(page: Page) {
  const errors: string[] = []
  const providerRequests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      /retell|hume|deepgram|cartesia|bedrock|agora|openai|generativelanguage|cognitiveservices|amazonaws|voicelive/.test(
        url.hostname,
      ) ||
      url.pathname.startsWith('/api/')
    )
      providerRequests.push(request.url())
  })
  return { errors, providerRequests }
}

for (const [slug] of integrations) {
  test(`${slug}: canonical content and simulated start/interrupt/error/reconnect/stop`, async ({
    page,
  }) => {
    const observed = watch(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${origin}/docs/adapters/${slug}`)
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `https://orb-ui.com/docs/adapters/${slug}`,
    )
    await expect(page.locator('iframe')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.goto(`${origin}/demos/integrations/?provider=${slug}`)
    await page.getByRole('button', { name: 'Start simulation', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('listening')
    await page.getByRole('button', { name: 'Interrupt', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('interrupted')
    await page.getByRole('button', { name: 'Simulate error', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('error')
    await page.getByRole('button', { name: 'Reconnect simulation', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('listening')
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('idle')
    await page.getByRole('button', { name: 'Start simulation', exact: true }).dblclick()
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await page.goto(`${origin}/docs/recipes`)
    await page.goBack()
    expect(observed).toEqual({ errors: [], providerRequests: [] })
  })
}

for (const [slug] of recipes) {
  test(`${slug}: canonical example and mobile keyboard preview`, async ({ page }) => {
    const observed = watch(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${origin}/docs/recipes/${slug}`)
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.locator('iframe')).toBeVisible()
    await expect(page.locator('.copy-code').first()).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.goto(`${origin}/demos/recipes/?recipe=${slug}`)
    await expect(page.locator('.recipe-demo')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()
    await page.getByLabel('Recipe', { exact: true }).selectOption('push-to-talk')
    await page.getByLabel('Recipe', { exact: true }).selectOption(slug)
    await page.goto(`${origin}/docs/recipes`)
    await page.goBack()
    expect(observed).toEqual({ errors: [], providerRequests: [] })
  })
}

test('composer preserves editable dictation and handles keyboard cancellation/error/retry', async ({
  page,
}) => {
  await page.goto(`${origin}/demos/recipes/?recipe=push-to-talk`)
  await page.getByRole('button', { name: 'Try sample dictation' }).click()
  await expect(page.getByLabel('Editable message')).not.toHaveValue('')
  await page.getByLabel('Editable message').fill('Reviewed local message')
  await page.getByRole('button', { name: 'Add message' }).dblclick()
  await expect(page.getByLabel('Local messages').getByRole('listitem')).toHaveCount(1)
  const hold = page.getByRole('button', { name: 'Hold to dictate' })
  await hold.focus()
  await page.keyboard.down('Space')
  await expect(hold).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Cancel dictation' }).click()
  await page.keyboard.up('Space')
  await page.getByRole('button', { name: 'Simulate transcription error' }).click()
  await page.getByRole('button', { name: 'Retry sample dictation' }).click()
  await expect(page.getByLabel('Editable message')).not.toHaveValue('')
})

test('voice form requires review before confirming, and supports editing', async ({ page }) => {
  await page.goto(`${origin}/demos/recipes/?recipe=voice-form`)
  await page.getByRole('button', { name: 'Start voice fill' }).click()
  await expect(page.getByRole('button', { name: 'Review booking' })).toBeEnabled()
  await page.getByLabel('Booking name').fill('Reviewed name')
  await page.getByRole('button', { name: 'Review booking' }).click()
  await page.getByRole('button', { name: 'Edit details' }).click()
  await expect(page.getByLabel('Booking name')).toHaveValue('Reviewed name')
  await page.getByRole('button', { name: 'Review booking' }).click()
  await page.getByRole('button', { name: 'Confirm local booking' }).dblclick()
  await expect(page.getByRole('heading', { name: 'Local confirmation' })).toBeVisible()
})

test('document answers expose local source citations and recover from retrieval failure', async ({
  page,
}) => {
  await page.goto(`${origin}/demos/recipes/?recipe=document-qa`)
  await page.getByRole('button', { name: 'Ask by voice (fixture)', exact: true }).click()
  await expect(page.getByLabel('Answer with sources')).toBeVisible()
  await page.getByLabel('Answer with sources').getByRole('link').first().click()
  await expect(page.getByLabel('Source document')).toBeVisible()
  await page.getByRole('button', { name: 'Simulate retrieval error' }).click()
  await page.getByRole('button', { name: 'Retry voice question' }).click()
  await expect(page.getByLabel('Answer with sources')).toBeVisible()
})

test('guided onboarding applies a local tool only after review and can undo', async ({ page }) => {
  await page.goto(`${origin}/demos/recipes/?recipe=guided-onboarding`)
  await page.getByRole('button', { name: 'Guide this step' }).click()
  await expect(page.getByRole('button', { name: 'Apply local step' })).toBeEnabled()
  await page.getByRole('button', { name: 'Apply local step' }).click()
  await expect(page.getByLabel('Access preference')).toBeVisible()
  await page.getByRole('button', { name: 'Undo previous step' }).click()
  await expect(page.getByLabel('Workspace name')).toBeVisible()
})

test('language practice corrects the attempt and can repeat or retry errors', async ({ page }) => {
  await page.goto(`${origin}/demos/recipes/?recipe=language-practice`)
  await page.getByRole('button', { name: 'Practice sample' }).click()
  await expect(page.getByLabel('Practice feedback')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Repeat corrected phrase' })).toBeEnabled()
  await page.getByRole('button', { name: 'Repeat corrected phrase' }).click()
  await page.getByRole('button', { name: 'Cancel turn' }).click()
  await page.getByLabel('Simulate a feedback error next turn').check()
  await page.getByRole('button', { name: 'Practice sample' }).click()
  await expect(page.getByRole('status')).toContainText('error')
  await page.getByRole('button', { name: 'Practice sample' }).click()
  await expect(page.getByLabel('Practice feedback')).toBeVisible()
})

test('interview rehearsal advances only on save and retries the same question', async ({
  page,
}) => {
  await page.goto(`${origin}/demos/recipes/?recipe=interview-rehearsal`)
  await page.getByRole('button', { name: 'Rehearse answer' }).click()
  await expect(page.getByLabel('Story feedback')).toBeVisible()
  await page.getByRole('button', { name: 'Retry this question' }).click()
  await expect(page.getByRole('heading', { name: 'Question 1 · attempt 2' })).toBeVisible()
  await page.getByRole('button', { name: 'Rehearse answer' }).click()
  await expect(page.getByRole('button', { name: 'Save and next question' })).toBeEnabled()
  await page
    .getByRole('button', { name: 'Save and next question' })
    .evaluate((button: HTMLButtonElement) => {
      button.click()
      button.click()
    })
  await expect(page.getByRole('heading', { name: 'Question 2 · attempt 1' })).toBeVisible()
})

test('spoken search reviews filters, updates real result cards, and can undo', async ({ page }) => {
  await page.goto(`${origin}/demos/recipes/?recipe=product-search`)
  await page.getByRole('button', { name: 'Simulate spoken search' }).click()
  await expect(page.getByLabel('Proposed voice filters')).toBeVisible()
  await page.getByRole('button', { name: 'Apply heard filters' }).click()
  await expect(page.getByRole('button', { name: 'Undo voice filters' })).toBeEnabled()
  await expect(page.getByLabel('Waterproof only')).toBeChecked()
  await page.getByRole('button', { name: 'Undo voice filters' }).click()
  await expect(page.getByLabel('Waterproof only')).not.toBeChecked()
})

test('fixture narration meters local audio, follows seeking, pauses, and retries', async ({
  page,
}) => {
  const observed = watch(page)
  await page.goto(`${origin}/demos/recipes/?recipe=audio-narration`)
  await page.getByRole('button', { name: 'Play fixture' }).click()
  await expect(page.getByRole('status')).toContainText('Playing')
  await page.getByRole('button', { name: /Seek to passage 2/ }).click()
  await expect(page.locator('[aria-current="true"], mark')).not.toHaveCount(0)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const time = await page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime)
  await page.waitForTimeout(200)
  expect(await page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBe(
    time,
  )
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await page.getByRole('button', { name: 'Reset track' }).click()
  expect(observed).toEqual({ errors: [], providerRequests: [] })
})
