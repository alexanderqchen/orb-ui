import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  const errors: string[] = []
  const requests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => requests.push(request.url()))
  await page.goto('http://127.0.0.1:5174')
  assert.ok((await page.locator('.mode').textContent())?.includes('No AWS calls'))
  await page.getByRole('button', { name: 'Start local session', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'speaking' }).waitFor()
  await page.getByRole('button', { name: 'Simulate interruption', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'listening' }).waitFor()
  await page.getByRole('button', { name: 'Replay fixture', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'speaking' }).waitFor()
  await page.getByRole('button', { name: 'Simulate connection error', exact: true }).click()
  await page.getByRole('alert').waitFor()
  await page.getByRole('button', { name: 'Start a new session', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'listening' }).waitFor()
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole('button', { name: 'Stop session', exact: true }).click()
    await page.getByRole('button', { name: 'Start local session', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'listening' }).waitFor()
  }
  await page.getByRole('status').filter({ hasText: 'speaking' }).waitFor()
  await mkdir(new URL('../outputs/', import.meta.url), { recursive: true })
  await page.screenshot({
    path: new URL('../outputs/desktop.png', import.meta.url).pathname,
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Stop session', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Start local session', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('status').filter({ hasText: 'speaking' }).waitFor()
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
  )
  await page.screenshot({
    path: new URL('../outputs/mobile.png', import.meta.url).pathname,
    fullPage: true,
  })
  await page.goto('about:blank')
  await page.goBack()
  await page.getByRole('button', { name: 'Start local session', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'listening' }).waitFor()
  await page.getByRole('button', { name: 'Stop session', exact: true }).click()

  // Synthetic live-mode responses verify browser permission cleanup without opening Bedrock.
  await page.route('**/api/nova-session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'synthetic-not-a-provider-credential', mode: 'live' }),
    }),
  )
  let socketsOpened = 0
  page.on('websocket', (socket) => {
    if (socket.url().includes('/socket.io/')) socketsOpened++
  })
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Synthetic microphone permission denied', 'NotAllowedError')
    }
  })
  await page.getByRole('button', { name: 'Start local session', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'permission denied' }).waitFor()
  assert.equal(socketsOpened, 0, 'permission denial must happen before a Bedrock socket starts')

  await page.evaluate(() => {
    const context = new AudioContext()
    const stream = context.createMediaStreamDestination().stream
    const state = { context, stream, release: null as (() => void) | null }
    const testWindow = window as typeof window & { novaDelayedPermission?: typeof state }
    testWindow.novaDelayedPermission = state
    navigator.mediaDevices.getUserMedia = () =>
      new Promise<MediaStream>((resolve) => {
        state.release = () => resolve(stream)
      })
  })
  await page.getByRole('button', { name: 'Start a new session', exact: true }).click()
  await page.waitForFunction(() => {
    const state = (
      window as typeof window & { novaDelayedPermission?: { release: (() => void) | null } }
    ).novaDelayedPermission
    return Boolean(state?.release)
  })
  await page.getByRole('button', { name: 'Stop session', exact: true }).click()
  await page.evaluate(() => {
    const state = (
      window as typeof window & { novaDelayedPermission?: { release: (() => void) | null } }
    ).novaDelayedPermission
    state?.release?.()
  })
  await page.waitForFunction(() => {
    const state = (window as typeof window & { novaDelayedPermission?: { stream: MediaStream } })
      .novaDelayedPermission
    return state?.stream.getTracks().every((track) => track.readyState === 'ended')
  })
  assert.equal(socketsOpened, 0, 'a late permission result must be stopped without opening Bedrock')
  await page.evaluate(async () => {
    const testWindow = window as typeof window & {
      novaDelayedPermission?: { context: AudioContext }
    }
    await testWindow.novaDelayedPermission?.context.close()
    delete testWindow.novaDelayedPermission
  })
  await page.unroute('**/api/nova-session')
  await page.getByRole('button', { name: 'Start local session', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'listening' }).waitFor()
  await page.getByRole('button', { name: 'Stop session', exact: true }).click()
  assert.deepEqual(errors, [])
  assert.deepEqual(
    requests.filter(
      (url) => !url.startsWith('http://127.0.0.1:5174') && !url.startsWith('ws://127.0.0.1:5174'),
    ),
    [],
  )
  console.info(
    'PASS: start, stop, interruption, replay, error/reconnect, rapid restart, keyboard, mobile, navigation/back, permission denial and late-permission cleanup; no console errors or external requests.',
  )
} finally {
  await browser.close()
}
