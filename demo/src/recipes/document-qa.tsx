import { useEffect, useRef, useState } from 'react'
import { Orb, type OrbState } from 'orb-ui'

const passages = [
  {
    id: 'doc-refunds',
    title: 'Refund window',
    text: 'Unused seats can be refunded within 14 days of purchase. Submit a request with your order number. Used seats are not refundable.',
  },
  {
    id: 'doc-access',
    title: 'Team access',
    text: 'Workspace owners can invite editors or viewers. Viewers can read documents; editors can change them. Access can be revoked from Workspace settings.',
  },
  {
    id: 'doc-export',
    title: 'Export your documents',
    text: 'Owners and editors can export individual documents as Markdown from the document menu. Workspace-wide exports require the owner role.',
  },
]
type Answer = { text: string; citations: string[] }
const samples = ['Can I get a refund?', 'What can a viewer do?', 'How do I export a document?']

function answerFromFixture(question: string): Answer | null {
  if (/refund|money back/i.test(question))
    return {
      text: 'You can request a refund for unused seats within 14 days. Include your order number; used seats are excluded.',
      citations: ['doc-refunds'],
    }
  if (/viewer|invite|access/i.test(question))
    return {
      text: 'Viewers can read documents. Owners invite viewers or editors, and can revoke access in Workspace settings.',
      citations: ['doc-access'],
    }
  if (/export|download|markdown/i.test(question))
    return {
      text: 'Use the document menu to export Markdown. Owners and editors can export one document; only owners can export the whole workspace.',
      citations: ['doc-export'],
    }
  return null
}

export default function DocumentQA() {
  const [question, setQuestion] = useState(samples[0])
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [state, setState] = useState<OrbState>('idle')
  const [message, setMessage] = useState(
    'Ask about the sample handbook. Every supported answer includes a source.',
  )
  const [transcript, setTranscript] = useState('')
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const generation = useRef(0)
  const active = useRef(false)

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
  function ask(voice: boolean) {
    if (active.current || !question.trim()) return
    const capturedQuestion = question.trim()
    cancel()
    active.current = true
    setAnswer(null)
    setTranscript(voice ? 'Simulated question: ' + capturedQuestion : capturedQuestion)
    setState(voice ? 'listening' : 'thinking')
    setMessage(
      voice
        ? 'Playing a transcript fixture. No microphone is open.'
        : 'Searching three local source passages…',
    )
    const delay = voice ? 800 : 0
    later(delay, () => {
      setState('thinking')
      setMessage('Matching the question to the sample handbook…')
    })
    later(delay + 700, () => {
      const result = answerFromFixture(capturedQuestion)
      if (!result) {
        active.current = false
        setState('idle')
        setMessage(
          'No matching source in this fixture. Try refund, viewer access, or document export. No answer was invented.',
        )
        return
      }
      setAnswer(result)
      setState('speaking')
      setMessage('Simulated answer narration. Select a citation to read the source.')
      later(1300, () => {
        active.current = false
        setState('idle')
        setMessage('Answer ready. Check the source before relying on it.')
      })
    })
  }
  function stop(failed = false) {
    cancel()
    setState(failed ? 'error' : 'idle')
    setAnswer(null)
    setTranscript('')
    setMessage(
      failed
        ? 'Simulated retrieval failure. Your question is preserved. Retry the question.'
        : 'Question cancelled. No delayed answer will replace the next question.',
    )
  }
  const busy = state === 'listening' || state === 'thinking' || state === 'speaking'

  return (
    <section className="recipe-demo" aria-label="Voice document questions with citations">
      <p className="recipe-status">
        LOCAL SIMULATION · Text fixtures; no microphone, audio, or paid calls
      </p>
      <Orb
        theme="circle"
        size={126}
        interactive={false}
        signal={{
          state,
          inputVolume: state === 'listening' ? 0.42 : 0,
          outputVolume: state === 'speaking' ? 0.62 : 0,
        }}
      />
      <p role="status" className="recipe-status">
        {message}
      </p>
      <label className="recipe-field">
        Question about the sample handbook
        <input
          value={question}
          disabled={busy}
          onChange={(event) => setQuestion(event.target.value)}
        />
      </label>
      <div className="recipe-actions" aria-label="Sample questions">
        {samples.map((sample) => (
          <button
            key={sample}
            type="button"
            disabled={busy}
            onClick={() => {
              setQuestion(sample)
              setAnswer(null)
            }}
          >
            {sample}
          </button>
        ))}
      </div>
      <div className="recipe-actions">
        <button type="button" disabled={busy || !question.trim()} onClick={() => ask(true)}>
          {state === 'error' ? 'Retry voice question' : 'Ask by voice (fixture)'}
        </button>
        <button type="button" disabled={busy || !question.trim()} onClick={() => ask(false)}>
          Ask typed question
        </button>
        <button type="button" disabled={!busy} onClick={() => stop()}>
          Stop answer
        </button>
        <button type="button" disabled={state === 'error'} onClick={() => stop(true)}>
          Simulate retrieval error
        </button>
      </div>
      {transcript && <p className="recipe-status">{transcript}</p>}
      {answer && (
        <article className="recipe-card" aria-label="Answer with sources">
          <h3>Grounded sample answer</h3>
          <p>{answer.text}</p>
          <p>
            Sources:{' '}
            {answer.citations.map((id) => {
              const source = passages.find((passage) => passage.id === id)!
              return (
                <a key={id} href={'#' + id}>
                  {source.title}
                </a>
              )
            })}
          </p>
        </article>
      )}
      <div className="recipe-card" aria-label="Source document">
        <h3>Sample handbook · version 1</h3>
        {passages.map((passage) => (
          <section key={passage.id} id={passage.id} tabIndex={-1}>
            <h4>{passage.title}</h4>
            <p>{passage.text}</p>
          </section>
        ))}
      </div>
    </section>
  )
}
