import { useCallback, useEffect, useMemo, useState } from 'react'
import type { OrbProps, OrbSignal } from './Orb.types'
import { deriveOrbState, selectOrbVolume } from './signals'
import { DebugTheme } from '../../themes/debug'
import { CircleTheme } from '../../themes/circle'
import { BarsTheme } from '../../themes/bars'
import { CloudTheme } from '../../themes/cloud'
import { RadialTheme } from '../../themes/radial'
import { resolveOrbTheme } from '../../themes/config'

export function Orb({
  signal: signalProp,
  state: stateProp,
  adapter,
  theme = 'debug',
  size = 200,
  className,
  style,
  disabled = false,
  interactive: interactiveProp = true,
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
  const volume = selectOrbVolume(state, activeSignal)
  const themeKey = JSON.stringify(theme)
  const resolvedTheme = useMemo(
    () => resolveOrbTheme(JSON.parse(themeKey) as NonNullable<OrbProps['theme']>),
    [themeKey],
  )

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
  const canInteract = isActive ? !!(adapter?.stop || onStop) : !!(adapter?.start || onStart)
  const interactive = interactiveProp && canInteract
  const clickHandler = interactive && !disabled ? handleClick : undefined
  const controlProps = {
    ...htmlProps,
    'data-orb-ui-theme': resolvedTheme.name,
    'data-orb-ui-preset': resolvedTheme.preset,
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

  switch (resolvedTheme.name) {
    case 'circle':
      return (
        <CircleTheme {...interactiveThemeProps} config={resolvedTheme} onClick={clickHandler} />
      )
    case 'bars':
      return <BarsTheme {...interactiveThemeProps} config={resolvedTheme} onClick={clickHandler} />
    case 'cloud':
      return <CloudTheme {...interactiveThemeProps} config={resolvedTheme} onClick={clickHandler} />
    case 'radial':
      return (
        <RadialTheme {...interactiveThemeProps} config={resolvedTheme} onClick={clickHandler} />
      )
    case 'debug':
    default:
      return (
        <DebugTheme
          {...sharedThemeProps}
          config={resolvedTheme}
          disabled={disabled || !interactiveProp}
          onStart={
            disabled || !interactiveProp ? undefined : (onStart ?? (() => adapter?.start?.()))
          }
          onStop={disabled || !interactiveProp ? undefined : (onStop ?? (() => adapter?.stop?.()))}
        />
      )
  }
}
