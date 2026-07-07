import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Vapi from '@vapi-ai/web'
import { Conversation } from '@elevenlabs/client'
import { Orb } from 'orb-ui'
import type { OrbAdapter, OrbSignal, OrbState, OrbTheme } from 'orb-ui'
import { createElevenLabsAdapter, createVapiAdapter } from 'orb-ui/adapters'
import './provider-playground.css'

type ProviderId = 'manual' | 'vapi' | 'elevenlabs'

interface ProviderConfig {
  vapiPublicKey: string
  vapiAssistantId: string
  elevenLabsAgentId: string
}

interface EventEntry {
  id: number
  provider: ProviderId
  signal: OrbSignal
  time: string
}

const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: 'manual', label: 'Manual Signal' },
  { id: 'vapi', label: 'Vapi' },
  { id: 'elevenlabs', label: 'ElevenLabs' },
]

const THEMES: OrbTheme[] = ['circle', 'bars', 'debug']
const STATES: OrbState[] = ['idle', 'connecting', 'listening', 'thinking', 'speaking', 'error']

const EMPTY_SIGNAL: OrbSignal = { state: 'idle', volume: 0, inputVolume: 0, outputVolume: 0 }

function readConfig(): ProviderConfig {
  return {
    vapiPublicKey: import.meta.env.VITE_VAPI_PUBLIC_KEY ?? '',
    vapiAssistantId: import.meta.env.VITE_VAPI_ASSISTANT_ID ?? '',
    elevenLabsAgentId: import.meta.env.VITE_ELEVENLABS_AGENT_ID ?? '',
  }
}

function normalizeConfig(config: ProviderConfig): ProviderConfig {
  return {
    vapiPublicKey: config.vapiPublicKey.trim(),
    vapiAssistantId: config.vapiAssistantId.trim(),
    elevenLabsAgentId: config.elevenLabsAgentId.trim(),
  }
}

function formatVolume(value: number | undefined) {
  return (value ?? 0).toFixed(2)
}

function createManualSignal(state: OrbState, inputVolume: number, outputVolume: number): OrbSignal {
  if (state === 'listening') return { state, inputVolume, volume: inputVolume }
  if (state === 'speaking') return { state, outputVolume, volume: outputVolume }
  return { state, volume: 0, inputVolume: 0, outputVolume: 0 }
}

function getProviderReady(provider: ProviderId, config: ProviderConfig) {
  if (provider === 'manual') return true
  if (provider === 'vapi') return Boolean(config.vapiPublicKey && config.vapiAssistantId)
  return Boolean(config.elevenLabsAgentId)
}

function createLazyAdapter(factory: () => OrbAdapter): OrbAdapter {
  let activeAdapter: OrbAdapter | undefined
  let unsubscribeActiveAdapter: (() => void) | undefined
  const listeners = new Set<(signal: OrbSignal) => void>()

  function emit(signal: OrbSignal) {
    listeners.forEach((listener) => listener(signal))
  }

  function getActiveAdapter() {
    if (!activeAdapter) {
      activeAdapter = factory()
      unsubscribeActiveAdapter = activeAdapter.subscribe(emit)
    }

    return activeAdapter
  }

  function disposeActiveAdapter() {
    void activeAdapter?.stop?.()
    unsubscribeActiveAdapter?.()
    activeAdapter = undefined
    unsubscribeActiveAdapter = undefined
  }

  return {
    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) disposeActiveAdapter()
      }
    },

    async start() {
      try {
        await getActiveAdapter().start?.()
      } catch (error) {
        console.error('[orb-ui/demo] Provider start failed:', error)
        emit({ state: 'error', volume: 0, inputVolume: 0, outputVolume: 0, error })
      }
    },

    async stop() {
      await activeAdapter?.stop?.()
    },
  }
}

