import { useEffect, useState } from 'react'
import type { VoiceOrbProps, OrbState } from './VoiceOrb.types'
import { DebugTheme } from '../../themes/debug'
import { CircleTheme } from '../../themes/circle'
import { BarsTheme } from '../../themes/bars'
import { JarvisTheme } from '../../themes/jarvis'

export function VoiceOrb({
  state: stateProp,
  volume: volumeProp,
  adapter,
  theme = 'debug',
  size = 200,
  className,
  style,
  onStart,
  onStop,
}: VoiceOrbProps) {
  const [adapterState, setAdapterState] = useState<OrbState>('idle')
  const [adapterVolume, setAdapterVolume] = useState(0)

  useEffect(() => {
    if (!adapter) return
    const unsubscribe = adapter.subscribe({
      onStateChange: setAdapterState,
      onVolumeChange: setAdapterVolume,
    })
    return unsubscribe
  }, [adapter])

  // Controlled props override adapter values
  const state: OrbState = stateProp ?? adapterState
  const volume: number = volumeProp ?? adapterVolume

  const themeProps = { state, volume, size, className, style }

  switch (theme) {
    case 'circle':
      return <CircleTheme {...themeProps} />
    case 'bars':
      return <BarsTheme {...themeProps} />
    case 'jarvis':
      return <JarvisTheme {...themeProps} />
    case 'debug':
    default:
      return <DebugTheme {...themeProps} onStart={onStart} onStop={onStop} />
  }
}
