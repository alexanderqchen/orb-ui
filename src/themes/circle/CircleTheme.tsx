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

// ─── Visual constants ─────────────────────────────────────────────────────────
// Volume arrives pre-normalized from the adapter (noise gate + EMA already
// applied). These constants only control the visual mapping vol → scale/glow.

// Scale: subtle breathing feel. At vol=0 → SPEAK_BASE; at vol=1 → SPEAK_BASE + SPEAK_RANGE.
const SPEAK_BASE   = 0.88
const SPEAK_RANGE  = 0.22   // 0.88 → 1.10
const LISTEN_BASE  = 0.90
const LISTEN_RANGE = 0.15   // 0.90 → 1.05

const SPEAK_GLOW   = 16     // px at vol=1
const LISTEN_GLOW  = 10

// Output lerp rate — interpolates the adapter's ~10 Hz signal up to 60 fps
// so the circle animates smoothly rather than snapping every 100 ms.
const LERP = 0.55

export function CircleTheme({ state, volume, size, className, style }: CircleThemeProps) {
  const circleRef = useRef<HTMLDivElement>(null)
  const rafRef    = useRef<number>(0)

  // Sync adapter volume into a ref so the rAF loop always reads the latest
  // value without being in the useEffect dependency array.
  const volumeRef = useRef(volume)
  useLayoutEffect(() => { volumeRef.current = volume }, [volume])

  // Persistent animation state — survives speaking↔listening state transitions
  // (the adapter debounces these, but refs make the theme resilient regardless).
  const currentScaleRef = useRef(1)
  const currentGlowRef  = useRef(0)
  const currentColorRef = useRef<RGB>(hexToRgb(STATE_COLORS.idle))

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

  // ─── rAF loop (listening + speaking) ─────────────────────────────────────
  // Runs at display rate (~60 fps). Reads adapter volume via ref, interpolates
  // toward target scale/glow/color, writes directly to DOM style.
  useEffect(() => {
    const el = circleRef.current
    if (!el) return

    if (state === 'listening' || state === 'speaking') {
      const base  = state === 'speaking' ? SPEAK_BASE  : LISTEN_BASE
      const range = state === 'speaking' ? SPEAK_RANGE : LISTEN_RANGE
      const glow  = state === 'speaking' ? SPEAK_GLOW  : LISTEN_GLOW

      const animate = () => {
        const vol = volumeRef.current

        // Scale + glow: lerp toward vol-derived target
        const tScale = base + vol * range
        const tGlow  = vol * glow
        currentScaleRef.current += (tScale - currentScaleRef.current) * LERP
        currentGlowRef.current  += (tGlow  - currentGlowRef.current)  * LERP

        // Color: lerp toward state color (handles state transition fades;
        // avoids CSS transition flicker on rapid speaking↔listening changes)
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

        rafRef.current = requestAnimationFrame(animate)
      }

      rafRef.current = requestAnimationFrame(animate)

      return () => {
        // Don't reset transform/background here — persistent refs keep the
        // visual state alive so rapid state transitions don't cause a snap frame.
        cancelAnimationFrame(rafRef.current)
      }

    } else {
      // Non-active states: cancel rAF, reset refs, hand off to CSS animations
      cancelAnimationFrame(rafRef.current)
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

  const d = size * 0.55

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
          // Initial color — rAF overwrites this immediately on first frame
          background: STATE_COLORS[state],
        }}
      />
      {state === 'thinking' && (
        <div style={{
          position: 'absolute',
          width: size * 0.68, height: size * 0.68,
          border: '2px dashed #fbbf24', borderRadius: '50%',
          animation: 'orb-circle-thinking-spin 1.5s linear infinite',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  )
}
