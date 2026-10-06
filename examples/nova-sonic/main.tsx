import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Orb } from 'orb-ui'
import type { NovaSonicTranscript, OrbSignal } from 'orb-ui/adapters'
import { BrowserSession } from './browser-session'
import type { Mode } from './protocol'
import './style.css'

function App() {
  const [signal, setSignal] = useState<OrbSignal>({ state: 'idle' })
  const [mode, setMode] = useState<Mode>('simulated')
  const [transcripts, setTranscripts] = useState<NovaSonicTranscript[]>([])
  const [session] = useState(
    () =>
      new BrowserSession((transcript) => {
        setTranscripts((previous) => {
          const next = previous.filter((item) => item.contentId !== transcript.contentId)
          return [...next, transcript].slice(-12)
        })
      }, setMode),
  )
  useEffect(() => {
    const unsubscribe = session.bridge.subscribe(setSignal)
    return () => {
      unsubscribe()
      void session.stop()
    }
  }, [session])
  const active = !['idle', 'error'].includes(signal.state)
  const ready = active && signal.state !== 'connecting'
  const error = signal.error instanceof Error ? signal.error.message : 'Voice session failed.'
  return (
    <main>
      <a href="https://orb-ui.com/adapters/nova-sonic">orb-ui / Amazon Nova 2 Sonic</a>
      <p className="eyebrow">LOCAL FULLSTACK RECIPE</p>
      <h1>
        A server bridge.
        <br />A visible conversation.
      </h1>
      <p className="lede">
        Bedrock streams through your Node server. The browser owns audio; Orb reflects the session.
      </p>
      <p className="mode">
        {mode === 'simulated'
          ? 'SIMULATED · Local tone fixture and transcript · No AWS calls · No microphone'
          : 'LIVE · Your own local backend and AWS account · Audio is sent to Bedrock'}
      </p>
      <div className="stage">
        <Orb
          adapter={session.bridge}
          interactive={false}
          theme="circle"
          aria-label={`Voice activity: ${signal.state}`}
          size={220}
        />
        <p role="status" aria-live="polite">
          {signal.state}
        </p>
        <button
          onClick={() => {
            if (active) void session.stop()
            else {
              setTranscripts([])
              void session.start()
            }
          }}
        >
          {active
            ? 'Stop session'
            : signal.state === 'error'
              ? 'Start a new session'
              : 'Start local session'}
        </button>
      </div>
      {signal.state === 'error' && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {mode === 'simulated' && (
        <div className="controls" aria-label="Simulation controls">
          <button disabled={!ready} onClick={() => session.simulate('speak')}>
            Replay fixture
          </button>
          <button disabled={!ready} onClick={() => session.simulate('interrupt')}>
            Simulate interruption
          </button>
          <button disabled={!ready} onClick={() => session.simulate('error')}>
            Simulate connection error
          </button>
        </div>
      )}
      <section aria-label="Conversation transcript" className="transcript">
        <h2>Final transcription</h2>
        <p>Speculative text is excluded. In simulation, these are authored fixture messages.</p>
        {transcripts.length ? (
          transcripts.map((item) => (
            <p key={item.contentId}>
              <strong>{item.role === 'USER' ? 'You' : 'Assistant'}</strong> {item.text}
              {!item.final && ' …'}
            </p>
          ))
        ) : (
          <p className="empty">Start the local session to see the transcript.</p>
        )}
      </section>
      <p className="footnote">
        Start in simulation with <code>npm run server</code>. Live mode requires explicitly
        launching your server with <code>NOVA_ENABLE_LIVE=1</code>. This recipe binds to 127.0.0.1
        and is not a public paid-call endpoint.
      </p>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
