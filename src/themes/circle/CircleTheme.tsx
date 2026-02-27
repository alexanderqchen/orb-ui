import { useRef, useEffect, useLayoutEffect } from 'react'
import type { OrbState } from '../../components/VoiceOrb/VoiceOrb.types'

interface CircleThemeProps {
  state: OrbState
  volume: number
  size: number
  className?: string
  style?: React.CSSProperties
}

// ─── Color helpers ────────────────────────────────────────────────────────────

type RGB = [number, number, number]

function hexToRgb(hex: string): RGB {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

const STATE_COLORS: Record<OrbState, string> = {
  idle:         '#cccccc',
  connecting:   '#cccccc',
  listening:    '#60a5fa',
  speaking:     '#a3e635',
  thinking:     '#fbbf24',
  error:        '#f87171',
  disconnected: '#444444',
}

// ─── Keyframes ────────────────────────────────────────────────────────────────

const KEYFRAMES = `
@keyframes orb-circle-idle-pulse {
  from { transform: scale(1); }
  to   { transform: scale(1.06); }
}
@keyframes orb-circle-connecting-pulse {
  from { transform: scale(1); }
  to   { transform: scale(1.06); }
}
@keyframes orb-circle-thinking-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
`

// ─── Volume constants ─────────────────────────────────────────────────────────

const NOISE_FLOOR = 0.12

// ─── Strategy descriptions (exposed on window for monitoring panel) ───────────
// 1  CANARY      — giant magenta flash; proves the code is even running
// 2  RAW         — raw gated vol → scale, no smoothing (jitter baseline)
// 3  OUTPUT-LERP — asymmetric output lerp only (fast rise 0.15 / slow fall 0.04)
// 4  EMA-SLOW    — rAF EMA attack=0.08/release=0.015 + output lerp 0.2
// 5  EMA-FAST    — rAF EMA attack=0.40/release=0.06  + output lerp 0.4

export function CircleTheme({ state, volume, size, className, style }: CircleThemeProps) {
  const circleRef = useRef<HTMLDivElement>(null)
  const rafRef    = useRef<number>(0)

  // Raw volume — updated every Vapi tick via useLayoutEffect, read by rAF every frame
  const volumeRef = useRef(volume)

  // Persistent animation state — survive state transitions so the speaking→listening
  // flicker doesn't snap scale/glow/color back to zero
  const smoothedVolRef   = useRef(0)
  const currentScaleRef  = useRef(1)
  const currentGlowRef   = useRef(0)
  const currentColorRef  = useRef<RGB>(hexToRgb(STATE_COLORS.idle))

  // Sync raw volume into ref before rAF reads it (runs before paint)
  useLayoutEffect(() => {
    volumeRef.current = volume
  }, [volume])

  // Inject keyframes once
  useEffect(() => {
    const id = 'orb-circle-keyframes'
    if (!document.getElementById(id)) {
      const el = document.createElement('style')
      el.id = id
      el.textContent = KEYFRAMES
      document.head.appendChild(el)
    }
  }, [])

  // ─── Main rAF loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = circleRef.current
    if (!el) return

    if (state === 'listening' || state === 'speaking') {
      let lastDiagMs = 0

      const animate = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any
        const strategy: number = w.__orbStrategy ?? 4

        // ── 1. Gate raw volume ──────────────────────────────────────────────
        const raw  = volumeRef.current
        const gated = raw < NOISE_FLOOR ? 0 : (raw - NOISE_FLOOR) / (1 - NOISE_FLOOR)

        // ── 2. Smoothing strategy ───────────────────────────────────────────
        if (strategy === 1) {
          // CANARY: unmissable. If you don't see giant magenta, the code isn't running.
          // Any raw vol > 0 (not even gated) → giant + magenta
          const active = raw > 0.001
          currentScaleRef.current = active ? 2.8 : 0.3
          currentGlowRef.current  = active ? 50  : 0
          currentColorRef.current = active ? [255, 0, 200] : [40, 40, 40]

          const [r, g, b] = currentColorRef.current
          el.style.transform  = `scale(${currentScaleRef.current})`
          el.style.background = `rgb(${r},${g},${b})`
          el.style.boxShadow  = active ? `0 0 50px 25px rgb(255,0,200)` : 'none'
          el.style.animation  = 'none'

          w.__orbRawVol       = raw
          w.__orbGated        = gated
          w.__orbSmoothedVol  = gated
          w.__orbCurrentScale = currentScaleRef.current
          w.__orbStrategy     = strategy
          rafRef.current = requestAnimationFrame(animate)
          return

        } else if (strategy === 2) {
          // RAW: no smoothing at all — pure jitter baseline
          currentScaleRef.current = state === 'listening'
            ? 0.85 + gated * 0.25
            : 0.80 + gated * 0.35
          currentGlowRef.current = state === 'listening' ? gated * 20 : gated * 30

        } else if (strategy === 3) {
          // OUTPUT-LERP: asymmetric lerp on output, no input EMA (original approach)
          const tScale = state === 'listening' ? 0.85 + gated * 0.25 : 0.80 + gated * 0.35
          const tGlow  = state === 'listening' ? gated * 20 : gated * 30
          const sRate  = tScale > currentScaleRef.current ? 0.15 : 0.04
          const gRate  = tGlow  > currentGlowRef.current  ? 0.12 : 0.03
          currentScaleRef.current += (tScale - currentScaleRef.current) * sRate
          currentGlowRef.current  += (tGlow  - currentGlowRef.current)  * gRate

        } else if (strategy === 4) {
          // EMA-SLOW: gentle input smoothing, light output lerp
          const prev    = smoothedVolRef.current
          const emaRate = gated > prev ? 0.08 : 0.015
          smoothedVolRef.current += (gated - prev) * emaRate
          const v = smoothedVolRef.current
          const tScale = state === 'listening' ? 0.85 + v * 0.25 : 0.80 + v * 0.35
          const tGlow  = state === 'listening' ? v * 20 : v * 30
          currentScaleRef.current += (tScale - currentScaleRef.current) * 0.2
          currentGlowRef.current  += (tGlow  - currentGlowRef.current)  * 0.2

        } else {
          // strategy === 5: EMA-FAST: aggressive input smoothing + fast output lerp
          const prev    = smoothedVolRef.current
          const emaRate = gated > prev ? 0.40 : 0.06
          smoothedVolRef.current += (gated - prev) * emaRate
          const v = smoothedVolRef.current
          const tScale = state === 'listening' ? 0.85 + v * 0.25 : 0.80 + v * 0.35
          const tGlow  = state === 'listening' ? v * 20 : v * 30
          currentScaleRef.current += (tScale - currentScaleRef.current) * 0.40
          currentGlowRef.current  += (tGlow  - currentGlowRef.current)  * 0.40
        }

        // ── 3. Color lerp (all strategies 2-5) ─────────────────────────────
        // Lerp toward target color in rAF — avoids CSS transition flicker
        // when Vapi flickers speaking↔listening every ~200ms
        const tRgb = hexToRgb(STATE_COLORS[state])
        const COLOR_LERP = 0.05  // ~1s to fully transition
        const [cr, cg, cb] = currentColorRef.current
        currentColorRef.current = [
          cr + (tRgb[0] - cr) * COLOR_LERP,
          cg + (tRgb[1] - cg) * COLOR_LERP,
          cb + (tRgb[2] - cb) * COLOR_LERP,
        ]
        const [r, g, b] = currentColorRef.current.map(Math.round)

        el.style.transform  = `scale(${currentScaleRef.current})`
        el.style.background = `rgb(${r},${g},${b})`
        el.style.boxShadow  = `0 0 ${currentGlowRef.current}px ${currentGlowRef.current * 0.4}px rgb(${r},${g},${b})`
        el.style.animation  = 'none'

        // ── 4. Expose globals for monitoring panel ──────────────────────────
        w.__orbRawVol       = raw
        w.__orbGated        = gated
        w.__orbSmoothedVol  = smoothedVolRef.current
        w.__orbCurrentScale = currentScaleRef.current
        w.__orbStrategy     = strategy

        // ── 5. Time-based server diagnostic (survives state-flicker resets) ─
        const now = Date.now()
        if (now - lastDiagMs >= 1000) {
          lastDiagMs = now
          fetch('/api/volume-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              raf: true, t: now, strategy, state,
              rawVol:   +raw.toFixed(4),
              gated:    +gated.toFixed(4),
              smoothed: +smoothedVolRef.current.toFixed(4),
              scale:    +currentScaleRef.current.toFixed(4),
            }),
          }).catch(() => {})
        }

        rafRef.current = requestAnimationFrame(animate)
      }

      rafRef.current = requestAnimationFrame(animate)

      return () => {
        // IMPORTANT: don't clear transform/background/boxShadow here.
        // Persistent refs keep the visual state alive across speaking↔listening
        // flicker — clearing here causes a one-frame snap on every transition.
        cancelAnimationFrame(rafRef.current)
      }

    } else {
      // ── Non-active state: hand off to CSS animations ────────────────────
      cancelAnimationFrame(rafRef.current)
      smoothedVolRef.current  = 0
      currentScaleRef.current = 1
      currentGlowRef.current  = 0
      currentColorRef.current = hexToRgb(STATE_COLORS[state] ?? STATE_COLORS.idle)

      el.style.transform  = ''
      el.style.boxShadow  = ''
      el.style.background = STATE_COLORS[state] ?? STATE_COLORS.idle

      if (state === 'idle') {
        el.style.animation = 'orb-circle-idle-pulse 3s ease-in-out infinite alternate'
      } else if (state === 'connecting') {
        el.style.animation = 'orb-circle-connecting-pulse 1.2s ease-in-out infinite alternate'
      } else {
        el.style.animation = 'none'
      }
    }
  }, [state])

  const d     = size * 0.55
  const color = STATE_COLORS[state]

  return (
    <div
      className={className}
      style={{
        width: size, height: size,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        ...style,
      }}
    >
      <div
        ref={circleRef}
        style={{
          width: d, height: d,
          borderRadius: '50%',
          // Initial background — rAF overrides this immediately for listening/speaking.
          // NO CSS transition — color changes handled by rAF lerp to avoid flicker.
          background: color,
        }}
      />
      {state === 'thinking' && (
        <div
          style={{
            position: 'absolute',
            width: size * 0.68, height: size * 0.68,
            border: '2px dashed #fbbf24', borderRadius: '50%',
            animation: 'orb-circle-thinking-spin 1.5s linear infinite',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  )
}
