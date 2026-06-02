import { useRef, useEffect } from 'react'
import type { CSSProperties } from 'react'
import type { OrbHtmlAttributes, OrbState } from '../../components/Orb/Orb.types'

interface BarsThemeProps extends OrbHtmlAttributes {
  state: OrbState
  volume: number
  size: number
  className?: string
  style?: CSSProperties
  disabled?: boolean
  interactive?: boolean
  onClick?: () => void
}

const BAR_COUNT = 5

// Traveling wave: all bars share one frequency, evenly phase-shifted left→right.
const WAVE_FREQ = 1.4
const WAVE_PHASE_STEP = (Math.PI * 2) / BAR_COUNT

// Match Circle's per-state colors
const STATE_COLORS: Record<string, string> = {
  idle: '#cccccc',
  connecting: '#cccccc',
  listening: '#999999',
  speaking: '#e8e8e8',
  error: '#f87171',
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

export function BarsTheme({
  state,
  volume,
  size,
  className,
  style,
  disabled = false,
  interactive = false,
  onClick,
  ...controlProps
}: BarsThemeProps) {
  const barRefs = useRef<(HTMLSpanElement | null)[]>([])
  const hoverRef = useRef<HTMLSpanElement>(null)
  const rafRef = useRef<number>(0)
  const smoothed = useRef<number[]>(new Array(BAR_COUNT).fill(0))
  const volumeRef = useRef(volume)
  const hoveredRef = useRef(false)
  const hoverBoostRef = useRef(0)
  const currentColorRef = useRef<[number, number, number]>(hexToRgb(STATE_COLORS.idle))

  // State transition: blend targets over BLEND_MS so bar heights don't jump
  const BLEND_MS = 300
  const blendStartRef = useRef<number | null>(null)
  const frozenHeightsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0))
  const prevStateRef = useRef(state)

  useEffect(() => {
    if (state !== prevStateRef.current) {
      frozenHeightsRef.current = [...smoothed.current]
      blendStartRef.current = Date.now()
      prevStateRef.current = state
    }
  }, [state])

  useEffect(() => {
    volumeRef.current = volume
  }, [volume])

  // Animation loop
  useEffect(() => {
    const maxH = size * 0.55
    const minH = size * 0.06

    const color = STATE_COLORS[state] ?? STATE_COLORS.idle

    const hoverBoostMax = size * 0.1
    // Diamond shape: center bar gets full boost, outer bars get less
    // [0.3, 0.65, 1.0, 0.65, 0.3]
    const diamondWeights = Array.from({ length: BAR_COUNT }, (_, i) => {
      const center = (BAR_COUNT - 1) / 2
      return 1 - 0.7 * (Math.abs(i - center) / center)
    })

    const updateHoverBoost = () => {
      const canHover = true
      const target = hoveredRef.current && canHover ? hoverBoostMax : 0
      hoverBoostRef.current += (target - hoverBoostRef.current) * 0.15
    }

    const setBars = (heights: number[], col: string) => {
      updateHoverBoost()
      // Lerp color toward target
      const tRgb = hexToRgb(col)
      const [cr, cg, cb] = currentColorRef.current
      currentColorRef.current = [
        cr + (tRgb[0] - cr) * 0.08,
        cg + (tRgb[1] - cg) * 0.08,
        cb + (tRgb[2] - cb) * 0.08,
      ]
      const [r, g, b] = currentColorRef.current.map(Math.round)
      const lerpedColor = `rgb(${r},${g},${b})`

      for (let i = 0; i < BAR_COUNT; i++) {
        const el = barRefs.current[i]
        if (!el) continue
        // Diamond shape on idle, uniform boost on other states
        const weight = state === 'idle' ? diamondWeights[i] : 1
        const boost = hoverBoostRef.current * weight
        el.style.height = `${Math.min(heights[i] + boost, maxH)}px`
        el.style.background = lerpedColor
        el.style.animation = 'none'
      }
    }

    if (state === 'listening' || state === 'speaking') {
      const freqScale = state === 'speaking' ? 1.0 : 0.4

      const animate = () => {
        const vol = volumeRef.current

        // Volume curves are now in the adapters — theme just animates
        const t = Date.now() / 1000

        for (let i = 0; i < BAR_COUNT; i++) {
          const osc =
            0.5 + 0.15 * Math.sin(t * WAVE_FREQ * freqScale * Math.PI * 2 + i * WAVE_PHASE_STEP)
          let targetH = minH + (maxH - minH) * vol * osc

          // During state transition, blend the target from frozen heights
          if (blendStartRef.current !== null) {
            const elapsed = Date.now() - blendStartRef.current
            const progress = Math.min(elapsed / BLEND_MS, 1)
            const ease = 1 - (1 - progress) * (1 - progress)
            targetH = frozenHeightsRef.current[i] + (targetH - frozenHeightsRef.current[i]) * ease
            if (progress >= 1) blendStartRef.current = null
          }

          // Uniform lerp — speaking uses lower rate since bars show steps more visibly
          const rate = state === 'listening' ? 0.45 : 1.0

          smoothed.current[i] += (targetH - smoothed.current[i]) * rate
        }

        setBars(smoothed.current, color)
        rafRef.current = requestAnimationFrame(animate)
      }
      rafRef.current = requestAnimationFrame(animate)

      return () => cancelAnimationFrame(rafRef.current)
    }

    // connecting — regular wave animation (loading feel)
    if (state === 'connecting') {
      const startTime = Date.now()
      const animate = () => {
        const t = (Date.now() - startTime) / 1000
        updateHoverBoost()
        for (let i = 0; i < BAR_COUNT; i++) {
          // Sine hump: 50% sweep, 50% rest — left to right
          const cycle = (t * 0.6 + (i / BAR_COUNT) * 0.5) % 1.0
          const wave = cycle < 0.5 ? Math.sin((cycle / 0.5) * Math.PI) : 0
          const targetH = minH + (maxH * 0.4 - minH) * wave
          // Lerp from current height into wave for smooth transition from hover
          smoothed.current[i] += (targetH - smoothed.current[i]) * 0.15
        }
        setBars(smoothed.current, color)
        rafRef.current = requestAnimationFrame(animate)
      }
      rafRef.current = requestAnimationFrame(animate)
      return () => cancelAnimationFrame(rafRef.current)
    }

    // idle / error — use rAF so hover boost is responsive
    cancelAnimationFrame(rafRef.current)
    const animateStatic = () => {
      updateHoverBoost()
      for (let i = 0; i < BAR_COUNT; i++) {
        smoothed.current[i] += (minH - smoothed.current[i]) * 0.16
      }
      setBars(smoothed.current, color)
      rafRef.current = requestAnimationFrame(animateStatic)
    }
    rafRef.current = requestAnimationFrame(animateStatic)
    return () => cancelAnimationFrame(rafRef.current)
  }, [state, size])

  const barW = size * 0.055
  const gap = size * 0.035
  const radius = size * 0.03
  const maxH = size * 0.55
  const minH = size * 0.06
  const rootStyle: CSSProperties = {
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...style,
  }
  const content = (
    <span
      ref={hoverRef}
      onMouseEnter={() => {
        if (disabled) return
        hoveredRef.current = true
        if (hoverRef.current) hoverRef.current.style.filter = 'brightness(1.35)'
      }}
      onMouseLeave={() => {
        hoveredRef.current = false
        if (hoverRef.current) hoverRef.current.style.filter = 'brightness(1)'
      }}
      onTouchEnd={() => {
        setTimeout(() => {
          hoveredRef.current = false
          if (hoverRef.current) hoverRef.current.style.filter = 'brightness(1)'
        }, 200)
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap,
        transition: 'filter 0.3s ease',
        cursor: interactive ? (disabled ? 'not-allowed' : 'pointer') : 'default',
      }}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barRefs.current[i] = el
          }}
          style={{
            width: barW,
            minHeight: minH,
            maxHeight: maxH,
            height: minH,
            borderRadius: radius,
            background: STATE_COLORS[state] ?? STATE_COLORS.idle,
          }}
        />
      ))}
    </span>
  )

  if (interactive) {
    return (
      <button
        {...controlProps}
        type="button"
        className={className}
        disabled={disabled}
        onClick={disabled ? undefined : onClick}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          border: 0,
          padding: 0,
          margin: 0,
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...rootStyle,
        }}
      >
        {content}
      </button>
    )
  }

  return (
    <div {...controlProps} className={className} style={rootStyle}>
      {content}
    </div>
  )
}