function createProviderAdapter(
  provider: ProviderId,
  config: ProviderConfig,
): OrbAdapter | undefined {
  if (provider === 'vapi' && getProviderReady(provider, config)) {
    return createLazyAdapter(() =>
      createVapiAdapter(new Vapi(config.vapiPublicKey), {
        assistantId: config.vapiAssistantId,
      }),
    )
  }

  if (provider === 'elevenlabs' && getProviderReady(provider, config)) {
    return createLazyAdapter(() =>
      createElevenLabsAdapter(Conversation, {
        agentId: config.elevenLabsAgentId,
      }),
    )
  }

  return undefined
}

function EnvRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="provider-row">
      <span>{label}</span>
      <span className={`provider-pill ${ready ? 'is-ready' : 'is-missing'}`}>
        {ready ? 'Ready' : 'Missing'}
      </span>
    </div>
  )
}

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="provider-row">
      <span>{label}</span>
      <span className="provider-status-value">{value}</span>
    </div>
  )
}

function ConfigField({
  id,
  label,
  onChange,
  type = 'text',
  value,
}: {
  id: string
  label: string
  onChange: (value: string) => void
  type?: 'password' | 'text'
  value: string
}) {
  return (
    <label className="provider-field" htmlFor={id}>
      <span>{label}</span>
      <input
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        className="provider-input"
        data-testid={id}
        id={id}
        onChange={(event) => onChange(event.currentTarget.value)}
        spellCheck={false}
        type={type}
        value={value}
      />
    </label>
  )
}

