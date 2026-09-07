import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Orb, OrbThemeProvider } from 'orb-ui'
import type { OrbAdapter, OrbSignal, OrbState, OrbThemePreset } from 'orb-ui'
import { createElevenLabsAdapter, createLiveKitAdapter, createVapiAdapter } from 'orb-ui/adapters'
import { createLiveKitAdapter as createManagedLiveKitAdapter } from 'orb-ui/adapters/livekit'

const IDLE_SIGNAL: OrbSignal = {
  state: 'idle',
  inputVolume: 0,
  outputVolume: 0,
}

function App() {
  const [adapterSignal, setAdapterSignal] = useState<OrbSignal>(IDLE_SIGNAL)
  const [cloudPreset, setCloudPreset] = useState<OrbThemePreset>('balanced')
  const [cloudSize, setCloudSize] = useState(180)
  const [cloudColor, setCloudColor] = useState('#5c63fb')
  const [cloudState, setCloudState] = useState<OrbState>('speaking')
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
        emit({ state: 'listening', inputVolume: 0.42, outputVolume: 0 })
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

      <section aria-label="Radial theme">
        <Orb
          data-testid="radial-orb"
          signal={{ state: 'listening', inputVolume: 0.58 }}
          size={160}
          theme="radial"
        />
        <Orb
          adapter={adapter}
          aria-label="Toggle radial session"
          data-testid="interactive-radial-orb"
          size={160}
          theme="radial"
        />
      </section>

      <section aria-label="External session controls">
        <Orb
          adapter={adapter}
          data-testid="external-cloud-orb"
          interactive={false}
          size={160}
          theme="cloud"
        />
        <button onClick={() => void adapter.start?.()} type="button">
          Start externally
        </button>
        <button onClick={() => void adapter.stop?.()} type="button">
          Stop externally
        </button>
      </section>

      <section aria-label="Application theme defaults">
        <OrbThemeProvider
          className="fixture-brand-orb"
          slotProps={{ surface: { className: 'fixture-brand-surface' } }}
          theme={{ name: 'circle', preset: 'calm' }}
        >
          <Orb
            data-testid="css-variable-orb"
            signal={{ state: 'speaking', outputVolume: 0.65 }}
            style={{
              '--orb-ui-size': '180px',
              '--orb-ui-circle-appearance-colors-speaking': '#ff00aa',
              '--orb-ui-circle-geometry-diameter-ratio': 0.7,
            }}
          />
        </OrbThemeProvider>
      </section>

      <section aria-label="Custom renderer">
        <Orb
          adapter={adapter}
          aria-label="Toggle custom renderer"
          data-testid="custom-renderer-control"
          renderTheme={({ activity, controlProps, rootProps, state }) => (
            <div {...rootProps}>
              <button {...controlProps}>
                {state}:{activity.toFixed(2)}
              </button>
            </div>
          )}
          size={180}
        />
      </section>

      <section aria-label="Cloud animation continuity">
        <Orb
          data-testid="continuous-cloud"
          signal={{ state: cloudState, outputVolume: 0.65 }}
          style={{
            '--orb-ui-size': `${cloudSize}px`,
            '--orb-ui-cloud-appearance-deep-color': cloudColor,
          }}
          theme={{ name: 'cloud', preset: cloudPreset }}
        />
        <button data-testid="cloud-preset" onClick={() => setCloudPreset('calm')} type="button">
          Change cloud preset
        </button>
        <button data-testid="cloud-size" onClick={() => setCloudSize(240)} type="button">
          Resize cloud
        </button>
        <button data-testid="cloud-color" onClick={() => setCloudColor('#ee5588')} type="button">
          Recolor cloud
        </button>
        <button onClick={() => setCloudState('idle')} type="button">
          Stop cloud
        </button>
        <button onClick={() => setCloudState('speaking')} type="button">
          Restart cloud
        </button>
      </section>
    </main>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Browser smoke fixture root is missing.')

createRoot(root).render(<App />)
