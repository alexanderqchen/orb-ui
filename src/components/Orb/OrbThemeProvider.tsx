import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type {
  OrbSlotProps,
  OrbStyle,
  OrbTheme,
  OrbThemeComponents,
  OrbThemeRenderer,
} from './Orb.types'

export interface OrbThemeDefaults {
  theme?: OrbTheme
  size?: number
  className?: string
  style?: OrbStyle
  slotProps?: OrbSlotProps
  components?: OrbThemeComponents
  renderTheme?: OrbThemeRenderer
}

export interface OrbThemeProviderProps extends OrbThemeDefaults {
  children: ReactNode
}

const OrbThemeContext = createContext<OrbThemeDefaults | undefined>(undefined)

export function OrbThemeProvider({
  children,
  theme,
  size,
  className,
  style,
  slotProps,
  components,
  renderTheme,
}: OrbThemeProviderProps) {
  const value = useMemo<OrbThemeDefaults>(
    () => ({ theme, size, className, style, slotProps, components, renderTheme }),
    [className, components, renderTheme, size, slotProps, style, theme],
  )

  return <OrbThemeContext.Provider value={value}>{children}</OrbThemeContext.Provider>
}

export function useOrbThemeDefaults() {
  return useContext(OrbThemeContext)
}
