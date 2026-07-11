import { useCallback, useEffect, useState } from 'react'
import type { OrbProps, OrbSignal } from './Orb.types'
import { deriveOrbState, deriveOrbVolume } from './signals'
import { DebugTheme } from '../../themes/debug'
import { CircleTheme } from '../../themes/circle'
import { BarsTheme } from '../../themes/bars'

export function Orb({
  signal: signalProp,
  state: stateProp,
  volume: volumeProp,
  adapter,
  theme = 'debug',
  size = 200,
  className,
  style,
  disabled = false,
  onStart,
  onStop,
  ...htmlProps
}: OrbProps) {
  const [adapterSignal, setAdapterSignal] = useState<OrbSignal>({ state: 'idle' })

  useEffect(() => {
    setAdapterSignal({ state: 'idle' })

    if (!adapter) return
    const unsubscribe = adapter.subscribe(setAdapterSignal)
    return unsubscribe
  }, [adapter])

  const activeSignal = signalProp ?? adapterSignal
  const state = deriveOrbState(stateProp, signalProp, adapterSignal)
  const volume = deriveOrbVolume(volumeProp, state, activeSignal)

  const isActive = state !== 'idle' && state !== 'error'

  const handleClick = useCallback(() => {
    if (disabled) return

    if (isActive) {
      if (onStop) onStop()
      else adapter?.stop?.()
    } else {
      if (onStart) onStart()
      else adapter?.start?.()
    }
  }, [adapter, disabled, isActive, onStart, onStop])

  // Only render a clickable control when the current state can be handled.
  // Disabled controls stay semantic buttons but do not fire handlers.
  const interactive = isActive ? !!(adapter?.stop || onStop) : !!(adapter?.start || onStart)
  const clickHandler = interactive && !disabled ? handleClick : undefined
  const controlProps = {
    ...htmlProps,
    'aria-label':
      htmlProps['aria-label'] ??
      (interactive ? `${isActive ? 'Stop' : 'Start'} voice session` : undefined),
  }

  const sharedThemeProps = {
    state,
    volume,
    size,
    className,
    style,
    disabled,
    ...controlProps,
  }

  const interactiveThemeProps = {
    ...sharedThemeProps,
    interactive,
  }

  switch (theme) {
    case 'circle':
      return <CircleTheme {...interactiveThemeProps} onClick={clickHandler} />
    case 'bars':
      return <BarsTheme {...interactiveThemeProps} onClick={clickHandler} />
    case 'debug':
    default:
      return (
        <DebugTheme
          {...sharedThemeProps}
          onStart={disabled ? undefined : (onStart ?? (() => adapter?.start?.()))}
          onStop={disabled ? undefined : (onStop ?? (() => adapter?.stop?.()))}
        />
      )
  }
}
