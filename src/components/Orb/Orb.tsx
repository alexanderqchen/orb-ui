import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { OrbProps, OrbSignal, OrbThemeRendererControlProps } from './Orb.types'
import { useOrbThemeDefaults } from './OrbThemeProvider'
import { deriveOrbState, selectOrbVolume } from './signals'
import { DebugTheme } from '../../themes/debug'
import { CircleTheme } from '../../themes/circle'
import { BarsTheme } from '../../themes/bars'
import { CloudTheme } from '../../themes/cloud'
import { RadialTheme } from '../../themes/radial'
import { mergeOrbThemes, resolveOrbTheme } from '../../themes/config'
import type { ResolvedOrbTheme } from '../../themes/config'
import { readOrbThemeCssVariables } from '../../themes/css-variables'
import { joinClassNames, mergeOrbSlotProps, resolveOrbSlot } from '../../themes/slots'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

interface CssThemeResolution {
  baseKey: string
  theme: ResolvedOrbTheme
}

export function Orb(props: OrbProps) {
  const defaults = useOrbThemeDefaults()
  const {
    signal: signalProp,
    state: stateProp,
    adapter,
    theme: themeProp,
    size: sizeProp,
    className: classNameProp,
    style: styleProp,
    slotProps: slotPropsProp,
    components: componentsProp,
    renderTheme: renderThemeProp,
    disabled = false,
    interactive: interactiveProp = true,
    onStart,
    onStop,
    ...htmlProps
  } = props

  const theme = mergeOrbThemes(defaults?.theme, themeProp)
  const declaredSize = sizeProp ?? defaults?.size ?? 200
  const className = joinClassNames(defaults?.className, classNameProp)
  const style = useMemo(() => ({ ...defaults?.style, ...styleProp }), [defaults?.style, styleProp])
  const slotProps = useMemo(
    () => mergeOrbSlotProps(defaults?.slotProps, slotPropsProp),
    [defaults?.slotProps, slotPropsProp],
  )
  const components = useMemo(
    () => ({ ...defaults?.components, ...componentsProp }),
    [componentsProp, defaults?.components],
  )
  const renderTheme = renderThemeProp ?? defaults?.renderTheme

  const [adapterSignal, setAdapterSignal] = useState<OrbSignal>({ state: 'idle' })
  const [rootElement, setRootElement] = useState<HTMLElement | null>(null)
  const [measuredSize, setMeasuredSize] = useState(declaredSize)
  const [cssResolution, setCssResolution] = useState<CssThemeResolution>()

  useEffect(() => {
    setAdapterSignal({ state: 'idle' })

    if (!adapter) return
    const unsubscribe = adapter.subscribe(setAdapterSignal)
    return unsubscribe
  }, [adapter])

  const activeSignal = signalProp ?? adapterSignal
  const state = deriveOrbState(stateProp, signalProp, adapterSignal)
  const activity = selectOrbVolume(state, activeSignal)
  const inputVolume = activeSignal.inputVolume ?? 0
  const outputVolume = activeSignal.outputVolume ?? 0
  const rendererSignal = useMemo<OrbSignal>(
    () => ({ ...activeSignal, state, inputVolume, outputVolume }),
    [activeSignal, inputVolume, outputVolume, state],
  )

  const themeKey = JSON.stringify(theme)
  const baseTheme = useMemo(
    () => resolveOrbTheme(JSON.parse(themeKey) as NonNullable<OrbProps['theme']>),
    [themeKey],
  )
  const resolvedTheme = cssResolution?.baseKey === themeKey ? cssResolution.theme : baseTheme

  const rootRef = useCallback((element: HTMLElement | null) => {
    setRootElement(element)
  }, [])

  const synchronizeCssCustomization = useCallback(() => {
    if (!rootElement) return

    const width = rootElement.getBoundingClientRect().width
    if (Number.isFinite(width) && width > 0) {
      setMeasuredSize((current) => (Math.abs(current - width) < 0.25 ? current : width))
    }

    const nextTheme = readOrbThemeCssVariables(rootElement, baseTheme)
    const nextKey = JSON.stringify(nextTheme)
    setCssResolution((current) => {
      if (current?.baseKey === themeKey && JSON.stringify(current.theme) === nextKey) return current
      return { baseKey: themeKey, theme: nextTheme }
    })
  }, [baseTheme, rootElement, themeKey])

  useIsomorphicLayoutEffect(() => {
    if (!rootElement) return

    synchronizeCssCustomization()

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(synchronizeCssCustomization)
    resizeObserver?.observe(rootElement)

    const mutationObserver = new MutationObserver(synchronizeCssCustomization)
    mutationObserver.observe(rootElement, { attributes: true, attributeFilter: ['class', 'style'] })
    window.addEventListener('resize', synchronizeCssCustomization, { passive: true })

    return () => {
      resizeObserver?.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener('resize', synchronizeCssCustomization)
    }
  }, [rootElement, synchronizeCssCustomization])

  useEffect(() => {
    setMeasuredSize(declaredSize)
  }, [declaredSize])

  const isActive = state !== 'idle' && state !== 'error'

  const start = useCallback(() => {
    if (disabled) return
    if (onStart) return onStart()
    return adapter?.start?.()
  }, [adapter, disabled, onStart])

  const stop = useCallback(() => {
    if (disabled) return
    if (onStop) return onStop()
    return adapter?.stop?.()
  }, [adapter, disabled, onStop])

  const toggle = useCallback(() => (isActive ? stop() : start()), [isActive, start, stop])

  // Only render a clickable control when the current state can be handled.
  // Disabled controls stay semantic buttons but do not fire handlers.
  const canInteract = isActive ? !!(adapter?.stop || onStop) : !!(adapter?.start || onStart)
  const interactive = interactiveProp && canInteract
  const clickHandler = interactive && !disabled ? toggle : undefined
  const ariaLabel =
    htmlProps['aria-label'] ??
    (interactive ? `${isActive ? 'Stop' : 'Start'} voice session` : undefined)
  const controlProps = {
    ...htmlProps,
    'data-orb-ui-theme': resolvedTheme.name,
    'data-orb-ui-preset': resolvedTheme.preset,
    'data-orb-ui-state': state,
    'aria-label': ariaLabel,
  }

  if (renderTheme) {
    const rootSlot = resolveOrbSlot(slotProps, 'root', 'orb-ui', 'orb-ui--custom', className)
    const customControlSlot = resolveOrbSlot(slotProps, 'control')
    const { className: rootSlotClassName, style: rootSlotStyle, ...rootSlotAttributes } = rootSlot
    const {
      className: controlSlotClassName,
      style: controlSlotStyle,
      ...controlSlotAttributes
    } = customControlSlot
    const customControlProps: OrbThemeRendererControlProps = {
      ...controlSlotAttributes,
      ...htmlProps,
      type: 'button',
      className: controlSlotClassName,
      style: controlSlotStyle,
      disabled: disabled || !interactive,
      onClick: clickHandler,
      'data-orb-ui-slot': 'control',
      'data-orb-ui-state': state,
      'aria-label': ariaLabel,
    }

    return renderTheme({
      state,
      signal: rendererSignal,
      inputVolume,
      outputVolume,
      activity,
      size: measuredSize,
      isActive,
      interactive,
      disabled,
      start,
      stop,
      toggle,
      rootProps: {
        ...rootSlotAttributes,
        ref: rootRef,
        className: rootSlotClassName,
        style: {
          width: `var(--orb-ui-size, ${declaredSize}px)`,
          height: `var(--orb-ui-size, ${declaredSize}px)`,
          ...style,
          ...rootSlotStyle,
        },
        'data-orb-ui-theme': 'custom',
        'data-orb-ui-state': state,
        'data-orb-ui-slot': 'root',
      },
      controlProps: customControlProps,
    })
  }

  const sharedThemeProps = {
    state,
    volume: activity,
    size: measuredSize,
    declaredSize,
    className,
    style,
    slotProps,
    rootRef,
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
        <RadialTheme
          {...interactiveThemeProps}
          components={components}
          config={resolvedTheme}
          onClick={clickHandler}
        />
      )
    case 'debug':
    default:
      return (
        <DebugTheme
          {...sharedThemeProps}
          config={resolvedTheme}
          disabled={disabled || !interactiveProp}
          onStart={disabled || !interactiveProp ? undefined : start}
          onStop={disabled || !interactiveProp ? undefined : stop}
        />
      )
  }
}
