import { useEffect, useRef, useState } from 'react'
import { Orb, type OrbSignal } from 'orb-ui'

const lessons = [
  {
    prompt: 'Introduce yourself in Spanish',
    sample: 'Yo es Alex y trabaja en diseño.',
    target: 'Yo soy Alex y trabajo en diseño.',
    tip: 'With yo, use soy for identity and trabajo for what you do.',
    replacements: [
      [/\byo es\b/gi, 'Yo soy'],
      [/\btrabaja\b/gi, 'trabajo'],
    ] as const,
  },
  {
    prompt: 'Say how long you have studied',
    sample: 'Estudio español desde hace dos año.',
    target: 'Estudio español desde hace dos años.',
    tip: 'Use the plural años after dos. Desde hace describes an ongoing duration.',
    replacements: [[/\bdos año\b/gi, 'dos años']] as const,
  },
  {
    prompt: 'Order a coffee politely',
    sample: 'Quiero un café, por favor.',
    target: 'Quisiera un café, por favor.',
    tip: 'Quiero is grammatical. Quisiera makes the request more polite.',
    replacements: [[/\bquiero\b/gi, 'Quisiera']] as const,
  },
]

export default function LanguagePractice() {
  const [lessonIndex, setLessonIndex] = useState(0)
  const [draft, setDraft] = useState(lessons[0].sample)
  const [feedback, setFeedback] = useState<{ original: string; corrected: string } | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [signal, setSignal] = useState<OrbSignal>({ state: 'idle' })
  const [status, setStatus] = useState('Choose a lesson, then practice the sample.')
  const [failNext, setFailNext] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const busy = useRef(false)
  const lesson = lessons[lessonIndex]
  const active = ['listening', 'thinking', 'speaking'].includes(signal.state)

  function clearRun() {
    timers.current.forEach(clearTimeout)
    timers.current = []
    busy.current = false
  }

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function later(delay: number, callback: () => void) {
    timers.current.push(setTimeout(callback, delay))
  }

  function practice() {
    if (busy.current || !draft.trim()) return
    clearRun()
    busy.current = true
    const original = draft.trim()
    const fail = failNext
    setFailNext(false)
    setFeedback(null)
    setSignal({ state: 'listening', inputVolume: 0.42, outputVolume: 0 })
    setStatus('Simulating your spoken attempt. The transcript stays editable after this turn.')
    later(900, () => {
      setSignal({ state: 'thinking', inputVolume: 0, outputVolume: 0 })
      setStatus('Checking the local lesson rules…')
    })
    later(1500, () => {
      if (fail) {
        setSignal({ state: 'error', inputVolume: 0, outputVolume: 0 })
        setStatus('Sample feedback error. Your attempt is saved; try the same turn again.')
        busy.current = false
        return
      }
      let corrected = original
      for (const [pattern, replacement] of lesson.replacements) {
        corrected = corrected.replace(pattern, replacement)
      }
      setFeedback({ original, corrected })
      setAttempts((value) => value + 1)
      setSignal({ state: 'speaking', inputVolume: 0, outputVolume: 0.58 })
      setStatus('Previewing the coach reply silently. Read the correction below.')
      later(1300, () => {
        busy.current = false
        setSignal({ state: 'idle', inputVolume: 0, outputVolume: 0 })
        setStatus('Feedback ready. Edit your attempt or repeat the corrected phrase.')
      })
    })
  }

  function repeat() {
    if (busy.current || !feedback) return
    clearRun()
    busy.current = true
    setDraft(feedback.corrected)
    setSignal({ state: 'speaking', inputVolume: 0, outputVolume: 0.5 })
    setStatus(`Silent repeat cue: ${feedback.corrected}`)
    later(1600, () => {
      busy.current = false
      setSignal({ state: 'idle', inputVolume: 0, outputVolume: 0 })
      setStatus('Your corrected phrase is now in the editor. Practice it again when ready.')
    })
  }

  function cancel() {
    clearRun()
    setSignal({ state: 'idle', inputVolume: 0, outputVolume: 0 })
    setStatus('Turn canceled. Your text and any completed feedback are preserved.')
  }

  function changeLesson(index: number) {
    clearRun()
    setLessonIndex(index)
    setDraft(lessons[index].sample)
    setFeedback(null)
    setSignal({ state: 'idle', inputVolume: 0, outputVolume: 0 })
    setStatus('New lesson ready. Practice the sample or edit it first.')
  }

  return (
    <section className="recipe-demo" aria-label="Spanish language practice">
      <p>Local simulation · silent coach replies · no microphone or AI calls</p>
      <Orb signal={signal} theme="circle" size={112} interactive={false} />
      <p className="recipe-status" role="status" aria-atomic="true">
        {status}
      </p>
      <label className="recipe-field">
        Lesson
        <select value={lessonIndex} onChange={(event) => changeLesson(Number(event.target.value))}>
          {lessons.map((item, index) => (
            <option key={item.prompt} value={index}>
              {item.prompt}
            </option>
          ))}
        </select>
      </label>
      <label className="recipe-field">
        Your attempt (editable transcript)
        <textarea
          value={draft}
          disabled={active}
          rows={2}
          maxLength={300}
          lang="es"
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <div className="recipe-actions">
        <button type="button" disabled={active || !draft.trim()} onClick={practice}>
          Practice sample
        </button>
        <button type="button" disabled={active || !feedback} onClick={repeat}>
          Repeat corrected phrase
        </button>
        <button type="button" disabled={!active} onClick={cancel}>
          Cancel turn
        </button>
      </div>
      <label>
        <input
          type="checkbox"
          checked={failNext}
          disabled={active}
          onChange={(event) => setFailNext(event.target.checked)}
        />{' '}
        Simulate a feedback error next turn
      </label>
      {feedback && (
        <article className="recipe-card" aria-label="Practice feedback">
          <h3>
            {feedback.corrected !== feedback.original
              ? 'Suggested correction'
              : 'No lesson-rule changes needed'}
          </h3>
          <p lang="es">
            <del>{feedback.corrected !== feedback.original ? feedback.original : ''}</del>
          </p>
          <p lang="es">
            <strong>{feedback.corrected}</strong>
          </p>
          <p>{lesson.tip}</p>
          <p>
            Model phrase: <span lang="es">{lesson.target}</span>
          </p>
        </article>
      )}
      <p>
        {attempts} completed {attempts === 1 ? 'attempt' : 'attempts'}. Feedback checks only the
        displayed lesson rules; it is not a general language assessment.
      </p>
    </section>
  )
}
