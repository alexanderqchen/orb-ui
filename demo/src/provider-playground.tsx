import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import VapiImport from '@vapi-ai/web'
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

type VapiClient = Parameters<typeof createVapiAdapter>[0]
type VapiConstructor = new (apiToken: string) => VapiClient

const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: 'manual', label: 'Manual Signal' },
  { id: 'vapi', label: 'Vapi' },
  { id: 'elevenlabs', label: 'ElevenLabs' },
]

const THEMES: OrbTheme[] = ['circle', 'bars', 'debug']
const STATES: OrbState[] = ['idle', 'connecting', 'listening', 'thinking', 'speaking', 'error']

const EMPTY_SIGNAL: OrbSignal = { state: 'idle', volume: 0, inputVolume: 0, outputVolume: 0 }
const CONFIG_STORAGE_KEY = 'orb-ui:provider-playground-config'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isVapiConstructor(value: unknown): value is VapiConstructor {
  return typeof value === 'function'
}

function getVapiConstructor(): VapiConstructor {
  const vapiExport: unknown = VapiImport
  if (isVapiConstructor(vapiExport)) return vapiExport

  if (isRecord(vapiExport)) {
    const defaultExport = vapiExport.default
    if (isVapiConstructor(defaultExport)) return defaultExport

    if (isRecord(defaultExport) && isVapiConstructor(defaultExport.default)) {
      return defaultExport.default
    }
  }

  throw new TypeError('Vapi constructor export was not found.')
}

