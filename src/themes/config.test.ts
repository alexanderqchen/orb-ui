import { describe, expect, it } from 'vitest'
import { resolveOrbTheme } from './config'

describe('theme configuration', () => {
  it('keeps string theme names on the balanced preset', () => {
    const circle = resolveOrbTheme('circle')

    expect(circle.name).toBe('circle')
    expect(circle.preset).toBe('balanced')
    expect(circle.geometry).toMatchObject({
      listeningMinScale: 0.82,
      listeningMaxScale: 1,
      speakingMinScale: 0.95,
      speakingMaxScale: 1.03,
    })
  })

  it('applies low-level overrides after the selected preset', () => {
    const cloud = resolveOrbTheme({
      name: 'cloud',
      preset: 'calm',
      appearance: { launchColor: '#123456' },
      geometry: { speakingMaxScale: 1.4 },
      motion: { activityRiseMs: 42 },
    })

    expect(cloud.preset).toBe('calm')
    expect(cloud.appearance.launchColor).toBe('#123456')
    expect(cloud.geometry).toMatchObject({ listeningMinScale: 0.9, speakingMaxScale: 1.4 })
    expect(cloud.motion).toMatchObject({ activityRiseMs: 42, activityFallMs: 600 })
  })

  it('deep-merges state color overrides without dropping preset colors', () => {
    const bars = resolveOrbTheme({
      name: 'bars',
      appearance: { colors: { speaking: '#00ff00' } },
    })

    expect(bars.appearance.colors.speaking).toBe('#00ff00')
    expect(bars.appearance.colors.listening).toBe('#999999')
  })

  it('falls back from unsafe motion overrides while allowing instant transitions', () => {
    const circle = resolveOrbTheme({
      name: 'circle',
      motion: {
        responseExponent: 0,
        activityRiseMs: Number.NaN,
        activityFallMs: -1,
        stateTransitionMs: 0,
      },
    })

    expect(circle.motion).toMatchObject({
      responseExponent: 1,
      activityRiseMs: 50,
      activityFallMs: 110,
      stateTransitionMs: 0,
    })
  })
})
