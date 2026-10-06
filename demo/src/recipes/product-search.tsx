import { useEffect, useRef, useState } from 'react'
import { Orb, type OrbSignal } from 'orb-ui'

type Category = 'all' | 'hiking' | 'commute' | 'travel'
interface Filters {
  category: Category
  maxPrice: number
  waterproof: boolean
}
const defaults: Filters = { category: 'all', maxPrice: 200, waterproof: false }
const catalog = [
  {
    id: 'trail',
    name: 'Trail 24',
    category: 'hiking',
    price: 79,
    waterproof: true,
    detail: '24 L · roll top · 680 g',
  },
  {
    id: 'ridge',
    name: 'Ridge 35',
    category: 'hiking',
    price: 129,
    waterproof: true,
    detail: '35 L · ventilated back · 920 g',
  },
  {
    id: 'daylight',
    name: 'Daylight 18',
    category: 'hiking',
    price: 49,
    waterproof: false,
    detail: '18 L · packable · 340 g',
  },
  {
    id: 'metro',
    name: 'Metro 20',
    category: 'commute',
    price: 89,
    waterproof: true,
    detail: '20 L · laptop sleeve · 760 g',
  },
  {
    id: 'studio',
    name: 'Studio 16',
    category: 'commute',
    price: 59,
    waterproof: false,
    detail: '16 L · padded straps · 540 g',
  },
  {
    id: 'weekender',
    name: 'Weekender 30',
    category: 'travel',
    price: 149,
    waterproof: false,
    detail: '30 L · clamshell · 1.1 kg',
  },
] as const

// Intentionally limited grammar: this preview is not speech recognition or an LLM.
function parseQuery(text: string): Filters | null {
  const query = text.toLowerCase()
  const category: Category = /hiking|trail/.test(query)
    ? 'hiking'
    : /commut|work/.test(query)
      ? 'commute'
      : /travel|weekend/.test(query)
        ? 'travel'
        : 'all'
  const price = query.match(/(?:under|below|less than)\s*\$?\s*(\d+(?:\.\d+)?)/)
  const waterproof = /waterproof/.test(query) && !/not waterproof|no waterproof/.test(query)
  if (category === 'all' && !price && !/waterproof|all (?:bags|backpacks)/.test(query)) return null
  return {
    category,
    maxPrice: price ? Math.min(200, Math.max(0, Number(price[1]))) : 200,
    waterproof,
  }
}