function getStorage() {
  if (typeof window === 'undefined') return undefined

  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function readStoredConfig(): Partial<ProviderConfig> {
  const storage = getStorage()
  if (!storage) return {}

  try {
    const parsed = JSON.parse(storage.getItem(CONFIG_STORAGE_KEY) ?? '{}')
    if (!isRecord(parsed)) return {}

    const storedConfig: Partial<ProviderConfig> = {}
    if (typeof parsed.vapiPublicKey === 'string') storedConfig.vapiPublicKey = parsed.vapiPublicKey
    if (typeof parsed.vapiAssistantId === 'string') {
      storedConfig.vapiAssistantId = parsed.vapiAssistantId
    }
    if (typeof parsed.elevenLabsAgentId === 'string') {
      storedConfig.elevenLabsAgentId = parsed.elevenLabsAgentId
    }

    return storedConfig
  } catch {
    return {}
  }
}

function writeStoredConfig(config: ProviderConfig) {
  const storage = getStorage()
  if (!storage) return

  try {
    storage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Storage can be disabled or full in some browser modes.
  }
}

function readEnvConfig(): ProviderConfig {
  return {
    vapiPublicKey: import.meta.env.VITE_VAPI_PUBLIC_KEY ?? '',
    vapiAssistantId: import.meta.env.VITE_VAPI_ASSISTANT_ID ?? '',
    elevenLabsAgentId: import.meta.env.VITE_ELEVENLABS_AGENT_ID ?? '',
  }
}

function readConfig(): ProviderConfig {
  return {
    ...readEnvConfig(),
    ...readStoredConfig(),
  }
}

function normalizeConfig(config: ProviderConfig): ProviderConfig {
  return {
    vapiPublicKey: (config.vapiPublicKey ?? '').trim(),
    vapiAssistantId: (config.vapiAssistantId ?? '').trim(),
    elevenLabsAgentId: (config.elevenLabsAgentId ?? '').trim(),
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
      createVapiAdapter(new (getVapiConstructor())(config.vapiPublicKey), {
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
  const [manualState, setManualState] = useState<OrbState>('idle')
  const [manualInputVolume, setManualInputVolume] = useState(0.35)
  const [manualOutputVolume, setManualOutputVolume] = useState(0.65)
  const [latestSignal, setLatestSignal] = useState<OrbSignal>(EMPTY_SIGNAL)
  const [events, setEvents] = useState<EventEntry[]>([])

  useEffect(() => {
    writeStoredConfig(config)
  }, [config])

  const activeConfig = useMemo(() => normalizeConfig(config), [config])
  const providerReady = getProviderReady(provider, activeConfig)
  const providerAdapter = useMemo(
    () => createProviderAdapter(provider, activeConfig),
    [activeConfig, provider],
  )

  const updateConfig = useCallback((key: keyof ProviderConfig, value: string) => {
    setConfig((current) => ({ ...current, [key]: value }))
  }, [])

  const resetProviderConfig = useCallback(() => {
    const defaultConfig = readEnvConfig()

    setConfig((current) => {
      if (provider === 'vapi') {
        return {
          ...current,
          vapiPublicKey: defaultConfig.vapiPublicKey,
          vapiAssistantId: defaultConfig.vapiAssistantId,
        }
      }

      if (provider === 'elevenlabs') {
        return { ...current, elevenLabsAgentId: defaultConfig.elevenLabsAgentId }
      }

      return current
    })
  }, [provider])

  const clearProviderConfig = useCallback(() => {
    setConfig((current) => {
      if (provider === 'vapi') {
        return { ...current, vapiPublicKey: '', vapiAssistantId: '' }
      }

      if (provider === 'elevenlabs') {
        return { ...current, elevenLabsAgentId: '' }
      }

      return current
    })
  }, [provider])

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
    setLatestSignal(EMPTY_SIGNAL)
    setEvents([])
  }, [provider])

  const displayedSignal = provider === 'manual' ? manualSignal : latestSignal
  const activeState = provider === 'manual' ? manualSignal.state : latestSignal.state
  const activeVolume =
    provider === 'manual'
      ? manualSignal.volume
      : activeState === 'listening'
        ? (latestSignal.inputVolume ?? latestSignal.volume)
        : activeState === 'speaking'
          ? (latestSignal.outputVolume ?? latestSignal.volume)
          : latestSignal.volume

  const updateManualState = useCallback(
    (state: OrbState) => {
      const signal = createManualSignal(state, manualInputVolume, manualOutputVolume)
      setManualState(state)
      recordSignal('manual', signal)
    },
    [manualInputVolume, manualOutputVolume, recordSignal],
  )

  const updateManualInputVolume = useCallback(
    (inputVolume: number) => {
      const signal = createManualSignal(manualState, inputVolume, manualOutputVolume)
      setManualInputVolume(inputVolume)
      recordSignal('manual', signal)
    },
    [manualOutputVolume, manualState, recordSignal],
  )

  const updateManualOutputVolume = useCallback(
    (outputVolume: number) => {
      const signal = createManualSignal(manualState, manualInputVolume, outputVolume)
      setManualOutputVolume(outputVolume)
      recordSignal('manual', signal)
    },
    [manualInputVolume, manualState, recordSignal],
  )

  return (
    <main className="provider-page">
      <div className="provider-shell">
        <header className="provider-header">
          <div>
            <h1 className="provider-title">Provider QA Playground</h1>
            <p className="provider-subtitle">
              Adapter bench for comparing real signal behavior across providers.
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
                  {formatVolume(displayedSignal.inputVolume)}
                </span>
              </div>
              <div className="provider-status-item">
                <span className="provider-status-label">Output</span>
                <span className="provider-status-value" data-testid="qa-output-volume">
                  {formatVolume(displayedSignal.outputVolume)}
                </span>
              </div>
            </div>

            {provider === 'manual' ? (
              <div className="provider-controls">
                <div className="provider-control-group">
                  <span className="provider-label">Manual Signal</span>
                  <div className="provider-segment">
                    {STATES.map((item) => (
                      <button
                        className={`provider-button ${manualState === item ? 'is-selected' : ''}`}
                        key={item}
                        onClick={() => updateManualState(item)}
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
                      onChange={(event) =>
                        updateManualInputVolume(Number(event.currentTarget.value))
                      }
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
                      onChange={(event) =>
                        updateManualOutputVolume(Number(event.currentTarget.value))
                      }
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
            ) : null}
          </section>

          <aside className="provider-sidebar" aria-label="Provider diagnostics">
            {provider !== 'manual' ? (
              <section className="provider-panel provider-diagnostics">
                <span className="provider-label">
                  {provider === 'vapi' ? 'Vapi Config' : 'ElevenLabs Config'}
                </span>
                <div className="provider-field-list">
                  {provider === 'vapi' ? (
                    <>
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
                    </>
                  ) : (
                    <ConfigField
                      id="config-elevenlabs-agent-id"
                      label="ElevenLabs agent ID"
                      onChange={(value) => updateConfig('elevenLabsAgentId', value)}
                      value={config.elevenLabsAgentId}
                    />
                  )}
                </div>
                <div className="provider-config-actions">
                  <button className="provider-button" onClick={resetProviderConfig} type="button">
                    Use env defaults
                  </button>
                  <button className="provider-button" onClick={clearProviderConfig} type="button">
                    Clear
                  </button>
                </div>
                <div className="provider-env-list">
                  {provider === 'vapi' ? (
                    <>
                      <EnvRow label="Vapi public key" ready={Boolean(activeConfig.vapiPublicKey)} />
                      <EnvRow
                        label="Vapi assistant ID"
                        ready={Boolean(activeConfig.vapiAssistantId)}
                      />
                    </>
                  ) : (
                    <EnvRow
                      label="ElevenLabs agent ID"
                      ready={Boolean(activeConfig.elevenLabsAgentId)}
                    />
                  )}
                </div>
              </section>
            ) : null}

            <section className="provider-panel provider-diagnostics">
              <span className="provider-label">Latest Signal</span>
              <div className="provider-signal-list">
                <SignalRow label="state" value={displayedSignal.state} />
                <SignalRow label="volume" value={formatVolume(displayedSignal.volume)} />
                <SignalRow label="inputVolume" value={formatVolume(displayedSignal.inputVolume)} />
                <SignalRow
                  label="outputVolume"
                  value={formatVolume(displayedSignal.outputVolume)}
                />
              </div>
              <pre className="provider-code">{JSON.stringify(displayedSignal, null, 2)}</pre>
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
