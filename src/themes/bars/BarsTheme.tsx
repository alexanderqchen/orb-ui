import { useRef, useEffect } from 'react'
import type {
  OrbHtmlAttributes,
  OrbSlotProps,
  OrbState,
  OrbStyle,
} from '../../components/Orb/Orb.types'
import type { ResolvedBarsTheme } from '../config'
import { joinClassNames, resolveOrbSlot } from '../slots'

interface BarsThemeProps extends OrbHtmlAttributes {
  state: OrbState
  volume: number
  size: number
  declaredSize: number
  className?: string
  style?: OrbStyle
  slotProps?: OrbSlotProps
  rootRef?: (element: HTMLElement | null) => void
  disabled?: boolean
  interactive?: boolean
  onClick?: () => void
  config: ResolvedBarsTheme
}

const BAR_COUNT = 5

const WAVE_PHASE_STEP = (Math.PI * 2) / BAR_COUNT

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function followRate(durationMs: number, elapsedMs: number) {
  if (durationMs <= 0) return 1
  return 1 - Math.pow(0.1, elapsedMs / durationMs)
}

export function BarsTheme({
  state,
  volume,
  size,
  declaredSize,
  className,
  style,
  slotProps,
  rootRef,
  disabled = false,
  interactive = false,
  onClick,
  config,
  ...controlProps
}: BarsThemeProps) {
  const barRefs = useRef<(HTMLSpanElement | null)[]>([])
  const hoverRef = useRef<HTMLSpanElement>(null)
  const rafRef = useRef<number>(0)
  const smoothed = useRef<number[]>(new Array(BAR_COUNT).fill(0))
  const volumeRef = useRef(volume)
  const hoveredRef = useRef(false)
  const hoverBoostRef = useRef(0)
  const currentColorRef = useRef<[number, number, number]>(hexToRgb(config.appearance.colors.idle))

  // State transition: blend from frozen heights so bars do not jump.
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
    const maxH = size * config.geometry.maxHeightRatio
    const minH = size * config.geometry.minHeightRatio

    const color = config.appearance.colors[state] ?? config.appearance.colors.idle

    const hoverBoostMax = size * 0.1
    // Diamond shape: center bar gets full boost, outer bars get less
    // [0.3, 0.65, 1.0, 0.65, 0.3]
    const diamondWeights = Array.from({ length: BAR_COUNT }, (_, i) => {
      const center = (BAR_COUNT - 1) / 2
      return 1 - 0.7 * (Math.abs(i - center) / center)
    })

    const updateHoverBoost = () => {
      const canHover = interactive && !disabled
      const target = hoveredRef.current && canHover ? hoverBoostMax : 0
      hoverBoostRef.current += (target - hoverBoostRef.current) * 0.15
    }

    const setBars = (heights: number[], col: string, elapsedMs: number) => {
      updateHoverBoost()
      // Lerp color toward target
      const tRgb = hexToRgb(col)
      const [cr, cg, cb] = currentColorRef.current
      const colorRate = followRate(config.motion.stateTransitionMs, elapsedMs)
      currentColorRef.current = [
        cr + (tRgb[0] - cr) * colorRate,
        cg + (tRgb[1] - cg) * colorRate,
        cb + (tRgb[2] - cb) * colorRate,
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
      const freqScale =
        state === 'speaking' ? config.motion.speakingTempo : config.motion.listeningTempo
      let previousTime = performance.now()

      const animate = (now: number) => {
        const elapsedMs = Math.min(now - previousTime, 100)
        previousTime = now
        const vol = Math.pow(Math.max(0, volumeRef.current), config.motion.responseExponent)

        // Volume curves are now in the adapters — theme just animates
        const t = Date.now() / 1000

        for (let i = 0; i < BAR_COUNT; i++) {
          const osc =
            0.5 +
            0.15 *
              Math.sin(
                t * config.motion.waveFrequency * freqScale * Math.PI * 2 + i * WAVE_PHASE_STEP,
              )
          let targetH = minH + (maxH - minH) * vol * osc

          // During state transition, blend the target from frozen heights
          if (blendStartRef.current !== null) {
            const elapsed = Date.now() - blendStartRef.current
            const progress =
              config.motion.stateTransitionMs <= 0
                ? 1
                : Math.min(elapsed / config.motion.stateTransitionMs, 1)
            const ease = 1 - (1 - progress) * (1 - progress)
            targetH = frozenHeightsRef.current[i] + (targetH - frozenHeightsRef.current[i]) * ease
            if (progress >= 1) blendStartRef.current = null
          }

          const duration =
            targetH > smoothed.current[i]
              ? config.motion.activityRiseMs
              : config.motion.activityFallMs
          const rate = followRate(duration, elapsedMs)

          smoothed.current[i] += (targetH - smoothed.current[i]) * rate
        }

        setBars(smoothed.current, color, elapsedMs)
        rafRef.current = requestAnimationFrame(animate)
      }
      rafRef.current = requestAnimationFrame(animate)

      return () => cancelAnimationFrame(rafRef.current)
    }

    // connecting / thinking — regular wave animation (loading feel)
    if (state === 'connecting' || state === 'thinking') {
      const startTime = Date.now()
      let previousTime = performance.now()
      const animate = (now: number) => {
        const elapsedMs = Math.min(now - previousTime, 100)
        previousTime = now
        const t = (Date.now() - startTime) / 1000
        updateHoverBoost()
        for (let i = 0; i < BAR_COUNT; i++) {
          // Sine hump: 50% sweep, 50% rest — left to right
          const cycle = (t * config.motion.loadingTempo + (i / BAR_COUNT) * 0.5) % 1.0
          const wave = cycle < 0.5 ? Math.sin((cycle / 0.5) * Math.PI) : 0
          const targetH = minH + (maxH * 0.4 - minH) * wave
          // Lerp from current height into wave for smooth transition from hover
          smoothed.current[i] +=
            (targetH - smoothed.current[i]) * followRate(config.motion.stateTransitionMs, elapsedMs)
        }
        setBars(smoothed.current, color, elapsedMs)
        rafRef.current = requestAnimationFrame(animate)
      }
      rafRef.current = requestAnimationFrame(animate)
      return () => cancelAnimationFrame(rafRef.current)
    }

    // idle / error — use rAF so hover boost is responsive
    cancelAnimationFrame(rafRef.current)
    let previousTime = performance.now()
    const animateStatic = (now: number) => {
      const elapsedMs = Math.min(now - previousTime, 100)
      previousTime = now
      updateHoverBoost()
      for (let i = 0; i < BAR_COUNT; i++) {
        smoothed.current[i] +=
          (minH - smoothed.current[i]) * followRate(config.motion.stateTransitionMs, elapsedMs)
      }
      setBars(smoothed.current, color, elapsedMs)
      rafRef.current = requestAnimationFrame(animateStatic)
    }
    rafRef.current = requestAnimationFrame(animateStatic)
    return () => cancelAnimationFrame(rafRef.current)
  }, [config, size, state])

  const barW = size * config.geometry.barWidthRatio
  const gap = size * config.geometry.gapRatio
  const radius = size * config.geometry.borderRadiusRatio
  const maxH = size * config.geometry.maxHeightRatio
  const minH = size * config.geometry.minHeightRatio
  const rootSlot = resolveOrbSlot(slotProps, 'root', 'orb-ui', 'orb-ui--bars', className)
  const contentSlot = resolveOrbSlot(slotProps, 'content')
  const barSlot = resolveOrbSlot(slotProps, 'bar')
  const controlSlot = resolveOrbSlot(slotProps, 'control')
  const { className: rootClassName, style: rootSlotStyle, ...rootAttributes } = rootSlot
  const { className: contentClassName, style: contentStyle, ...contentAttributes } = contentSlot
  const { className: barClassName, style: barStyle, ...barAttributes } = barSlot
  const { className: controlClassName, style: controlStyle, ...controlAttributes } = controlSlot
  const rootStyle: OrbStyle = {
    width: `var(--orb-ui-size, ${declaredSize}px)`,
    height: `var(--orb-ui-size, ${declaredSize}px)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...style,
    ...rootSlotStyle,
  }
  const content = (
    <span
      {...contentAttributes}
      ref={hoverRef}
      className={contentClassName}
      data-orb-ui-slot="content"
      onMouseEnter={() => {
        if (!interactive || disabled) return
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
        ...contentStyle,
      }}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span
          {...barAttributes}
          key={i}
          ref={(el) => {
            barRefs.current[i] = el
          }}
          className={barClassName}
          data-orb-ui-index={i}
          data-orb-ui-slot="bar"
          aria-hidden="true"
          style={{
            width: barW,
            minHeight: minH,
            maxHeight: maxH,
            height: minH,
            borderRadius: radius,
            background: config.appearance.colors[state] ?? config.appearance.colors.idle,
            ...barStyle,
          }}
        />
      ))}
    </span>
  )

  if (interactive) {
    return (
      <button
        {...rootAttributes}
        {...controlAttributes}
        {...controlProps}
        ref={rootRef}
        type="button"
        className={joinClassNames(rootClassName, controlClassName)}
        data-orb-ui-slot="root"
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
          ...controlStyle,
        }}
      >
        {content}
      </button>
    )
  }

  return (
    <div
      {...rootAttributes}
      {...controlProps}
      ref={rootRef}
      className={rootClassName}
      data-orb-ui-slot="root"
      style={rootStyle}
    >
      {content}
    </div>
  )
}
