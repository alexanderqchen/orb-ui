import { useRef, useEffect, useLayoutEffect } from 'react'
import type { CSSProperties } from 'react'
import type { OrbHtmlAttributes, OrbState } from '../../components/Orb/Orb.types'
import type { ResolvedCircleTheme } from '../config'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

interface CircleThemeProps extends OrbHtmlAttributes {
  state: OrbState
  volume: number
  size: number
  className?: string
  style?: CSSProperties
  disabled?: boolean
  interactive?: boolean
  onClick?: () => void
  config: ResolvedCircleTheme
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

const SETTLE_SCALE_EPSILON = 0.002

function followRate(durationMs: number, elapsedMs: number) {
  if (durationMs <= 0) return 1
  return 1 - Math.pow(0.1, elapsedMs / durationMs)
}

export function CircleTheme({
  state,
  volume,
  size,
  className,
  style,
  disabled = false,
  interactive = false,
  onClick,
  config,
  ...controlProps
}: CircleThemeProps) {
  const circleRef = useRef<HTMLSpanElement>(null)
  const glowRef = useRef<HTMLSpanElement>(null)
  const hoverRef = useRef<HTMLSpanElement>(null)
  const rafRef = useRef<number>(0)

  // Sync signal volume into a ref so the rAF loop always reads the latest
  // value without being in the useEffect dependency array.
  const volumeRef = useRef(volume)
  useIsomorphicLayoutEffect(() => {
    volumeRef.current = volume
  }, [volume])

  // Persistent animation state — survives speaking↔listening state transitions
  // (the adapter debounces these, but refs make the theme resilient regardless).
  const currentScaleRef = useRef(1)
  const currentGlowRef = useRef(0)
  const currentColorRef = useRef<RGB>(hexToRgb(config.appearance.colors.idle))

  // State transition blending — lerps base/range toward new state's targets
  // so size changes smoothly between states without affecting volume reactivity
  const currentBaseRef = useRef(config.geometry.listeningMinScale)
  const currentRangeRef = useRef(
    config.geometry.listeningMaxScale - config.geometry.listeningMinScale,
  )

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
  // Runs at display rate (~60 fps). Reads signal volume via ref, interpolates
  // toward target scale/glow/color, writes directly to DOM style.
  useEffect(() => {
    const el = circleRef.current
    if (!el) return

    if (state === 'listening' || state === 'speaking') {
      const base =
        state === 'speaking' ? config.geometry.speakingMinScale : config.geometry.listeningMinScale
      const peak =
        state === 'speaking' ? config.geometry.speakingMaxScale : config.geometry.listeningMaxScale
      const range = peak - base
      const glow =
        state === 'speaking' ? config.appearance.speakingGlow : config.appearance.listeningGlow
      let previousTime = performance.now()

      const animate = (now: number) => {
        const elapsedMs = Math.min(now - previousTime, 100)
        previousTime = now
        const vol = Math.pow(Math.max(0, volumeRef.current), config.motion.responseExponent)
        const transitionRate = followRate(config.motion.stateTransitionMs, elapsedMs)

        // Blend base/range toward current state's targets (smooth state transitions)
        currentBaseRef.current += (base - currentBaseRef.current) * transitionRate
        currentRangeRef.current += (range - currentRangeRef.current) * transitionRate

        // Volume curves are now applied in the adapters — theme just animates
        const tScale = currentBaseRef.current + vol * currentRangeRef.current
        const tGlow = vol * glow

        const activityDuration =
          tScale > currentScaleRef.current
            ? config.motion.activityRiseMs
            : config.motion.activityFallMs
        const activityRate = followRate(activityDuration, elapsedMs)
        currentScaleRef.current += (tScale - currentScaleRef.current) * activityRate
        currentGlowRef.current += (tGlow - currentGlowRef.current) * activityRate

        // Color: lerp toward state color (handles state transition fades;
        // avoids CSS transition flicker on rapid speaking↔listening changes)
        const tRgb = hexToRgb(config.appearance.colors[state])
        const [cr, cg, cb] = currentColorRef.current
        currentColorRef.current = [
          cr + (tRgb[0] - cr) * transitionRate,
          cg + (tRgb[1] - cg) * transitionRate,
          cb + (tRgb[2] - cb) * transitionRate,
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
      // Non-active states: settle from the current active visual before handing
      // off to CSS animations. This avoids a visible snap from listening's
      // compact base scale back to idle.
      cancelAnimationFrame(rafRef.current)
      const c = config.appearance.colors[state] ?? config.appearance.colors.idle
      const tRgb = hexToRgb(c)
      let previousTime = performance.now()

      const settle = (now: number) => {
        const elapsedMs = Math.min(now - previousTime, 100)
        previousTime = now
        const settleRate = followRate(config.motion.stateTransitionMs, elapsedMs)
        currentScaleRef.current += (1 - currentScaleRef.current) * settleRate
        currentGlowRef.current += (0 - currentGlowRef.current) * settleRate

        const [cr, cg, cb] = currentColorRef.current
        currentColorRef.current = [
          cr + (tRgb[0] - cr) * settleRate,
          cg + (tRgb[1] - cg) * settleRate,
          cb + (tRgb[2] - cb) * settleRate,
        ]
        const [r, g, b] = currentColorRef.current.map(Math.round)

        el.style.transform = `scale(${currentScaleRef.current})`
        el.style.background = `rgb(${r},${g},${b})`
        el.style.boxShadow = 'none'
        el.style.animation = 'none'

        if (glowRef.current) {
          glowRef.current.style.transform = `scale(${currentScaleRef.current})`
          glowRef.current.style.boxShadow = 'none'
        }

        const scaleDone = Math.abs(currentScaleRef.current - 1) < SETTLE_SCALE_EPSILON
        const glowDone = currentGlowRef.current < 0.1
        const colorDone = currentColorRef.current.every(
          (channel, i) => Math.abs(channel - tRgb[i]) < 1,
        )

        if (scaleDone && glowDone && colorDone) {
          currentScaleRef.current = 1
          currentGlowRef.current = 0
          currentColorRef.current = tRgb

          el.style.transform = ''
          el.style.boxShadow = 'none'
          el.style.background = c
          if (glowRef.current) {
            glowRef.current.style.transform = 'scale(1)'
            glowRef.current.style.boxShadow = 'none'
          }

          if (state === 'idle') {
            el.style.animation = `orb-circle-idle-pulse ${config.motion.idlePulseMs}ms ease-in-out infinite alternate`
          } else if (state === 'connecting' || state === 'thinking') {
            el.style.animation = `orb-circle-connecting-pulse ${config.motion.processingPulseMs}ms ease-in-out infinite`
          } else {
            el.style.animation = 'none'
          }
          return
        }

        rafRef.current = requestAnimationFrame(settle)
      }

      rafRef.current = requestAnimationFrame(settle)

      return () => cancelAnimationFrame(rafRef.current)
    }
  }, [config, state])

  const d = size * config.geometry.diameterRatio
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
        if (hoverRef.current && interactive && !disabled) {
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
        position: 'relative',
        display: 'inline-block',
        transition: 'transform 0.3s ease, filter 0.3s ease',
        cursor: interactive ? (disabled ? 'not-allowed' : 'pointer') : 'default',
        borderRadius: '50%',
        lineHeight: 0,
      }}
    >
      {/* Glow element — behind the circle */}
      <span
        ref={glowRef}
        style={{
          position: 'absolute',
          display: 'block',
          width: d,
          height: d,
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
      />
      {/* Circle — on top */}
      <span
        ref={circleRef}
        style={{
          position: 'relative',
          display: 'block',
          width: d,
          height: d,
          borderRadius: '50%',
          background: config.appearance.colors[state],
        }}
      />
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
