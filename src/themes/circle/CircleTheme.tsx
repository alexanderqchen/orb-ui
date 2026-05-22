import { useRef, useEffect, useLayoutEffect } from 'react'
import type { OrbState } from '../../components/Orb/Orb.types'

interface CircleThemeProps {
  state: OrbState
  volume: number
  size: number
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
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
  idle: '#cccccc',
  connecting: '#cccccc',
  listening: '#999999',
  speaking: '#e8e8e8',
  error: '#f87171',
}

// ─── Keyframes ────────────────────────────────────────────────────────────────

const KEYFRAMES = `
@keyframes orb-circle-idle-pulse {
  from { transform: scale(1); }
  to   { transform: scale(1.06); }
}
@keyframes orb-circle-connecting-pulse {
  0%   { opacity: 1; transform: scale(1); }
  50%  { opacity: 0.6; transform: scale(0.95); }
  100% { opacity: 1; transform: scale(1); }
}
`

// ─── Visual constants ─────────────────────────────────────────────────────────
// Volume arrives pre-normalized from the adapter (noise gate + EMA already
// applied). These constants only control the visual mapping vol → scale/glow.

// Scale: subtle breathing feel. At vol=0 → SPEAK_BASE; at vol=1 → SPEAK_BASE + SPEAK_RANGE.
const SPEAK_BASE = 0.95
const SPEAK_RANGE = 0.08 // 0.95 → 1.03 — subtle size change
const LISTEN_BASE = 0.82
const LISTEN_RANGE = 0.18 // 0.82 → 1.00 (expands toward voice, stays under speaking)

const SPEAK_GLOW = 24 // px at vol=1 (sigmoid caps effective max ~14px)
const LISTEN_GLOW = 0 // no glow during listening — clean edge

// Output lerp rate — interpolates the adapter's ~10 Hz signal up to 60 fps
// so the circle animates smoothly rather than snapping every 100 ms.
const LERP = 0.55

export function CircleTheme({ state, volume, size, className, style, onClick }: CircleThemeProps) {
  const circleRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const hoverRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  // Sync adapter volume into a ref so the rAF loop always reads the latest
  // value without being in the useEffect dependency array.
  const volumeRef = useRef(volume)
  useLayoutEffect(() => {
    volumeRef.current = volume
  }, [volume])

  // Persistent animation state — survives speaking↔listening state transitions
  // (the adapter debounces these, but refs make the theme resilient regardless).
  const currentScaleRef = useRef(1)
  const currentGlowRef = useRef(0)
  const currentColorRef = useRef<RGB>(hexToRgb(STATE_COLORS.idle))

  // State transition blending — lerps base/range toward new state's targets
  // so size changes smoothly between states without affecting volume reactivity
  const TRANSITION_RATE = 0.06 // ~400ms to settle
  const currentBaseRef = useRef(LISTEN_BASE)
  const currentRangeRef = useRef(LISTEN_RANGE)

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
      const base = state === 'speaking' ? SPEAK_BASE : LISTEN_BASE
      const range = state === 'speaking' ? SPEAK_RANGE : LISTEN_RANGE
      const glow = state === 'speaking' ? SPEAK_GLOW : LISTEN_GLOW

      const animate = () => {
        const vol = volumeRef.current

        // Blend base/range toward current state's targets (smooth state transitions)
        currentBaseRef.current += (base - currentBaseRef.current) * TRANSITION_RATE
        currentRangeRef.current += (range - currentRangeRef.current) * TRANSITION_RATE

        // Volume curves are now applied in the adapters — theme just animates
        const tScale = currentBaseRef.current + vol * currentRangeRef.current
        const tGlow = vol * glow

        // Lerp for listening only — speaking lerp handled by adapters
        if (state === 'listening') {
          currentScaleRef.current += (tScale - currentScaleRef.current) * LERP
          currentGlowRef.current += (tGlow - currentGlowRef.current) * LERP
        } else {
          currentScaleRef.current = tScale
          currentGlowRef.current = tGlow
        }

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

        el.style.transform = `scale(${currentScaleRef.current})`
        el.style.background = `rgb(${r},${g},${b})`
        el.style.boxShadow = 'none'
        el.style.animation = 'none'

        // Glow on separate element behind the circle — scales with circle
        const ge = glowRef.current
        if (ge) {
          const g2 = currentGlowRef.current
          ge.style.transform = `scale(${currentScaleRef.current})`
          ge.style.boxShadow = g2 > 0.5 ? `0 0 ${g2}px ${g2 * 0.4}px rgb(${r},${g},${b})` : 'none'
        }

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
      currentGlowRef.current = 0
      currentColorRef.current = hexToRgb(STATE_COLORS[state] ?? STATE_COLORS.idle)

      el.style.transform = ''
      el.style.boxShadow = 'none'
      if (glowRef.current) glowRef.current.style.boxShadow = 'none'
      const c = STATE_COLORS[state] ?? STATE_COLORS.idle
      el.style.background = c

      if (state === 'idle') {
        el.style.animation = 'orb-circle-idle-pulse 3s ease-in-out infinite alternate'
      } else if (state === 'connecting') {
        el.style.animation = 'orb-circle-connecting-pulse 1.5s ease-in-out infinite'
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
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        ...style,
      }}
    >
      <div
        ref={hoverRef}
        onClick={onClick}
        onMouseEnter={() => {
          if (hoverRef.current) {
            hoverRef.current.style.transform = 'scale(1.06)'
            hoverRef.current.style.filter = 'brightness(1.12)'
          }
        }}
        onMouseLeave={() => {
          if (hoverRef.current) {
            hoverRef.current.style.transform = 'scale(1)'
            hoverRef.current.style.filter = 'brightness(1)'
          }
        }}
        onTouchEnd={() => {
          // Reset hover on mobile — touchend fires but mouseleave doesn't
          setTimeout(() => {
            if (hoverRef.current) {
              hoverRef.current.style.transform = 'scale(1)'
              hoverRef.current.style.filter = 'brightness(1)'
            }
          }, 200)
        }}
        style={{
          transition: 'transform 0.3s ease, filter 0.3s ease',
          cursor: onClick ? 'pointer' : 'default',
          borderRadius: '50%',
          lineHeight: 0,
        }}
      >
        {/* Glow element — behind the circle */}
        <div
          ref={glowRef}
          style={{
            position: 'absolute',
            width: d,
            height: d,
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        />
        {/* Circle — on top */}
        <div
          ref={circleRef}
          style={{
            position: 'relative',
            width: d,
            height: d,
            borderRadius: '50%',
            background: STATE_COLORS[state],
          }}
        />
      </div>
    </div>
  )
}
