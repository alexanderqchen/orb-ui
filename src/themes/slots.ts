import type { OrbSlotAttributes, OrbSlotName, OrbSlotProps } from '../components/Orb/Orb.types'

export function joinClassNames(...values: Array<string | undefined>) {
  const className = values.filter(Boolean).join(' ')
  return className || undefined
}

function mergeSlotAttributes(
  base: OrbSlotAttributes | undefined,
  override: OrbSlotAttributes | undefined,
): OrbSlotAttributes | undefined {
  if (!base) return override
  if (!override) return base

  return {
    ...base,
    ...override,
    className: joinClassNames(base.className, override.className),
    style: { ...base.style, ...override.style },
  }
}

export function mergeOrbSlotProps(
  base: OrbSlotProps | undefined,
  override: OrbSlotProps | undefined,
): OrbSlotProps | undefined {
  if (!base) return override
  if (!override) return base

  const merged: OrbSlotProps = {}
  const names = new Set<OrbSlotName>([
    ...(Object.keys(base) as OrbSlotName[]),
    ...(Object.keys(override) as OrbSlotName[]),
  ])

  for (const name of names) {
    merged[name] = mergeSlotAttributes(base[name], override[name])
  }

  return merged
}

export function resolveOrbSlot(
  slotProps: OrbSlotProps | undefined,
  name: OrbSlotName,
  ...classNames: Array<string | undefined>
): OrbSlotAttributes {
  const attributes = slotProps?.[name]
  return {
    ...attributes,
    className: joinClassNames(
      `orb-ui__${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      ...classNames,
      attributes?.className,
    ),
  }
}
