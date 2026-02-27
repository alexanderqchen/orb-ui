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

// ─── Volume + scale constants ─────────────────────────────────────────────────

const NOISE_FLOOR = 0.12

// Scale range — wider than before for more visual impact
const SPEAK_BASE  = 0.75
const SPEAK_RANGE = 0.55   // 0.75 → 1.30 at full volume
const LISTEN_BASE  = 0.80
const LISTEN_RANGE = 0.35  // 0.80 → 1.15 at full volume

// ─── Strategies ───────────────────────────────────────────────────────────────
// All 5 are snappier/less-floaty than the previous set.
// Switch via window.__orbStrategy (1–5) or the debug panel buttons.
//
// 1  SNAP       — fast asymmetric output lerp (rise 0.40 / fall 0.10), no EMA
// 2  CRISP      — EMA attack=0.65/release=0.12 + output lerp 0.55
// 3  PUNCHY     — EMA attack=0.90/release=0.18 + instant output (lerp=1.0)
// 4  PEAK-HOLD  — instant attack, 8-frame hold, then release 0.09/frame
// 5  WIDE       — EMA attack=0.80/release=0.20 + output lerp 0.6 (widest scale)

export function CircleTheme({ state, volume, size, className, style }: CircleThemeProps) {
  const circleRef = useRef<HTMLDivElement>(null)
  const rafRef    = useRef<number>(0)

  // Raw volume — updated every Vapi tick, read by rAF every frame
  const volumeRef = useRef(volume)

  // Persistent animation state — survives speaking↔listening flicker
  const smoothedVolRef   = useRef(0)
  const currentScaleRef  = useRef(1)
  const currentGlowRef   = useRef(0)
  const currentColorRef  = useRef<RGB>(hexToRgb(STATE_COLORS.idle))

  // Peak-hold state (used by strategy 4 only)
  const peakVolRef       = useRef(0)
  const peakHoldFrames   = useRef(0)

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
      const base  = state === 'speaking' ? SPEAK_BASE  : LISTEN_BASE
      const range = state === 'speaking' ? SPEAK_RANGE : LISTEN_RANGE

      const animate = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any
        const strategy: number = w.__orbStrategy ?? 3

        // ── Gate raw volume ─────────────────────────────────────────────────
        const raw   = volumeRef.current
        const gated = raw < NOISE_FLOOR ? 0 : (raw - NOISE_FLOOR) / (1 - NOISE_FLOOR)

        // ── Smoothing strategy ──────────────────────────────────────────────

        if (strategy === 1) {
          // SNAP: fast asymmetric output lerp, no input EMA.
          // Reacts immediately to loud ticks; drops at a moderate pace.
          const tScale = base + gated * range
          const tGlow  = gated * (state === 'speaking' ? 35 : 22)
          const rateUp = 0.40
          const rateDn = 0.10
          currentScaleRef.current += (tScale - currentScaleRef.current) *
            (tScale > currentScaleRef.current ? rateUp : rateDn)
          currentGlowRef.current  += (tGlow  - currentGlowRef.current)  *
            (tGlow  > currentGlowRef.current  ? rateUp : rateDn)

        } else if (strategy === 2) {
          // CRISP: moderate EMA + snappy output lerp.
          // Good balance — catches peaks fast, fades without hanging.
          const prev    = smoothedVolRef.current
          const emaRate = gated > prev ? 0.65 : 0.12
          smoothedVolRef.current += (gated - prev) * emaRate
          const v = smoothedVolRef.current
          const tScale = base + v * range
          const tGlow  = v * (state === 'speaking' ? 35 : 22)
          currentScaleRef.current += (tScale - currentScaleRef.current) * 0.55
          currentGlowRef.current  += (tGlow  - currentGlowRef.current)  * 0.55

        } else if (strategy === 3) {
          // PUNCHY: near-instant attack EMA + no output lerp (EMA IS the output).
          // The snappiest continuous-tracking option — what you see IS the EMA.
          const prev    = smoothedVolRef.current
          const emaRate = gated > prev ? 0.90 : 0.18
          smoothedVolRef.current += (gated - prev) * emaRate
          const v = smoothedVolRef.current
          currentScaleRef.current = base + v * range
          currentGlowRef.current  = v * (state === 'speaking' ? 35 : 22)

        } else if (strategy === 4) {
          // PEAK-HOLD: instant attack, hold peak for ~130ms, then decay.
          // VU-meter style — snaps to peak, sits there briefly, then drops.
          const HOLD_FRAMES = 8   // ~133ms at 60fps
          const DECAY_RATE  = 0.09

          if (gated >= peakVolRef.current) {
            // New peak: jump immediately and reset hold timer
            peakVolRef.current     = gated
            peakHoldFrames.current = HOLD_FRAMES
          } else if (peakHoldFrames.current > 0) {
            // Holding at current peak
            peakHoldFrames.current--
          } else {
            // Release: decay toward current gated value
            peakVolRef.current = peakVolRef.current > gated
              ? peakVolRef.current - (peakVolRef.current - gated) * DECAY_RATE
              : gated
          }

          const v = peakVolRef.current
          currentScaleRef.current = base + v * range
          currentGlowRef.current  = v * (state === 'speaking' ? 35 : 22)

        } else {
          // strategy === 5 — WIDE: fast EMA + widest scale range.
          // Same attack feel as PUNCHY but scale goes 0.70→1.50 for max visual drama.
          const WIDE_BASE  = state === 'speaking' ? 0.70 : 0.75
          const WIDE_RANGE = state === 'speaking' ? 0.80 : 0.50
          const prev    = smoothedVolRef.current
          const emaRate = gated > prev ? 0.80 : 0.20
          smoothedVolRef.current += (gated - prev) * emaRate
          const v = smoothedVolRef.current
          currentScaleRef.current = WIDE_BASE + v * WIDE_RANGE
          currentGlowRef.current  = v * (state === 'speaking' ? 40 : 28)
        }

        // ── Color lerp (rAF-managed — avoids CSS transition flicker) ────────
        const tRgb = hexToRgb(STATE_COLORS[state])
        const [cr, cg, cb] = currentColorRef.current
        currentColorRef.current = [
          cr + (tRgb[0] - cr) * 0.05,
          cg + (tRgb[1] - cg) * 0.05,
          cb + (tRgb[2] - cb) * 0.05,
        ]
        const [r, g, b] = currentColorRef.current.map(Math.round)

        el.style.transform  = `scale(${currentScaleRef.current})`
        el.style.background = `rgb(${r},${g},${b})`
        el.style.boxShadow  = `0 0 ${currentGlowRef.current}px ${currentGlowRef.current * 0.4}px rgb(${r},${g},${b})`
        el.style.animation  = 'none'

        // ── Expose globals for monitoring panel ─────────────────────────────
        w.__orbRawVol       = raw
        w.__orbGated        = gated
        w.__orbSmoothedVol  = smoothedVolRef.current
        w.__orbCurrentScale = currentScaleRef.current
        w.__orbStrategy     = strategy

        // ── Time-based server diagnostic ────────────────────────────────────
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
              peak:     +(peakVolRef.current).toFixed(4),
            }),
          }).catch(() => {})
        }

        rafRef.current = requestAnimationFrame(animate)
      }

      rafRef.current = requestAnimationFrame(animate)

      return () => {
        // Don't clear transform — persistent refs maintain state across
        // speaking↔listening flicker (avoids one-frame snap on each transition)
        cancelAnimationFrame(rafRef.current)
      }

    } else {
      // ── Non-active state: reset + hand off to CSS animations ────────────
      cancelAnimationFrame(rafRef.current)
      smoothedVolRef.current  = 0
      currentScaleRef.current = 1
      currentGlowRef.current  = 0
      peakVolRef.current      = 0
      peakHoldFrames.current  = 0
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
          // Initial color only — rAF manages background during listening/speaking
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
