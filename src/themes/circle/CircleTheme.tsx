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

export function CircleTheme({ state, volume, size, className, style }: CircleThemeProps) {
  const circleRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const volumeRef = useRef(volume)
  // Persist animation position across state changes.
  // Vapi rapidly flickers speaking→listening→speaking at turn boundaries.
  // Without these refs, each state change resets currentScale to 1,
  // causing a visible jump on every transition.
  const currentScaleRef = useRef(1)
  const currentGlowRef = useRef(0)

  // Sync ref whenever volume prop changes — no effect restart needed
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

  // rAF loop — only restarts when state changes, not on every volume tick
  useEffect(() => {
    const el = circleRef.current
    if (!el) return

    if (state === 'listening' || state === 'speaking') {
      // Noise floor + linear ramp: gate ambient noise, eliminate threshold cliff
      const NOISE_FLOOR = 0.12

      const animate = () => {
        const raw = volumeRef.current
        const vol = raw < NOISE_FLOOR ? 0 : (raw - NOISE_FLOOR) / (1 - NOISE_FLOOR)

        const color = STATE_COLORS[state]
        const targetScale = state === 'listening' ? 0.85 + vol * 0.25 : 0.8 + vol * 0.35
        const targetGlow = state === 'listening' ? vol * 20 : vol * 30

        // Asymmetric lerp on persistent refs — position survives state transitions.
        // Vapi flickers speaking→listening→speaking at turn boundaries; using refs
        // means the circle never resets to 1.0 mid-animation on those flickers.
        const scaleRate = targetScale > currentScaleRef.current ? 0.15 : 0.04
        const glowRate = targetGlow > currentGlowRef.current ? 0.15 : 0.04
        currentScaleRef.current += (targetScale - currentScaleRef.current) * scaleRate
        currentGlowRef.current += (targetGlow - currentGlowRef.current) * glowRate

        el.style.transform = `scale(${currentScaleRef.current})`
        el.style.boxShadow = `0 0 ${currentGlowRef.current}px ${currentGlowRef.current * 0.4}px ${color}`
        el.style.animation = 'none'

        rafRef.current = requestAnimationFrame(animate)
      }

      rafRef.current = requestAnimationFrame(animate)

      return () => {
        cancelAnimationFrame(rafRef.current)
        el.style.transform = ''
        el.style.boxShadow = ''
      }
    } else {
      // Reset for CSS-animated or static states
      cancelAnimationFrame(rafRef.current)
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
  }, [state])  // volume intentionally excluded — read via volumeRef instead

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
