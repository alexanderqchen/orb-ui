import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = resolve(root, 'demo/public/og-image-v2.jpg')

const browser = await chromium.launch({
  ...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }),
  headless: true,
})
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
})

await page.setContent(`
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <style>
        * { box-sizing: border-box; }

        html,
        body {
          height: 100%;
          margin: 0;
          overflow: hidden;
          width: 100%;
        }

        body {
          background: #090a0b;
          color: #f7f7f7;
          font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .card {
          background:
            radial-gradient(circle at 88% 12%, rgba(77, 163, 255, 0.16), transparent 34%),
            radial-gradient(circle at 55% 105%, rgba(71, 98, 158, 0.1), transparent 34%),
            #090a0b;
          height: 630px;
          overflow: hidden;
          position: relative;
          width: 1200px;
        }

        .grid {
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.022) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.022) 1px, transparent 1px);
          background-size: 54px 54px;
          inset: 0;
          mask-image: linear-gradient(to bottom, black, transparent 90%);
          opacity: 0.5;
          position: absolute;
        }

        .topbar {
          align-items: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.075);
          display: flex;
          height: 76px;
          justify-content: space-between;
          padding: 0 58px;
          position: relative;
        }

        .brand {
          align-items: center;
          display: flex;
          font-size: 22px;
          font-weight: 760;
          gap: 12px;
          letter-spacing: -0.04em;
        }

        .brand-dot {
          background: #8bc7ff;
          border-radius: 50%;
          box-shadow: 0 0 20px rgba(91, 181, 255, 0.72);
          height: 9px;
          width: 9px;
        }

        .open-source {
          align-items: center;
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 9px;
          color: #aeb4ba;
          display: flex;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11px;
          gap: 9px;
          letter-spacing: 0.09em;
          padding: 11px 14px;
          text-transform: uppercase;
        }

        .open-source-star {
          color: #8bc7ff;
          font-size: 15px;
          line-height: 1;
        }

        .content {
          display: grid;
          gap: 58px;
          grid-template-columns: minmax(0, 1fr) 410px;
          height: 554px;
          padding: 54px 58px 38px;
          position: relative;
        }

        .copy {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .eyebrow {
          color: #79bdf7;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        h1 {
          font-size: 70px;
          letter-spacing: -0.067em;
          line-height: 0.96;
          margin: 22px 0 0;
          max-width: 650px;
        }

        h1 span {
          background: linear-gradient(105deg, #f8fbff 4%, #9ed0ff 92%);
          background-clip: text;
          color: transparent;
        }

        .lede {
          color: #969b9f;
          font-size: 18px;
          line-height: 1.55;
          margin: 28px 0 0;
          max-width: 620px;
        }

        .actions {
          align-items: center;
          display: flex;
          gap: 12px;
          margin-top: 32px;
        }

        .install {
          align-items: center;
          background: rgba(16, 17, 19, 0.9);
          border: 1px solid #303338;
          border-radius: 10px;
          color: #d2d5d8;
          display: flex;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 14px;
          height: 48px;
          padding: 0 18px;
        }

        .docs {
          align-items: center;
          background: #eef7ff;
          border: 1px solid #fff;
          border-radius: 10px;
          color: #0c1116;
          display: flex;
          font-size: 13px;
          font-weight: 760;
          gap: 9px;
          height: 48px;
          padding: 0 18px;
        }

        .providers {
          align-items: center;
          color: #60666b;
          display: flex;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 10px;
          gap: 14px;
          letter-spacing: 0.03em;
          margin-top: auto;
          text-transform: uppercase;
        }

        .providers strong {
          color: #8b9298;
          font-weight: 600;
        }

        .stage {
          align-self: center;
          background:
            radial-gradient(circle at 50% 36%, rgba(86, 150, 255, 0.18), transparent 36%),
            linear-gradient(155deg, rgba(21, 23, 26, 0.98), rgba(11, 12, 13, 0.98));
          border: 1px solid #2d3135;
          border-radius: 24px;
          box-shadow:
            0 32px 80px rgba(0, 0, 0, 0.44),
            inset 0 1px rgba(255, 255, 255, 0.035);
          height: 438px;
          overflow: hidden;
          position: relative;
        }

        .stage-header {
          align-items: center;
          border-bottom: 1px solid #292c30;
          display: flex;
          height: 58px;
          justify-content: space-between;
          padding: 0 20px;
        }

        .stage-title {
          color: #d8dadd;
          font-size: 12px;
          font-weight: 650;
        }

        .live {
          align-items: center;
          color: #6f757a;
          display: flex;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 9px;
          gap: 7px;
          letter-spacing: 0.09em;
          text-transform: uppercase;
        }

        .live-dot {
          background: #81c4ff;
          border-radius: 50%;
          box-shadow: 0 0 12px rgba(87, 180, 255, 0.86);
          height: 6px;
          width: 6px;
        }

        .orb-area {
          align-items: center;
          display: flex;
          flex-direction: column;
          height: 304px;
          justify-content: center;
        }

        .orb {
          background:
            radial-gradient(circle at 31% 28%, rgba(245, 250, 255, 0.98) 0 5%, transparent 25%),
            radial-gradient(circle at 66% 34%, rgba(126, 148, 255, 0.92), transparent 36%),
            radial-gradient(circle at 38% 72%, rgba(188, 220, 255, 0.9), transparent 39%),
            conic-gradient(from 205deg, #c4d7ff, #647cf4, #b8dcff, #7a62e7, #d8ecff, #7996ff, #c4d7ff);
          border: 1px solid rgba(221, 238, 255, 0.3);
          border-radius: 50%;
          box-shadow:
            0 0 58px rgba(83, 133, 255, 0.22),
            inset 16px 10px 36px rgba(255, 255, 255, 0.28),
            inset -22px -14px 36px rgba(74, 58, 190, 0.2);
          height: 198px;
          overflow: hidden;
          position: relative;
          width: 198px;
        }

        .orb::before,
        .orb::after {
          border-radius: 46% 54% 58% 42%;
          content: "";
          filter: blur(17px);
          inset: 18px;
          position: absolute;
          transform: rotate(-18deg);
        }

        .orb::before {
          background: linear-gradient(120deg, rgba(255, 255, 255, 0.72), transparent 42%, rgba(81, 104, 235, 0.42));
          mix-blend-mode: screen;
        }

        .orb::after {
          background: radial-gradient(ellipse at 72% 68%, rgba(58, 43, 167, 0.45), transparent 60%);
          filter: blur(22px);
          transform: rotate(24deg);
        }

        .signal {
          display: flex;
          gap: 7px;
          margin-top: 18px;
        }

        .signal span {
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid #2d3034;
          border-radius: 999px;
          color: #7d8388;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 8px;
          padding: 7px 10px;
          text-transform: uppercase;
        }

        .stage-footer {
          align-items: center;
          border-top: 1px solid #292c30;
          color: #6b7176;
          display: flex;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 9px;
          height: 76px;
          justify-content: space-between;
          letter-spacing: 0.08em;
          padding: 0 20px;
          text-transform: uppercase;
        }

        .theme-chips {
          display: flex;
          gap: 6px;
        }

        .theme-chips span {
          border: 1px solid #2c3034;
          border-radius: 6px;
          padding: 7px 9px;
        }

        .theme-chips span:first-child {
          background: #eef7ff;
          border-color: #fff;
          color: #0c1116;
        }

        .frame {
          border: 1px solid rgba(255, 255, 255, 0.055);
          inset: 14px;
          pointer-events: none;
          position: absolute;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="grid"></div>
        <div class="frame"></div>
        <header class="topbar">
          <div class="brand"><span class="brand-dot"></span>orb-ui</div>
          <div class="open-source"><span class="open-source-star">★</span>Open source · MIT</div>
        </header>

        <main class="content">
          <section class="copy">
            <div class="eyebrow">React voice agent UI</div>
            <h1>Voice agent UI<br />that feels <span>alive.</span></h1>
            <p class="lede">Expressive themes, realtime voice states, and provider adapters that all end at one React component.</p>
            <div class="actions">
              <div class="install">npm install orb-ui</div>
              <div class="docs">Read the docs <span>→</span></div>
            </div>
            <div class="providers">
              <strong>Native paths</strong>
              <span>Vapi</span>
              <span>ElevenLabs</span>
              <span>LiveKit</span>
              <span>Pipecat</span>
              <span>OpenAI</span>
              <span>Gemini</span>
            </div>
          </section>

          <section class="stage">
            <header class="stage-header">
              <span class="stage-title">Live voice surface</span>
              <span class="live"><span class="live-dot"></span>Signal active</span>
            </header>
            <div class="orb-area">
              <div class="orb"></div>
              <div class="signal"><span>Simulation</span><span>Speaking</span><span>0.72</span></div>
            </div>
            <footer class="stage-footer">
              <span>Visual theme</span>
              <div class="theme-chips"><span>cloud</span><span>radial</span><span>bars</span></div>
            </footer>
          </section>
        </main>
      </div>
    </body>
  </html>
`)

await page.waitForFunction('document.fonts.status === "loaded"')
await page.screenshot({
  path: outputPath,
  type: 'jpeg',
  quality: 92,
})

await browser.close()
