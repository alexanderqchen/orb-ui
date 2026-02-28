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

// ─── Scale constants ──────────────────────────────────────────────────────────
// Signal processing (noise gate, EMA) is handled by the adapter.
// These constants only control the visual scale mapping.

// Scale range — subtle breathing feel, not dramatic swings
const SPEAK_BASE  = 0.88
const SPEAK_RANGE = 0.22   // 0.88 → 1.10 at full volume
const LISTEN_BASE  = 0.90
const LISTEN_RANGE = 0.15  // 0.90 → 1.05 at full volume

// ─── Strategies ───────────────────────────────────────────────────────────────
// Signal processing (noise gate, EMA) now lives in the adapter layer — the
// volume arriving here is already a clean 0–1 value. These strategies only
// vary the *visual* output lerp (how quickly the circle chases its target).
//
// Switch via window.__orbStrategy (1–5) or the debug panel buttons.
//
// 1  SNAP       — asymmetric output lerp: fast rise (0.40), slower fall (0.10)
// 2  CRISP      — symmetric output lerp 0.55  ← current winner
// 3  PUNCHY     — instant output (lerp 1.0) — circle IS the adapter signal
// 4  PEAK-HOLD  — instant attack, 8-frame visual hold, then decay 0.09/frame
// 5  WIDE       — lerp 0.55 but wider scale range (0.70 → 1.50)

export function CircleTheme({ state, volume, size, className, style }: CircleThemeProps) {
  const circleRef = useRef<HTMLDivElement>(null)
  const rafRef    = useRef<number>(0)

  // Raw volume — updated every Vapi tick, read by rAF every frame
  const volumeRef = useRef(volume)

  // Persistent animation state — survives speaking↔listening flicker
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

        // Volume is already normalized by the adapter (noise gate + EMA).
        // These strategies only vary the *visual* output lerp.
        const vol = volumeRef.current

        if (strategy === 1) {
          // SNAP: asymmetric output lerp — fast rise, slower fall
          const tScale = base + vol * range
          const tGlow  = vol * (state === 'speaking' ? 16 : 10)
          currentScaleRef.current += (tScale - currentScaleRef.current) *
            (tScale > currentScaleRef.current ? 0.40 : 0.10)
          currentGlowRef.current  += (tGlow  - currentGlowRef.current)  *
            (tGlow  > currentGlowRef.current  ? 0.40 : 0.10)

        } else if (strategy === 2) {
          // CRISP: symmetric output lerp 0.55 — current winner
          const tScale = base + vol * range
          const tGlow  = vol * (state === 'speaking' ? 16 : 10)
          currentScaleRef.current += (tScale - currentScaleRef.current) * 0.55
          currentGlowRef.current  += (tGlow  - currentGlowRef.current)  * 0.55

        } else if (strategy === 3) {
          // PUNCHY: instant — circle directly mirrors adapter signal, no lag
          currentScaleRef.current = base + vol * range
          currentGlowRef.current  = vol * (state === 'speaking' ? 16 : 10)

        } else if (strategy === 4) {
          // PEAK-HOLD: visual VU-meter — snaps to peak, holds, then decays
          const HOLD_FRAMES = 8    // ~133ms at 60fps
          const DECAY_RATE  = 0.09

          if (vol >= peakVolRef.current) {
            peakVolRef.current     = vol
            peakHoldFrames.current = HOLD_FRAMES
          } else if (peakHoldFrames.current > 0) {
            peakHoldFrames.current--
          } else {
            peakVolRef.current -= (peakVolRef.current - vol) * DECAY_RATE
          }
          currentScaleRef.current = base + peakVolRef.current * range
          currentGlowRef.current  = peakVolRef.current * (state === 'speaking' ? 16 : 10)

        } else {
          // WIDE: same lerp as CRISP but wider scale range for more drama
          const WIDE_BASE  = state === 'speaking' ? 0.70 : 0.75
          const WIDE_RANGE = state === 'speaking' ? 0.80 : 0.50
          currentScaleRef.current += (WIDE_BASE + vol * WIDE_RANGE - currentScaleRef.current) * 0.55
          currentGlowRef.current  += (vol * (state === 'speaking' ? 20 : 14) - currentGlowRef.current) * 0.55
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
        el.style.boxShadow  = `0 0 ${currentGlowRef.current}px ${currentGlowRef.current * 0.25}px rgb(${r},${g},${b})`
        el.style.animation  = 'none'

        // ── Expose globals for monitoring panel ─────────────────────────────
        w.__orbVol          = vol   // normalized by adapter
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
              vol:   +vol.toFixed(4),
              scale: +currentScaleRef.current.toFixed(4),
              peak:  +peakVolRef.current.toFixed(4),
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
