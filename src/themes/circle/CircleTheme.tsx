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
  // Keep volume in a ref so the rAF loop always reads the latest value
  // without volume being in the effect's dependency array.
  // If volume were in deps, React would tear down and restart the loop
  // on every volume tick, resetting currentScale/currentGlow each time
  // and making the asymmetric lerp completely ineffective.
  const volumeRef = useRef(volume)

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
      let currentScale = 1
      let currentGlow = 0

      // Anything below this is ambient noise from the audio pipeline — ignore it
      const NOISE_FLOOR = 0.08

      const animate = () => {
        const raw = volumeRef.current
        const vol = raw < NOISE_FLOOR ? 0 : raw

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
        // Bridges micro-silences so the circle doesn't jitter between words
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
