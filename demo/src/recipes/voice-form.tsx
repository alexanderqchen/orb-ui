import { useEffect, useRef, useState } from 'react'
import { Orb, type OrbState } from 'orb-ui'

type Booking = { name: string; time: string; guests: string; seating: string }
const empty: Booking = { name: '', time: '', guests: '2', seating: 'Inside' }
const fixture: Booking = {
  name: 'Morgan Lee',
  time: 'Thursday, 7 pm',
  guests: '4',
  seating: 'Patio',
}

export default function VoiceForm() {
  const [fields, setFields] = useState<Booking>(empty)
  const [stage, setStage] = useState<'edit' | 'review' | 'confirmed'>('edit')
  const [state, setState] = useState<OrbState>('idle')
  const [message, setMessage] = useState('Fill the draft by voice, then review every detail.')
  const [heard, setHeard] = useState('')
  const [resetAvailable, setResetAvailable] = useState(true)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const generation = useRef(0)
  const active = useRef(false)
  const confirmed = useRef(false)

  function cancel() {
    generation.current += 1
    timers.current.forEach(clearTimeout)
    timers.current = []
    active.current = false
  }
  useEffect(
    () => () => {
      generation.current += 1
      timers.current.forEach(clearTimeout)
    },
    [],
  )
  function later(delay: number, run: () => void) {
    const token = generation.current
    timers.current.push(
      setTimeout(() => {
        if (generation.current === token) run()
      }, delay),
    )
  }
  function fill() {
    if (active.current || stage !== 'edit') return
    cancel()
    active.current = true
    setState('listening')
    setMessage('Listening to a local transcript fixture…')
    setHeard('A table for four…')
    later(650, () => setHeard('A table for four, Thursday at 7 pm, on the patio.'))
    later(1400, () => {
      setHeard('A table for four, Thursday at 7 pm, on the patio. The name is Morgan Lee.')
      setState('thinking')
      setMessage('Extracting editable fields from the simulated request…')
    })
    later(2000, () => {
      setFields({ ...fixture })
      setState('idle')
      active.current = false
      setMessage('Draft filled. Correct anything the transcript got wrong, then review.')
    })
  }
  function stop(failed = false) {
    cancel()
    setState(failed ? 'error' : 'idle')
    setHeard('')
    setMessage(
      failed
        ? 'Simulated voice failure. Your editable fields were preserved. Retry voice fill.'
        : 'Voice fill cancelled. Your editable fields were preserved.',
    )
  }
  const valid =
    fields.name.trim().length > 0 &&
    fields.time.trim().length > 0 &&
    Number(fields.guests) >= 1 &&
    Number(fields.guests) <= 12
  const busy = state === 'listening' || state === 'thinking' || state === 'speaking'
  function review() {
    if (!valid || active.current) return
    cancel()
    active.current = true
    setStage('review')
    setState('speaking')
    setMessage('Simulated read-back: check the name, time, party size, and seating below.')
    later(1000, () => {
      setState('idle')
      active.current = false
      setMessage('Ready for your explicit confirmation.')
    })
  }
  function confirm() {
    if (active.current || confirmed.current || stage !== 'review') return
    confirmed.current = true
    setResetAvailable(false)
    setStage('confirmed')
    setState('idle')
    setMessage('Local booking confirmed. This demo does not reserve a real table.')
    // The second click of a confirmation double-click must not reset the new screen.
    later(600, () => setResetAvailable(true))
  }
  function reset() {
    if (!resetAvailable) return
    cancel()
    confirmed.current = false
    setFields({ ...empty })
    setHeard('')
    setStage('edit')
    setState('idle')
    setMessage('New local draft. Fill by voice or use the keyboard.')
  }

  return (
    <section className="recipe-demo" aria-label="Voice form review and confirmation">
      <p className="recipe-status">LOCAL SIMULATION · No microphone, network, or paid calls</p>
      <Orb
        theme="radial"
        size={126}
        interactive={false}
        signal={{
          state,
          inputVolume: state === 'listening' ? 0.5 : 0,
          outputVolume: state === 'speaking' ? 0.56 : 0,
        }}
      />
      <p role="status" className="recipe-status">
        {message}
      </p>
      {stage === 'edit' ? (
        <>
          <div className="recipe-actions">
            <button type="button" disabled={busy} onClick={fill}>
              {state === 'error' ? 'Retry voice fill' : 'Start voice fill'}
            </button>
            <button type="button" disabled={!busy} onClick={() => stop()}>
              Stop voice fill
            </button>
            <button type="button" disabled={state === 'error'} onClick={() => stop(true)}>
              Simulate voice error
            </button>
          </div>
          {heard && (
            <p className="recipe-card">
              <strong>Simulated transcript:</strong> {heard}
            </p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              review()
            }}
          >
            <label className="recipe-field">
              Booking name
              <input
                required
                value={fields.name}
                disabled={busy}
                onChange={(event) => setFields({ ...fields, name: event.target.value })}
              />
            </label>
            <label className="recipe-field">
              Requested date and time
              <input
                required
                value={fields.time}
                disabled={busy}
                placeholder="For example, Thursday at 7 pm"
                onChange={(event) => setFields({ ...fields, time: event.target.value })}
              />
            </label>
            <label className="recipe-field">
              Guests (1–12)
              <input
                type="number"
                required
                min={1}
                max={12}
                value={fields.guests}
                disabled={busy}
                onChange={(event) => setFields({ ...fields, guests: event.target.value })}
              />
            </label>
            <label className="recipe-field">
              Seating preference
              <select
                value={fields.seating}
                disabled={busy}
                onChange={(event) => setFields({ ...fields, seating: event.target.value })}
              >
                <option>Inside</option>
                <option>Patio</option>
                <option>No preference</option>
              </select>
            </label>
            <button type="submit" disabled={busy || !valid}>
              Review booking
            </button>
          </form>
        </>
      ) : (
        <div className="recipe-card">
          <h3>{stage === 'confirmed' ? 'Local confirmation' : 'Review your draft'}</h3>
          <dl>
            <dt>Name</dt>
            <dd>{fields.name}</dd>
            <dt>When</dt>
            <dd>{fields.time}</dd>
            <dt>Guests</dt>
            <dd>{fields.guests}</dd>
            <dt>Seating</dt>
            <dd>{fields.seating}</dd>
          </dl>
          <div className="recipe-actions">
            {stage === 'review' ? (
              <>
                <button type="button" disabled={busy} onClick={confirm}>
                  Confirm local booking
                </button>
                <button
                  type="button"
                  onClick={() => {
                    cancel()
                    setStage('edit')
                    setState('idle')
                    setMessage('Edit your draft, then review again.')
                  }}
                >
                  Edit details
                </button>
              </>
            ) : (
              <button type="button" disabled={!resetAvailable} onClick={reset}>
                Start a new draft
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
