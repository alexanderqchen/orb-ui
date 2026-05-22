import { useCallback, useEffect, useRef, useState } from 'react'
import type { OrbProps, OrbState } from './Orb.types'
import { normalizeMicVolume } from '../../adapters/types'
import { DebugTheme } from '../../themes/debug'
import { CircleTheme } from '../../themes/circle'
import { BarsTheme } from '../../themes/bars'

// ─── Mic monitor ──────────────────────────────────────────────────────────────
// Shared mic volume monitoring via Web Audio API. Runs at 60fps when active.
// Lives in Orb so it's provider-agnostic — no mic code in adapters.

function createMicMonitor() {
  let context: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let raf: number = 0
  let ema = 0
  let stream: MediaStream | null = null

  // Intercept getUserMedia to capture the mic stream
  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    const _origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const s = await _origGUM(constraints)
      if (constraints?.audio) stream = s
      return s
    }
  }

  function start(onVolume: (v: number) => void) {
    if (!stream || analyser) return
    try {
      context = new AudioContext()
      analyser = context.createAnalyser()
      analyser.fftSize = 256
      source = context.createMediaStreamSource(stream)
      source.connect(analyser)
      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const poll = () => {
        if (!analyser) return
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i]
        const rms = Math.sqrt(sum / dataArray.length) / 255
        const rate = rms > ema ? 0.7 : 0.3
        ema += (rms - ema) * rate
        onVolume(normalizeMicVolume(ema))
        raf = requestAnimationFrame(poll)
      }
      raf = requestAnimationFrame(poll)
    } catch (e) {
      console.warn('[orb-ui] Mic monitor failed:', e)
    }
  }

  function stop() {
    cancelAnimationFrame(raf)
    raf = 0
    ema = 0
    source?.disconnect()
    source = null
    analyser = null
  }

  function release() {
    stop()
    if (context) {
      context.close().catch(() => {})
      context = null
    }
    stream?.getTracks().forEach((track) => {
      if (track.readyState === 'live') track.stop()
    })
    stream = null
  }

  return { start, stop, release }
}

// ─── Orb component ────────────────────────────────────────────────────────────

export function Orb({
  state: stateProp,
  volume: volumeProp,
  adapter,
  theme = 'debug',
  size = 200,
  className,
  style,
  onStart,
  onStop,
}: OrbProps) {
  const [adapterState, setAdapterState] = useState<OrbState>('idle')
  const [adapterVolume, setAdapterVolume] = useState(0)
  const [micVolume, setMicVolume] = useState(0)
  const micMonitorRef = useRef(createMicMonitor())
  const micActiveRef = useRef(false)

  useEffect(() => {
    // Reset state when adapter changes (e.g. provider switch)
    setAdapterState('idle')
    setAdapterVolume(0)
    setMicVolume(0)

    if (!adapter) return
    const unsubscribe = adapter.subscribe({
      onStateChange: setAdapterState,
      onVolumeChange: setAdapterVolume,
    })
    return unsubscribe
  }, [adapter])

  // Controlled props override adapter values
  const state: OrbState = stateProp ?? adapterState

  // Mic monitor: start when listening, stop otherwise
  useEffect(() => {
    const mic = micMonitorRef.current

    if (state === 'listening' && adapter) {
      // Small delay to let the adapter's SDK acquire the mic first
      const timer = setTimeout(() => {
        mic.start(setMicVolume)
        micActiveRef.current = true
      }, 500)
      return () => {
        clearTimeout(timer)
        mic.stop()
        micActiveRef.current = false
        setMicVolume(0)
      }
    } else {
      mic.stop()
      micActiveRef.current = false
      setMicVolume(0)
    }
  }, [state, adapter])

  // Release mic on unmount
  useEffect(() => {
    return () => micMonitorRef.current.release()
  }, [])

  // Use mic volume when listening, adapter volume otherwise
  const volume: number =
    volumeProp ?? (state === 'listening' && micActiveRef.current ? micVolume : adapterVolume)

  const isActive = state !== 'idle' && state !== 'error'

  const handleClick = useCallback(() => {
    if (isActive) {
      if (onStop) onStop()
      else adapter?.stop?.()
    } else {
      if (onStart) onStart()
      else adapter?.start?.()
    }
  }, [adapter, isActive, onStart, onStop])

  // Only make it clickable if there's a way to handle clicks
  const clickable = !!(adapter?.start || onStart || onStop)

  const themeProps = { state, volume, size, className, style }
  const clickHandler = clickable ? handleClick : undefined

  switch (theme) {
    case 'circle':
      return <CircleTheme {...themeProps} onClick={clickHandler} />
    case 'bars':
      return <BarsTheme {...themeProps} onClick={clickHandler} />
    case 'debug':
    default:
      return (
        <DebugTheme
          {...themeProps}
          onStart={onStart ?? (() => adapter?.start?.())}
          onStop={onStop ?? (() => adapter?.stop?.())}
        />
      )
  }
}
