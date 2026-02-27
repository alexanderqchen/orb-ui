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

  // rAF loop for volume-driven states
  useEffect(() => {
    const el = circleRef.current
    if (!el) return

    if (state === 'listening' || state === 'speaking') {
      let currentScale = 1
      let currentGlow = 0

      const animate = () => {
        const vol = volume

        let targetScale: number
        let targetGlow: number
        const color = STATE_COLORS[state]

        if (state === 'listening') {
          targetScale = 0.85 + vol * 0.25
          targetGlow = vol * 20
        } else {
          // speaking
          targetScale = 0.8 + vol * 0.35
          targetGlow = vol * 30
        }

        // Asymmetric lerp: fast attack, slow release
        // This bridges micro-silences so the circle doesn't jitter
        const scaleRate = targetScale > currentScale ? 0.15 : 0.04
        const glowRate = targetGlow > currentGlow ? 0.15 : 0.04
        currentScale += (targetScale - currentScale) * scaleRate
        currentGlow += (targetGlow - currentGlow) * glowRate

        el.style.transform = `scale(${currentScale})`
        el.style.boxShadow = `0 0 ${currentGlow}px ${currentGlow * 0.4}px ${color}`
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
  }, [state, volume])

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
