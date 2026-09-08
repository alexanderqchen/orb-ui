import type { OrbThemeConfig, OrbThemeName, ResolvedOrbTheme } from './config'
import { resolveOrbTheme } from './config'

export type OrbThemeCssSection = 'appearance' | 'geometry' | 'motion'

function kebabCase(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

export function orbThemeCssVariable(
  theme: OrbThemeName,
  section: OrbThemeCssSection,
  property: string,
  nestedProperty?: string,
) {
  const suffix = nestedProperty
    ? `${kebabCase(property)}-${kebabCase(nestedProperty)}`
    : kebabCase(property)
  return `--orb-ui-${theme}-${section}-${suffix}`
}

function readSection(
  styles: CSSStyleDeclaration,
  theme: OrbThemeName,
  section: OrbThemeCssSection,
  base: Record<string, unknown>,
) {
  const overrides: Record<string, unknown> = {}

  for (const [property, fallback] of Object.entries(base)) {
    if (typeof fallback === 'object' && fallback !== null) {
      const nestedOverrides: Record<string, unknown> = {}
      for (const [nestedProperty, nestedFallback] of Object.entries(fallback)) {
        const raw = styles
          .getPropertyValue(orbThemeCssVariable(theme, section, property, nestedProperty))
          .trim()
        if (!raw) continue

        if (typeof nestedFallback === 'number') {
          const numeric = Number.parseFloat(raw)
          if (Number.isFinite(numeric)) nestedOverrides[nestedProperty] = numeric
        } else {
          nestedOverrides[nestedProperty] = raw
        }
      }
      if (Object.keys(nestedOverrides).length > 0) overrides[property] = nestedOverrides
      continue
    }

    const raw = styles.getPropertyValue(orbThemeCssVariable(theme, section, property)).trim()
    if (!raw) continue

    if (typeof fallback === 'number') {
      const numeric = Number.parseFloat(raw)
      if (Number.isFinite(numeric)) overrides[property] = numeric
    } else {
      overrides[property] = raw
    }
  }

  return overrides
}

function mergeSection(base: Record<string, unknown>, overrides: Record<string, unknown>) {
  const merged = { ...base }
  for (const [property, value] of Object.entries(overrides)) {
    const fallback = base[property]
    merged[property] =
      typeof fallback === 'object' &&
      fallback !== null &&
      typeof value === 'object' &&
      value !== null
        ? { ...fallback, ...value }
        : value
  }
  return merged
}

/** Resolve external `--orb-ui-*` overrides from a mounted built-in theme root. */
export function readOrbThemeCssVariables(
  element: HTMLElement,
  base: ResolvedOrbTheme,
): ResolvedOrbTheme {
  const styles = window.getComputedStyle(element)
  const appearance = base.appearance as unknown as Record<string, unknown>
  const geometry = base.geometry as unknown as Record<string, unknown>
  const motion = base.motion as unknown as Record<string, unknown>
  const config = {
    name: base.name,
    preset: base.preset,
    appearance: mergeSection(appearance, readSection(styles, base.name, 'appearance', appearance)),
    geometry: mergeSection(geometry, readSection(styles, base.name, 'geometry', geometry)),
    motion: mergeSection(motion, readSection(styles, base.name, 'motion', motion)),
  } as OrbThemeConfig

  return resolveOrbTheme(config)
}
