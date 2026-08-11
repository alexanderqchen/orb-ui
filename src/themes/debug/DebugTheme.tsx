import type { HTMLAttributes } from 'react'
import type { OrbSlotProps, OrbState, OrbStyle } from '../../components/Orb/Orb.types'
import type { ResolvedDebugTheme } from '../config'
import { joinClassNames, resolveOrbSlot } from '../slots'

type DebugThemeRootProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style'>

interface DebugThemeProps extends DebugThemeRootProps {
  state: OrbState
  volume: number
  size: number
  declaredSize: number
  className?: string
  style?: OrbStyle
  slotProps?: OrbSlotProps
  rootRef?: (element: HTMLElement | null) => void
  disabled?: boolean
  onStart?: () => void | Promise<void>
  onStop?: () => void | Promise<void>
  config: ResolvedDebugTheme
}

const ALL_STATES: OrbState[] = ['idle', 'connecting', 'listening', 'thinking', 'speaking', 'error']

export function DebugTheme({
  state,
  volume,
  size,
  declaredSize,
  className,
  style,
  slotProps,
  rootRef,
  disabled = false,
  onStart,
  onStop,
  config,
  ...rootProps
}: DebugThemeProps) {
  const displayedVolume = Math.pow(Math.max(0, volume), config.motion.responseExponent)
  const rootSlot = resolveOrbSlot(slotProps, 'root', 'orb-ui', 'orb-ui--debug', className)
  const headerSlot = resolveOrbSlot(slotProps, 'header')
  const labelSlot = resolveOrbSlot(slotProps, 'label')
  const meterTrackSlot = resolveOrbSlot(slotProps, 'meterTrack')
  const meterFillSlot = resolveOrbSlot(slotProps, 'meterFill')
  const actionsSlot = resolveOrbSlot(slotProps, 'actions')
  const controlSlot = resolveOrbSlot(slotProps, 'control')
  const { className: rootClassName, style: rootSlotStyle, ...rootAttributes } = rootSlot
  const { className: headerClassName, style: headerStyle, ...headerAttributes } = headerSlot
  const { className: labelClassName, style: labelStyle, ...labelAttributes } = labelSlot
  const {
    className: meterTrackClassName,
    style: meterTrackStyle,
    ...meterTrackAttributes
  } = meterTrackSlot
  const {
    className: meterFillClassName,
    style: meterFillStyle,
    ...meterFillAttributes
  } = meterFillSlot
  const { className: actionsClassName, style: actionsStyle, ...actionsAttributes } = actionsSlot
  const { className: controlClassName, style: controlStyle, ...controlAttributes } = controlSlot

  return (
    <div
      {...rootAttributes}
      {...rootProps}
      ref={rootRef}
      className={rootClassName}
      data-orb-ui-rendered-size={Math.round(size)}
      data-orb-ui-slot="root"
      style={{
        width: `var(--orb-ui-size, ${declaredSize}px)`,
        fontFamily: 'monospace',
        fontSize: 12,
        background: config.appearance.backgroundColor,
        color: config.appearance.textColor,
        border: `1px solid ${config.appearance.borderColor}`,
        borderRadius: config.geometry.borderRadius,
        padding: config.geometry.padding,
        boxSizing: 'border-box',
        userSelect: 'none',
        ...style,
        ...rootSlotStyle,
      }}
    >
      {/* Header */}
      <div
        {...headerAttributes}
        className={headerClassName}
        data-orb-ui-slot="header"
        style={{ color: '#555', marginBottom: 10, fontSize: 10, letterSpacing: 1, ...headerStyle }}
      >
        ORB DEBUG
      </div>

      {/* State */}
      <div style={{ marginBottom: 8 }}>
        <span
          {...labelAttributes}
          className={labelClassName}
          data-orb-ui-slot="label"
          style={{ color: '#555', ...labelStyle }}
        >
          state{' '}
        </span>
        <span style={{ color: config.appearance.colors[state], fontWeight: 'bold' }}>{state}</span>
      </div>

      {/* Volume */}
      <div style={{ marginBottom: 10 }}>
        <span
          {...labelAttributes}
          className={labelClassName}
          data-orb-ui-slot="label"
          style={{ color: '#555', ...labelStyle }}
        >
          volume{' '}
        </span>
        <span style={{ color: config.appearance.textColor }}>{displayedVolume.toFixed(2)}</span>
        <div
          {...meterTrackAttributes}
          className={meterTrackClassName}
          data-orb-ui-slot="meter-track"
          style={{
            marginTop: 4,
            height: 4,
            background: '#222',
            borderRadius: 2,
            overflow: 'hidden',
            ...meterTrackStyle,
          }}
        >
          <div
            {...meterFillAttributes}
            className={meterFillClassName}
            data-orb-ui-slot="meter-fill"
            style={{
              height: '100%',
              width: `${displayedVolume * 100}%`,
              background: config.appearance.colors[state],
              borderRadius: 2,
              transition: 'width 50ms linear',
              ...meterFillStyle,
            }}
          />
        </div>
      </div>

      {/* State buttons */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ color: '#555', marginBottom: 4, fontSize: 10 }}>force state</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {ALL_STATES.map((s) => (
            <button
              {...controlAttributes}
              key={s}
              className={controlClassName}
              data-orb-ui-slot="control"
              disabled={disabled}
              style={{
                fontSize: 10,
                padding: '2px 6px',
                background: state === s ? config.appearance.colors[s] : '#222',
                color: state === s ? '#000' : '#888',
                border: `1px solid ${state === s ? config.appearance.colors[s] : '#333'}`,
                borderRadius: 3,
                cursor: disabled ? 'not-allowed' : 'pointer',
                ...controlStyle,
              }}
              // Note: forcing state from the debug panel requires controlled mode.
              // In controlled mode, wire this to your own state setter.
              onClick={() => {
                console.warn(
                  `[orb-ui debug] To force state '${s}', use controlled mode: <Orb state="${s}" />`,
                )
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Start / Stop */}
      <div
        {...actionsAttributes}
        className={actionsClassName}
        data-orb-ui-slot="actions"
        style={{ display: 'flex', gap: 6, ...actionsStyle }}
      >
        <button
          {...controlAttributes}
          className={joinClassNames(controlClassName, 'orb-ui__control--start')}
          data-orb-ui-slot="control"
          disabled={disabled}
          onClick={onStart}
          style={{
            flex: 1,
            padding: '4px 0',
            background: '#1a3a1a',
            color: '#40f080',
            border: '1px solid #40f080',
            borderRadius: 4,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 11,
            ...controlStyle,
          }}
        >
          Start
        </button>
        <button
          {...controlAttributes}
          className={joinClassNames(controlClassName, 'orb-ui__control--stop')}
          data-orb-ui-slot="control"
          disabled={disabled}
          onClick={onStop}
          style={{
            flex: 1,
            padding: '4px 0',
            background: '#3a1a1a',
            color: '#f04040',
            border: '1px solid #f04040',
            borderRadius: 4,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 11,
            ...controlStyle,
          }}
        >
          Stop
        </button>
      </div>
    </div>
  )
}