export default function ProductSearch() {
  const [filters, setFilters] = useState<Filters>(defaults)
  const [draft, setDraft] = useState('Waterproof hiking backpacks under $100')
  const [pending, setPending] = useState<Filters | null>(null)
  const [previous, setPrevious] = useState<Filters | null>(null)
  const [signal, setSignal] = useState<OrbSignal>({ state: 'idle' })
  const [status, setStatus] = useState(
    'Search the sample catalog by voice simulation or manual filters.',
  )
  const [failNext, setFailNext] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const busy = useRef(false)
  const active = ['listening', 'thinking'].includes(signal.state)
  const results = catalog.filter(
    (item) =>
      (filters.category === 'all' || item.category === filters.category) &&
      item.price <= filters.maxPrice &&
      (!filters.waterproof || item.waterproof),
  )

  function clearRun() {
    timers.current.forEach(clearTimeout)
    timers.current = []
    busy.current = false
  }
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function simulateQuery() {
    if (busy.current || !draft.trim()) return
    clearRun()
    busy.current = true
    const query = draft.trim()
    const fail = failNext
    setFailNext(false)
    setPending(null)
    setSignal({ state: 'listening', inputVolume: 0.5, outputVolume: 0 })
    setStatus('Simulating a spoken search. Current results stay visible.')
    timers.current.push(
      setTimeout(() => {
        setSignal({ state: 'thinking', inputVolume: 0, outputVolume: 0 })
        setStatus('Extracting category, price, and waterproof preference…')
      }, 800),
    )
    timers.current.push(
      setTimeout(() => {
        busy.current = false
        const proposed = fail ? null : parseQuery(query)
        if (!proposed) {
          setSignal({ state: 'error', inputVolume: 0, outputVolume: 0 })
          setStatus(
            fail
              ? 'Sample search failed. Your filters and results were preserved; try again.'
              : 'No supported filters found. Try “commute backpacks under $90” or use the manual filters.',
          )
          return
        }
        setPending(proposed)
        setSignal({ state: 'idle', inputVolume: 0, outputVolume: 0 })
        setStatus('Search understood. Review the proposed filters before applying them.')
      }, 1400),
    )
  }

  function applyVoiceFilters() {
    if (!pending || busy.current) return
    setPrevious(filters)
    setFilters(pending)
    setPending(null)
    setStatus('Voice filters applied. Undo restores your previous filter choices.')
  }

  function updateFilters(next: Filters) {
    clearRun()
    setFilters(next)
    setPrevious(null)
    setPending(null)
    setSignal({ state: 'idle', inputVolume: 0, outputVolume: 0 })
    setStatus('Manual filters updated.')
  }

  function undo() {
    if (!previous) return
    clearRun()
    setFilters(previous)
    setPrevious(null)
    setPending(null)
    setSignal({ state: 'idle', inputVolume: 0, outputVolume: 0 })
    setStatus('Previous filters restored.')
  }

  function cancel() {
    clearRun()
    setPending(null)
    setSignal({ state: 'idle', inputVolume: 0, outputVolume: 0 })
    setStatus('Spoken search canceled. Current filters and results are unchanged.')
  }

  return (
    <section className="recipe-demo" aria-label="Spoken product search">
      <p>Local simulation · fictional catalog and prices · no microphone or AI calls</p>
      <Orb signal={signal} theme="circle" size={112} interactive={false} />
      <p className="recipe-status" role="status" aria-atomic="true">
        {status}
      </p>
      <label className="recipe-field">
        Spoken query (editable sample)
        <input
          value={draft}
          maxLength={250}
          disabled={active}
          onChange={(event) => {
            setDraft(event.target.value)
            setPending(null)
          }}
        />
      </label>
      <div className="recipe-actions">
        <button type="button" disabled={active || !draft.trim()} onClick={simulateQuery}>
          Simulate spoken search
        </button>
        <button type="button" disabled={!active && !pending} onClick={cancel}>
          Cancel search
        </button>
        <button type="button" disabled={active || !previous} onClick={undo}>
          Undo voice filters
        </button>
      </div>
      <label>
        <input
          type="checkbox"
          checked={failNext}
          disabled={active}
          onChange={(event) => setFailNext(event.target.checked)}
        />{' '}
        Simulate a search error next turn
      </label>
      {pending && (
        <article className="recipe-card" aria-label="Proposed voice filters">
          <h3>Review heard filters</h3>
          <p>
            {pending.category === 'all' ? 'All uses' : pending.category} · up to ${pending.maxPrice}{' '}
            · {pending.waterproof ? 'waterproof only' : 'any weather protection'}
          </p>
          <button type="button" onClick={applyVoiceFilters}>
            Apply heard filters
          </button>
        </article>
      )}
      <fieldset>
        <legend>Refine results</legend>
        <label className="recipe-field">
          Use
          <select
            value={filters.category}
            onChange={(event) =>
              updateFilters({ ...filters, category: event.target.value as Category })
            }
          >
            {(['all', 'hiking', 'commute', 'travel'] as const).map((category) => (
              <option key={category} value={category}>
                {category === 'all' ? 'All uses' : category}
              </option>
            ))}
          </select>
        </label>
        <label className="recipe-field">
          Maximum price: ${filters.maxPrice}
          <input
            type="range"
            min="0"
            max="200"
            step="1"
            value={filters.maxPrice}
            onChange={(event) =>
              updateFilters({ ...filters, maxPrice: Number(event.target.value) })
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={filters.waterproof}
            onChange={(event) => updateFilters({ ...filters, waterproof: event.target.checked })}
          />{' '}
          Waterproof only
        </label>
      </fieldset>
      <h3 aria-live="polite">
        {results.length} matching {results.length === 1 ? 'backpack' : 'backpacks'}
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
          gap: 12,
        }}
      >
        {results.map((item) => (
          <article className="recipe-card" key={item.id}>
            <h3>{item.name}</h3>
            <p>
              <strong>${item.price}</strong> · {item.category}
            </p>
            <p>{item.detail}</p>
            <p>{item.waterproof ? 'Waterproof shell' : 'Standard shell'}</p>
          </article>
        ))}
      </div>
      {results.length === 0 && (
        <p>
          No matches. Increase your budget or{' '}
          <button type="button" onClick={() => updateFilters(defaults)}>
            Reset filters
          </button>
          .
        </p>
      )}
      <p>
        Supported sample grammar: hiking, commute, travel, waterproof, and “under $100”. Filters
        replace the previous search after your confirmation.
      </p>
    </section>
  )
}
