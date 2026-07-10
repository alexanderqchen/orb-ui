import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Orb } from 'orb-ui'
import type { OrbAdapter, OrbSignal } from 'orb-ui'
import { createElevenLabsAdapter, createLiveKitAdapter, createVapiAdapter } from 'orb-ui/adapters'
import { createLiveKitAdapter as createManagedLiveKitAdapter } from 'orb-ui/adapters/livekit'

const IDLE_SIGNAL: OrbSignal = {
  state: 'idle',
  volume: 0,
  inputVolume: 0,
  outputVolume: 0,
}

function App() {
  const [adapterSignal, setAdapterSignal] = useState<OrbSignal>(IDLE_SIGNAL)
  const adapter = useMemo<OrbAdapter>(() => {
    let signal = IDLE_SIGNAL
    const listeners = new Set<(nextSignal: OrbSignal) => void>()
    const emit = (nextSignal: OrbSignal) => {
      signal = nextSignal
      listeners.forEach((listener) => listener(nextSignal))
    }

    return {
      subscribe(listener) {
        listeners.add(listener)
        listener(signal)
        return () => listeners.delete(listener)
      },
      start() {
        emit({ state: 'listening', volume: 0.42, inputVolume: 0.42, outputVolume: 0 })
      },
      stop() {
        emit(IDLE_SIGNAL)
      },
    }
  }, [])

  useEffect(() => adapter.subscribe(setAdapterSignal), [adapter])

  const adapterExportsReady =
    typeof createVapiAdapter === 'function' &&
    typeof createElevenLabsAdapter === 'function' &&
    typeof createLiveKitAdapter === 'function' &&
    typeof createManagedLiveKitAdapter === 'function'

  return (
    <main>
      <h1>orb-ui browser consumer</h1>
      <p data-testid="adapter-exports">{adapterExportsReady ? 'ready' : 'missing'}</p>

      <section aria-label="Adapter lifecycle">
        <Orb adapter={adapter} data-testid="adapter-orb" size={160} theme="circle" />
        <output data-testid="adapter-state">{adapterSignal.state}</output>
        <output data-testid="adapter-input-volume">
          {(adapterSignal.inputVolume ?? 0).toFixed(2)}
        </output>
      </section>

      <section aria-label="Controlled signal">
        <Orb
          aria-label="Controlled speaking orb"
          data-testid="controlled-orb"
          signal={{ state: 'speaking', outputVolume: 0.7 }}
          size={160}
          theme="bars"
        />
        <output data-testid="controlled-output-volume">0.70</output>
      </section>
    </main>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Browser smoke fixture root is missing.')

createRoot(root).render(<App />)
