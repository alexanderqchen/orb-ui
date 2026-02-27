import { useRef, useEffect } from 'react'
import type { OrbState } from '../../components/VoiceOrb/VoiceOrb.types'

interface CircleThemeProps {
  state: OrbState
  volume: number
  size: number
  className?: string
  style?: React.CSSProperties
}

const STATE_COLORS: Record<OrbState, string> = {
  idle: '#cccccc',
  connecting: '#cccccc',
  listening: '#60a5fa',
  speaking: '#a3e635',
  thinking: '#fbbf24',
  error: '#f87171',
  disconnected: '#444444',
}

const KEYFRAMES = `
@keyframes orb-circle-idle-pulse {
  from { transform: scale(1); }
  to { transform: scale(1.06); }
}
@keyframes orb-circle-connecting-pulse {
  from { transform: scale(1); }
  to { transform: scale(1.06); }
}
@keyframes orb-circle-thinking-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`

// Noise gate — anything below this is treated as silence
const NOISE_FLOOR = 0.12

// Per-frame EMA rates (rAF runs at ~60fps, Vapi fires at ~10Hz)
// Attack 0.08: circle reaches ~78% energy after 3 Vapi ticks (300ms) of speech
// Release 0.015: bridges 100ms inter-word dips (~8% decay/tick), fades to rest
//   over ~2s of true silence. Chosen so that Vapi's alternating loud/silent
//   ticks during active speech produce only ~4px scale variation.
const ATTACK_RATE = 0.08
const RELEASE_RATE = 0.015

export function CircleTheme({ state, volume, size, className, style }: CircleThemeProps) {
  const circleRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  // Raw volume from Vapi — written immediately on every event, bypasses React
  // render cycle so the rAF loop always sees the latest value.
  const volumeRef = useRef(volume)

  // Smoothed volume — EMA computed in the rAF loop every frame so it decays
  // continuously even when Vapi sends the same value repeatedly (which React
  // would deduplicate if we ran the EMA in a useEffect).
  const smoothedVolRef = useRef(0)

  // Persisted animation position — survives state transitions so Vapi's
  // rapid speaking→listening→speaking flicker doesn't snap the circle.
  const currentScaleRef = useRef(1)
  const currentGlowRef = useRef(0)

  // Sync raw volume ref on every Vapi tick — no EMA here, just a passthrough
  useEffect(() => {
    volumeRef.current = volume
  }, [volume])

  // Inject keyframes once
  useEffect(() => {
    const id = 'orb-circle-keyframes'
    if (!document.getElementById(id)) {
      const styleEl = document.createElement('style')
      styleEl.id = id
      styleEl.textContent = KEYFRAMES
      document.head.appendChild(styleEl)
    }
  }, [])

  // rAF loop — restarts only on state change, reads volume via ref every frame
  useEffect(() => {
    const el = circleRef.current
    if (!el) return

    if (state === 'listening' || state === 'speaking') {
      const animate = () => {
        // 1. Noise gate + linear ramp on raw volume
        const raw = volumeRef.current
        const gated = raw < NOISE_FLOOR ? 0 : (raw - NOISE_FLOOR) / (1 - NOISE_FLOOR)

        // 2. EMA in the rAF loop — runs every frame unconditionally.
        //    This is the key: even when Vapi sends the same value for many
        //    consecutive ticks (React would skip those in a useEffect),
        //    the EMA here keeps decaying toward the correct target.
        const prev = smoothedVolRef.current
        const emaRate = gated > prev ? ATTACK_RATE : RELEASE_RATE
        smoothedVolRef.current = prev + (gated - prev) * emaRate
        const vol = smoothedVolRef.current

        // 3. Compute targets from smoothed vol
        const color = STATE_COLORS[state]
        const targetScale = state === 'listening' ? 0.85 + vol * 0.25 : 0.8 + vol * 0.35
        const targetGlow  = state === 'listening' ? vol * 20 : vol * 30

        // 4. Light output lerp for visual smoothness between ticks
        currentScaleRef.current += (targetScale - currentScaleRef.current) * 0.2
        currentGlowRef.current  += (targetGlow  - currentGlowRef.current)  * 0.2

        el.style.transform  = `scale(${currentScaleRef.current})`
        el.style.boxShadow  = `0 0 ${currentGlowRef.current}px ${currentGlowRef.current * 0.4}px ${color}`
        el.style.animation  = 'none'

        // Expose for debug logging in demo
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).__orbSmoothedVol = smoothedVolRef.current

        rafRef.current = requestAnimationFrame(animate)
      }

      rafRef.current = requestAnimationFrame(animate)

      return () => {
        cancelAnimationFrame(rafRef.current)
        el.style.transform = ''
        el.style.boxShadow = ''
      }
    } else {
      // Non-volume states: CSS animation or static
      cancelAnimationFrame(rafRef.current)
      // Decay smoothedVol back to 0 when not in active state
      smoothedVolRef.current = 0
      el.style.transform = ''
      el.style.boxShadow = ''

      if (state === 'idle') {
        el.style.animation = 'orb-circle-idle-pulse 3s ease-in-out infinite alternate'
      } else if (state === 'connecting') {
        el.style.animation = 'orb-circle-connecting-pulse 1.2s ease-in-out infinite alternate'
      } else {
        el.style.animation = 'none'
      }
    }
  }, [state])  // volume intentionally excluded — read via volumeRef every frame

  const d = size * 0.55
  const color = STATE_COLORS[state]

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
        ref={circleRef}
        style={{
          width: d,
          height: d,
          borderRadius: '50%',
          background: color,
          transition: 'background 0.3s ease',
        }}
      />
      {state === 'thinking' && (
        <div
          style={{
            position: 'absolute',
            width: size * 0.68,
            height: size * 0.68,
            border: '2px dashed #fbbf24',
            borderRadius: '50%',
            animation: 'orb-circle-thinking-spin 1.5s linear infinite',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  )
}
