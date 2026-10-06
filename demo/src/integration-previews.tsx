import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Orb, type OrbSignal, type OrbState } from 'orb-ui'
import { integrations } from '../expansion/catalog'
import './recipes.css'

function IntegrationPreview() {
  const requested = new URLSearchParams(location.search).get('provider')
  const [provider, setProvider] = useState(
    integrations.find(([id]) => id === requested)?.[0] ?? 'retell',
  )
  const [signal, setSignal] = useState<OrbSignal>({ state: 'idle' })
  const [caption, setCaption] = useState('Ready for a local fixture session.')
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const clear = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  useEffect(() => () => clear(), [])

  function transition(state: OrbState, caption: string) {
    setSignal({
      state,
      inputVolume: state === 'listening' ? 0.42 : 0,
      outputVolume: state === 'speaking' ? 0.64 : 0,
    })
    setCaption(caption)
  }
  function start() {
    clear()
    transition('connecting', 'Simulating session setup. No network request or microphone access.')
    timers.current.push(
      setTimeout(
        () => transition('listening', 'Fixture user: “Show me how this voice interface works.”'),
        450,
      ),
    )
    timers.current.push(
      setTimeout(
        () => transition('thinking', 'Fixture turn submitted. Preparing the sample reply.'),
        2100,
      ),
    )
    timers.current.push(
      setTimeout(
        () =>
          transition(
            'speaking',
            'Fixture assistant: “The orb reflects your app’s voice state and audio levels.”',
          ),
        3100,
      ),
    )
    timers.current.push(
      setTimeout(
        () =>
          transition(
            'listening',
            'Sample reply finished. You can interrupt, stop, or simulate a failure.',
          ),
        5800,
      ),
    )
  }
  const title = integrations.find(([id]) => id === provider)![1]
  const active = !['idle', 'error'].includes(signal.state)
  return (
    <main className="integration-demo">
      <span className="simulation-label">
        Local simulated signals · no API calls, microphone, or credits
      </span>
      <h1>{title} UI preview</h1>
      <p>
        This visual fixture shows the UI contract. It does not connect to {title} or verify its live
        service. Supported events and audio ownership are explained in the integration recipe.
      </p>
      <label htmlFor="integration-picker">Integration </label>
      <select
        id="integration-picker"
        value={provider}
        onChange={(event) => {
          clear()
          transition('idle', 'Ready for a local fixture session.')
          const next = event.target.value as typeof provider
          setProvider(next)
          history.replaceState(null, '', `?provider=${next}`)
        }}
      >
        {integrations.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <div className="integration-orb">
        <Orb signal={signal} interactive={false} theme="cloud" size={200} />
      </div>
      <p className="recipe-status" role="status">
        <strong>{signal.state}</strong> · {caption}
      </p>
      <div className="recipe-actions">
        <button type="button" onClick={start} disabled={active}>
          {signal.state === 'error' ? 'Reconnect simulation' : 'Start simulation'}
        </button>
        <button
          type="button"
          disabled={!active}
          onClick={() => {
            clear()
            transition('idle', 'Simulation stopped. All scheduled turns were cancelled.')
          }}
        >
          Stop
        </button>
        <button
          type="button"
          disabled={!active}
          onClick={() => {
            clear()
            transition(
              'listening',
              'Fixture user interrupted. Queued assistant output was cleared.',
            )
          }}
        >
          Interrupt
        </button>
        <button
          type="button"
          disabled={!active}
          onClick={() => {
            clear()
            transition('error', 'Synthetic connection failure. Reconnect to run a fresh fixture.')
          }}
        >
          Simulate error
        </button>
      </div>
      <dl>
        <dt>Fixture input level</dt>
        <dd>{(signal.inputVolume ?? 0).toFixed(2)}</dd>
        <dt>Fixture output level</dt>
        <dd>{(signal.outputVolume ?? 0).toFixed(2)}</dd>
      </dl>
      <a href={`/docs/adapters/${provider}`} target="_top">
        Read setup, event mapping, and working example ↗
      </a>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IntegrationPreview />
  </StrictMode>,
)
