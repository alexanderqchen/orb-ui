import { useEffect, useRef, useState } from 'react'
import { Orb, type OrbState } from 'orb-ui'

const sample = 'Can we move the design review to Thursday at 2 pm?'

export default function PushToTalk() {
  const [state, setState] = useState<OrbState>('idle')
  const [draft, setDraft] = useState('')
  const [interim, setInterim] = useState('')
  const [message, setMessage] = useState('Hold the button, or try the sample dictation.')
  const [sent, setSent] = useState<string[]>([])
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const generation = useRef(0)
  const active = useRef(false)
  const partial = useRef('')
  const submitted = useRef<string | null>(null)

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

  function finish(useFullSample = false) {
    if (!active.current) return
    const text = useFullSample ? sample : partial.current
    cancel()
    if (!text) {
      setState('idle')
      setInterim('')
      setMessage('Nothing captured yet. Hold a little longer, or try the sample.')
      return
    }
    active.current = true
    setState('thinking')
    setMessage('Finalizing simulated dictation…')
    later(450, () => {
      setDraft((previous) => [previous.trim(), text].filter(Boolean).join(' '))
      setInterim('')
      setState('idle')
      active.current = false
      submitted.current = null
      setMessage('Draft ready. Edit the words before adding your message.')
    })
  }

  function start(autoFinish = false) {
    if (active.current) return
    cancel()
    active.current = true
    partial.current = ''
    setInterim('')
    setState('listening')
    setMessage('Simulated dictation in progress. No microphone is open.')
    sample.split(' ').forEach((_, index, words) => {
      later((index + 1) * 160, () => {
        partial.current = words.slice(0, index + 1).join(' ')
        setInterim(partial.current)
      })
    })
    if (autoFinish) later(2100, () => finish(true))
  }

  function fail() {
    cancel()
    setInterim('')
    setState('error')
    setMessage('Simulated transcription failure. Your existing draft is safe. Try again.')
  }

  function stop() {
    cancel()
    setInterim('')
    setState('idle')
    setMessage('Dictation cancelled. Your existing draft is unchanged.')
  }

  function send() {
    const text = draft.trim()
    if (active.current || !text || submitted.current === text) return
    submitted.current = text
    setSent((previous) => [...previous, text])
    setDraft('')
    setMessage('Message added to the local conversation. Nothing was sent to a server.')
  }

  const busy = state === 'listening' || state === 'thinking'
  return (
    <section className="recipe-demo" aria-label="Push-to-talk composer">
      <p className="recipe-status">LOCAL SIMULATION · No microphone, network, or paid calls</p>
      <Orb
        theme="circle"
        size={126}
        interactive={false}
        signal={{ state, inputVolume: state === 'listening' ? 0.48 : 0, outputVolume: 0 }}
      />
      <p role="status" className="recipe-status">
        {message}
      </p>
      <div className="recipe-actions">
        <button
          type="button"
          disabled={state === 'thinking'}
          aria-pressed={state === 'listening'}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            start()
          }}
          onPointerUp={() => finish()}
          onPointerCancel={stop}
          onKeyDown={(event) => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault()
              if (!event.repeat) start()
            }
          }}
          onKeyUp={(event) => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault()
              finish()
            }
          }}
          onBlur={() => {
            if (state === 'listening') finish()
          }}
        >
          Hold to dictate
        </button>
        <button type="button" disabled={busy} onClick={() => start(true)}>
          {state === 'error' ? 'Retry sample dictation' : 'Try sample dictation'}
        </button>
        <button type="button" disabled={!busy} onClick={stop}>
          Cancel dictation
        </button>
      </div>
      <p className="recipe-status">Hold with a pointer, Space, or Enter. Release to finish.</p>
      <div className="recipe-card" aria-label="Interim transcript">
        <strong>Live draft</strong>
        <p>{interim || 'Your simulated words appear here.'}</p>
      </div>
      <label className="recipe-field">
        Editable message
        <textarea
          rows={3}
          value={draft}
          disabled={busy}
          placeholder="Dictate or type a message…"
          onChange={(event) => {
            setDraft(event.target.value)
            submitted.current = null
          }}
        />
      </label>
      <div className="recipe-actions">
        <button type="button" disabled={busy || !draft.trim()} onClick={send}>
          Add message
        </button>
        <button type="button" disabled={state === 'error'} onClick={fail}>
          Simulate transcription error
        </button>
      </div>
      {sent.length > 0 && (
        <div className="recipe-card" aria-label="Local messages">
          <strong>Local conversation</strong>
          <ul>
            {sent.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