function ProviderPlayground() {
  const [config, setConfig] = useState<ProviderConfig>(() => readConfig())
  const [provider, setProvider] = useState<ProviderId>('manual')
  const [theme, setTheme] = useState<OrbTheme>('circle')
  const [manualState, setManualState] = useState<OrbState>('listening')
  const [manualInputVolume, setManualInputVolume] = useState(0.35)
  const [manualOutputVolume, setManualOutputVolume] = useState(0.65)
  const [latestSignal, setLatestSignal] = useState<OrbSignal>(EMPTY_SIGNAL)
  const [events, setEvents] = useState<EventEntry[]>([])

  const activeConfig = useMemo(() => normalizeConfig(config), [config])
  const providerReady = getProviderReady(provider, activeConfig)
  const providerAdapter = useMemo(
    () => createProviderAdapter(provider, activeConfig),
    [activeConfig, provider],
  )

  const updateConfig = useCallback((key: keyof ProviderConfig, value: string) => {
    setConfig((current) => ({ ...current, [key]: value }))
  }, [])

  const resetConfig = useCallback(() => {
    setConfig(readConfig())
  }, [])

  const clearConfig = useCallback(() => {
    setConfig({ vapiPublicKey: '', vapiAssistantId: '', elevenLabsAgentId: '' })
  }, [])

  const recordSignal = useCallback((nextProvider: ProviderId, signal: OrbSignal) => {
    setLatestSignal(signal)
    setEvents((current) => [
      {
        id: Date.now() + Math.random(),
        provider: nextProvider,
        signal,
        time: new Date().toLocaleTimeString(),
      },
      ...current.slice(0, 11),
    ])
  }, [])

  const monitoredAdapter = useMemo<OrbAdapter | undefined>(() => {
    if (!providerAdapter) return undefined

    return {
      subscribe(listener) {
        return providerAdapter.subscribe((signal) => {
          recordSignal(provider, signal)
          listener(signal)
        })
      },
      start: providerAdapter.start ? () => providerAdapter.start?.() : undefined,
      stop: providerAdapter.stop ? () => providerAdapter.stop?.() : undefined,
    }
  }, [provider, providerAdapter, recordSignal])

  const manualSignal = useMemo(
    () => createManualSignal(manualState, manualInputVolume, manualOutputVolume),
    [manualInputVolume, manualOutputVolume, manualState],
  )

  useEffect(() => {
    if (provider === 'manual') recordSignal('manual', manualSignal)
  }, [manualSignal, provider, recordSignal])

  useEffect(() => {
    if (provider !== 'manual') {
      setLatestSignal(EMPTY_SIGNAL)
      setEvents([])
    }
  }, [provider])

  const activeState = provider === 'manual' ? manualSignal.state : latestSignal.state
  const activeVolume =
    provider === 'manual'
      ? manualSignal.volume
      : activeState === 'listening'
        ? (latestSignal.inputVolume ?? latestSignal.volume)
        : activeState === 'speaking'
          ? (latestSignal.outputVolume ?? latestSignal.volume)
          : latestSignal.volume

  const handleStart = useCallback(() => {
    if (provider === 'manual') {
      setManualState('listening')
      return
    }

    monitoredAdapter?.start?.()
  }, [monitoredAdapter, provider])

  const handleStop = useCallback(() => {
    if (provider === 'manual') {
      setManualState('idle')
      return
    }

    monitoredAdapter?.stop?.()
  }, [monitoredAdapter, provider])

  return (
    <main className="provider-page">
      <div className="provider-shell">
        <header className="provider-header">
          <div>
            <h1 className="provider-title">Provider QA Playground</h1>
            <p className="provider-subtitle">
              Local adapter bench for comparing real signal behavior across providers.
            </p>
          </div>
          <a className="provider-link" href="/">
            Public demo
          </a>
        </header>

        <div className="provider-layout">
          <section className="provider-panel provider-stage" aria-label="Provider test surface">
            <div className="provider-toolbar">
              <div className="provider-control-group">
                <span className="provider-label">Provider</span>
                <div className="provider-segment">
                  {PROVIDERS.map((item) => (
                    <button
                      className={`provider-button ${provider === item.id ? 'is-selected' : ''}`}
                      key={item.id}
                      onClick={() => setProvider(item.id)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="provider-control-group">
                <span className="provider-label">Theme</span>
                <div className="provider-segment">
                  {THEMES.map((item) => (
                    <button
                      className={`provider-button ${theme === item ? 'is-selected' : ''}`}
                      key={item}
                      onClick={() => setTheme(item)}
                      type="button"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="provider-orb-zone">
              {provider === 'manual' ? (
                <Orb
                  aria-label="Manual signal orb"
                  data-testid="provider-playground-orb"
                  signal={manualSignal}
                  size={280}
                  theme={theme}
                />
              ) : (
                <Orb
                  adapter={monitoredAdapter}
                  aria-label={`Start ${provider} session`}
                  data-testid="provider-playground-orb"
                  disabled={!providerReady}
                  size={280}
                  theme={theme}
                />
              )}
            </div>

            <div className="provider-status-strip">
              <div className="provider-status-item">
                <span className="provider-status-label">Provider</span>
                <span className="provider-status-value" data-testid="qa-provider">
                  {provider}
                </span>
              </div>
              <div className="provider-status-item">
                <span className="provider-status-label">State</span>
                <span className="provider-status-value" data-testid="qa-state">
                  {activeState}
                </span>
              </div>
              <div className="provider-status-item">
                <span className="provider-status-label">Input</span>
                <span className="provider-status-value" data-testid="qa-input-volume">
                  {formatVolume(latestSignal.inputVolume)}
                </span>
              </div>
              <div className="provider-status-item">
                <span className="provider-status-label">Output</span>
                <span className="provider-status-value" data-testid="qa-output-volume">
                  {formatVolume(latestSignal.outputVolume)}
                </span>
              </div>
            </div>

            <div className="provider-controls">
              <div className="provider-control-group">
                <span className="provider-label">Session</span>
                <div className="provider-action-row">
                  <button
                    className="provider-action"
                    disabled={provider !== 'manual' && !providerReady}
                    onClick={handleStart}
                    type="button"
                  >
                    Start
                  </button>
                  <button
                    className="provider-action is-danger"
                    disabled={provider !== 'manual' && !providerReady}
                    onClick={handleStop}
                    type="button"
                  >
                    Stop
                  </button>
                </div>
              </div>

              <div className="provider-control-group">
                <span className="provider-label">Manual Signal</span>
                <div className="provider-segment">
                  {STATES.map((item) => (
                    <button
                      className={`provider-button ${manualState === item ? 'is-selected' : ''}`}
                      key={item}
                      onClick={() => setManualState(item)}
                      type="button"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="provider-control-group provider-sliders">
                <label className="provider-slider-row">
                  <span>Input</span>
                  <input
                    max={1}
                    min={0}
                    onChange={(event) => setManualInputVolume(Number(event.currentTarget.value))}
                    step={0.01}
                    type="range"
                    value={manualInputVolume}
                  />
                  <span>{manualInputVolume.toFixed(2)}</span>
                </label>
                <label className="provider-slider-row">
                  <span>Output</span>
                  <input
                    max={1}
                    min={0}
                    onChange={(event) => setManualOutputVolume(Number(event.currentTarget.value))}
                    step={0.01}
                    type="range"
                    value={manualOutputVolume}
                  />
                  <span>{manualOutputVolume.toFixed(2)}</span>
                </label>
              </div>

              <div className="provider-control-group">
                <span className="provider-label">Active Volume</span>
                <pre className="provider-code">{formatVolume(activeVolume)}</pre>
              </div>
            </div>
          </section>

          <aside className="provider-sidebar" aria-label="Provider diagnostics">
            <section className="provider-panel provider-diagnostics">
              <span className="provider-label">Provider Config</span>
              <div className="provider-field-list">
                <ConfigField
                  id="config-vapi-public-key"
                  label="Vapi public key"
                  onChange={(value) => updateConfig('vapiPublicKey', value)}
                  type="password"
                  value={config.vapiPublicKey}
                />
                <ConfigField
                  id="config-vapi-assistant-id"
                  label="Vapi assistant ID"
                  onChange={(value) => updateConfig('vapiAssistantId', value)}
                  value={config.vapiAssistantId}
                />
                <ConfigField
                  id="config-elevenlabs-agent-id"
                  label="ElevenLabs agent ID"
                  onChange={(value) => updateConfig('elevenLabsAgentId', value)}
                  value={config.elevenLabsAgentId}
                />
              </div>
              <div className="provider-config-actions">
                <button className="provider-button" onClick={resetConfig} type="button">
                  Use env defaults
                </button>
                <button className="provider-button" onClick={clearConfig} type="button">
                  Clear
                </button>
              </div>
              <div className="provider-env-list">
                <EnvRow label="Vapi public key" ready={Boolean(activeConfig.vapiPublicKey)} />
                <EnvRow label="Vapi assistant ID" ready={Boolean(activeConfig.vapiAssistantId)} />
                <EnvRow
                  label="ElevenLabs agent ID"
                  ready={Boolean(activeConfig.elevenLabsAgentId)}
                />
              </div>
            </section>

            <section className="provider-panel provider-diagnostics">
              <span className="provider-label">Latest Signal</span>
              <div className="provider-signal-list">
                <SignalRow label="state" value={latestSignal.state} />
                <SignalRow label="volume" value={formatVolume(latestSignal.volume)} />
                <SignalRow label="inputVolume" value={formatVolume(latestSignal.inputVolume)} />
                <SignalRow label="outputVolume" value={formatVolume(latestSignal.outputVolume)} />
              </div>
              <pre className="provider-code">{JSON.stringify(latestSignal, null, 2)}</pre>
            </section>

            <section className="provider-panel provider-diagnostics">
              <span className="provider-label">Signal Events</span>
              <div className="provider-event-list">
                {events.length === 0 ? (
                  <div className="provider-event">
                    <div className="provider-event-body">No signal events yet.</div>
                  </div>
                ) : (
                  events.map((event) => (
                    <div className="provider-event" key={event.id}>
                      <div className="provider-event-time">
                        {event.time} / {event.provider}
                      </div>
                      <div className="provider-event-body">{JSON.stringify(event.signal)}</div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProviderPlayground />
  </StrictMode>,
)
