import { useEffect, useRef, useState } from 'react'
import { Orb, type OrbSignal } from 'orb-ui'

const questions = [
  {
    prompt: 'Tell me about a project where you solved a difficult problem.',
    sample: 'Our team had a slow onboarding flow. I led a redesign and tested it with five users.',
    cues: ['problem', 'action', 'result'],
    patterns: [
      /slow|problem|challenge|difficult/i,
      /\bI\b.*(?:led|built|changed|tested|designed)/i,
      /result|increased|reduced|improved|%/i,
    ],
    suggestion: 'Add the outcome: what changed, and how did you measure it?',
  },
  {
    prompt: 'Describe a disagreement and how you worked through it.',
    sample:
      'We disagreed about scope. I listened to both concerns and proposed a smaller test. We agreed on a plan.',
    cues: ['disagreement', 'listening', 'resolution'],
    patterns: [
      /disagree|conflict|different|debate/i,
      /listen|understand|concern/i,
      /agreed|resolved|plan|compromise/i,
    ],
    suggestion: 'Show what you learned, and keep the other person’s perspective visible.',
  },
  {
    prompt: 'Why are you interested in this role?',
    sample:
      'I enjoy making complex tools accessible. My experience in design fits the team, and I want to learn from your research practice.',
    cues: ['motivation', 'relevant experience', 'growth'],
    patterns: [
      /enjoy|excited|interest|care/i,
      /experience|skill|built|design/i,
      /learn|grow|develop/i,
    ],
    suggestion: 'Tie one specific team need to evidence from your experience.',
  },
]

interface Review {
  answer: string
  covered: boolean[]
}

export default function InterviewRehearsal() {
  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState(questions[0].sample)
  const [review, setReview] = useState<Review | null>(null)
  const [saved, setSaved] = useState<string[]>([])
  const [attempt, setAttempt] = useState(1)
  const [signal, setSignal] = useState<OrbSignal>({ state: 'idle' })
  const [status, setStatus] = useState('Rehearse three questions at your own pace.')
  const [failNext, setFailNext] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const busy = useRef(false)
  const committed = useRef(false)
  const question = questions[index]
  const active = ['listening', 'thinking', 'speaking'].includes(signal.state)
  const complete = saved.length === questions.length

  function clearRun() {
    timers.current.forEach(clearTimeout)
    timers.current = []
    busy.current = false
  }
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function later(delay: number, callback: () => void) {
    timers.current.push(setTimeout(callback, delay))
  }

  function rehearse() {
    if (busy.current || !draft.trim() || complete) return
    clearRun()
    busy.current = true
    const answer = draft.trim()
    const fail = failNext
    setFailNext(false)
    committed.current = false
    setReview(null)
    setSignal({ state: 'listening', inputVolume: 0.46, outputVolume: 0 })
    setStatus('Simulating your answer. No recording is created.')
    later(1000, () => {
      setSignal({ state: 'thinking', inputVolume: 0, outputVolume: 0 })
      setStatus('Checking the local story checklist…')
    })
    later(1700, () => {
      if (fail) {
        busy.current = false
        setSignal({ state: 'error', inputVolume: 0, outputVolume: 0 })
        setStatus('Practice review failed. Your answer and previous questions are preserved.')
        return
      }
      setReview({ answer, covered: question.patterns.map((pattern) => pattern.test(answer)) })
      setSignal({ state: 'speaking', inputVolume: 0, outputVolume: 0.54 })
      setStatus('Silent coach reply: review the checklist, then retry or save your answer.')
      later(1000, () => {
        busy.current = false
        setSignal({ state: 'idle', inputVolume: 0, outputVolume: 0 })
        setStatus('Review ready. You choose when to move to the next question.')
      })
    })
  }

  function retry() {
    clearRun()
    committed.current = false
    setReview(null)
    setAttempt((value) => value + 1)
    setSignal({ state: 'idle', inputVolume: 0, outputVolume: 0 })
    setStatus('Same question, fresh attempt. Edit your answer and rehearse again.')
  }

  function saveAnswer() {
    if (busy.current || committed.current || !review) return
    committed.current = true
    setSaved((answers) => [...answers, review.answer])
    setReview(null)
    setAttempt(1)
    if (index < questions.length - 1) {
      setIndex(index + 1)
      setDraft(questions[index + 1].sample)
      setStatus('Answer saved locally for this page. The next question is ready.')
    } else {
      setStatus('Practice complete. Read your saved answers or start another rehearsal.')
    }
  }

  function cancel() {
    clearRun()
    setSignal({ state: 'idle', inputVolume: 0, outputVolume: 0 })
    setStatus('Practice turn canceled. Your draft is unchanged.')
  }

  function reset() {
    clearRun()
    committed.current = false
    setIndex(0)
    setDraft(questions[0].sample)
    setReview(null)
    setSaved([])
    setAttempt(1)
    setFailNext(false)
    setSignal({ state: 'idle', inputVolume: 0, outputVolume: 0 })
    setStatus('New rehearsal ready.')
  }

  return (
    <section className="recipe-demo" aria-label="Interview rehearsal">
      <p>Local simulation · silent feedback · no microphone, recording, or AI calls</p>
      <Orb signal={signal} theme="bars" size={112} interactive={false} />
      <p className="recipe-status" role="status" aria-atomic="true">
        {status}
      </p>
      <label>
        Rehearsal progress <progress value={saved.length} max={questions.length} /> {saved.length}{' '}
        of {questions.length} answers saved
      </label>
      {!complete && (
        <>
          <h3>
            Question {index + 1} · attempt {attempt}
          </h3>
          <p>{question.prompt}</p>
          <label className="recipe-field">
            Your answer (editable transcript)
            <textarea
              rows={3}
              maxLength={1500}
              value={draft}
              disabled={active || !!review}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <div className="recipe-actions">
            <button type="button" disabled={active || !!review || !draft.trim()} onClick={rehearse}>
              Rehearse answer
            </button>
            <button type="button" disabled={active || !review} onClick={retry}>
              Retry this question
            </button>
            <button type="button" disabled={active || !review} onClick={saveAnswer}>
              {index === questions.length - 1 ? 'Save and finish' : 'Save and next question'}
            </button>
            <button type="button" disabled={!active} onClick={cancel}>
              Cancel turn
            </button>
          </div>
          <label>
            <input
              type="checkbox"
              checked={failNext}
              disabled={active || !!review}
              onChange={(event) => setFailNext(event.target.checked)}
            />{' '}
            Simulate a review error next turn
          </label>
          {review && (
            <article className="recipe-card" aria-label="Story feedback">
              <h3>
                Story checklist · {review.covered.filter(Boolean).length}/{question.cues.length}
              </h3>
              <ul>
                {question.cues.map((cue, cueIndex) => (
                  <li key={cue}>
                    {review.covered[cueIndex] ? 'Included' : 'Add detail'}: {cue}
                  </li>
                ))}
              </ul>
              <p>{question.suggestion}</p>
              <p>
                This transparent keyword checklist is a practice aid, not an assessment of your
                ability.
              </p>
            </article>
          )}
        </>
      )}
      {saved.length > 0 && (
        <details open={complete}>
          <summary>{complete ? 'Your rehearsal answers' : 'Saved answers'}</summary>
          <ol>
            {saved.map((answer, answerIndex) => (
              <li key={answerIndex}>
                <strong>{questions[answerIndex].prompt}</strong>
                <p>{answer}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
      <button type="button" onClick={reset}>
        Start over
      </button>
    </section>
  )
}
