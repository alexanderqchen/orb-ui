import { useRef, useEffect } from 'react'
import type { OrbState } from '../../components/VoiceOrb/VoiceOrb.types'

interface BarsThemeProps {
  state: OrbState
  volume: number
  size: number
  className?: string
  style?: React.CSSProperties
}

const BAR_COUNT = 5
const MULTIPLIERS = [0.6, 0.85, 1.0, 0.85, 0.6]

const STATE_COLORS: Record<OrbState, string> = {
  idle: '#cccccc',
  connecting: '#cccccc',
  listening: '#60a5fa',
  speaking: '#a3e635',
  thinking: '#fbbf24',
  error: '#f87171',
  disconnected: '#444444',
}

function buildKeyframes(size: number) {
  const maxH = size * 0.55
  const minH = size * 0.06
  return `
@keyframes orb-bars-wave {
  0%, 100% { height: ${minH}px; }
  50% { height: ${maxH * 0.5}px; }
}
@keyframes orb-bars-wave-fast {
  0%, 100% { height: ${minH}px; }
  50% { height: ${maxH * 0.5}px; }
}
`
}

export function BarsTheme({ state, volume, size, className, style }: BarsThemeProps) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([])
  const rafRef = useRef<number>(0)
  const smoothed = useRef<number[]>(new Array(BAR_COUNT).fill(0))
  const styleRef = useRef<HTMLStyleElement | null>(null)

  // Inject/update keyframes when size changes
  useEffect(() => {
    const id = 'orb-bars-keyframes'
    let el = document.getElementById(id) as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = id
      document.head.appendChild(el)
    }
    el.textContent = buildKeyframes(size)
    styleRef.current = el
  }, [size])

  // Animation loop
  useEffect(() => {
    const maxH = size * 0.55
    const minH = size * 0.06
    const barW = size * 0.055
    const color = STATE_COLORS[state]

    const setBars = (heights: number[], col: string) => {
      for (let i = 0; i < BAR_COUNT; i++) {
        const el = barRefs.current[i]
        if (!el) continue
        el.style.height = `${heights[i]}px`
        el.style.background = col
        el.style.animation = 'none'
      }
    }

    if (state === 'listening' || state === 'speaking') {
      const animate = () => {
        const vol = volume
        for (let i = 0; i < BAR_COUNT; i++) {
          const rand = state === 'speaking'
            ? 0.5 + Math.random() * 0.5
            : 0.3 + Math.random() * 0.7

          const target = Math.max(minH, maxH * vol * MULTIPLIERS[i] * rand)
          smoothed.current[i] += (target - smoothed.current[i]) * 0.18
        }
        setBars(smoothed.current, color)
        rafRef.current = requestAnimationFrame(animate)
      }
      rafRef.current = requestAnimationFrame(animate)

      return () => cancelAnimationFrame(rafRef.current)
    }

    if (state === 'thinking') {
      const animate = () => {
        const now = Date.now()
        const heights: number[] = []
        for (let i = 0; i < BAR_COUNT; i++) {
          heights.push(minH + (maxH - minH) * 0.5 * (1 + Math.sin(now / 500 + i * 0.8)))
        }
        setBars(heights, color)
        rafRef.current = requestAnimationFrame(animate)
      }
      rafRef.current = requestAnimationFrame(animate)

      return () => cancelAnimationFrame(rafRef.current)
    }

    // CSS-animated or static states
    cancelAnimationFrame(rafRef.current)

    if (state === 'idle' || state === 'connecting') {
      const duration = state === 'idle' ? '1.8s' : '1s'
      for (let i = 0; i < BAR_COUNT; i++) {
        const el = barRefs.current[i]
        if (!el) continue
        el.style.background = color
        el.style.height = ''
        const animName = state === 'idle' ? 'orb-bars-wave' : 'orb-bars-wave-fast'
        el.style.animation = `${animName} ${duration} ease-in-out ${i * 0.15}s infinite`
      }
      return
    }

    // error / disconnected — static at min height
    for (let i = 0; i < BAR_COUNT; i++) {
      const el = barRefs.current[i]
      if (!el) continue
      el.style.height = `${minH}px`
      el.style.background = color
      el.style.animation = 'none'
    }
  }, [state, volume, size])

  const barW = size * 0.055
  const gap = size * 0.035
  const radius = size * 0.03
  const maxH = size * 0.55
  const minH = size * 0.06

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap,
        ...style,
      }}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          ref={(el) => { barRefs.current[i] = el }}
          style={{
            width: barW,
            minHeight: minH,
            maxHeight: maxH,
            height: minH,
            borderRadius: radius,
            background: STATE_COLORS[state],
            transition: 'background 0.3s ease',
          }}
        />
      ))}
    </div>
  )
}
