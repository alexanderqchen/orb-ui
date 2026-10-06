import { useEffect, useRef, useState } from 'react'
import { Orb, type OrbState } from 'orb-ui'

type Draft = { name: string; visibility: string; reviewed: boolean }
const steps = [
  {
    title: 'Name your workspace',
    instruction: 'Choose a recognizable workspace name. This only creates a local draft.',
  },
  {
    title: 'Choose access',
    instruction:
      'Choose private or team access. No invitations or permissions change in this demo.',
  },
  {
    title: 'Review your setup',
    instruction: 'Check the draft below, then mark it reviewed. You can undo every step.',
  },
]

export default function GuidedOnboarding() {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>({ name: '', visibility: 'Private', reviewed: false })
  const [nameChoice, setNameChoice] = useState('Studio North')
  const [accessChoice, setAccessChoice] = useState('Private')
  const [history, setHistory] = useState<Draft[]>([])
  const [ready, setReady] = useState(false)
  const [state, setState] = useState<OrbState>('idle')
  const [message, setMessage] = useState(
    'Guide a step, review its instruction, then apply it locally.',
  )
  const [tool, setTool] = useState('No local tool has run yet.')
  const [failNext, setFailNext] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const generation = useRef(0)
  const active = useRef(false)
  const complete = step === steps.length

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
  function guide() {
    if (active.current || complete) return
    cancel()
    active.current = true
    setReady(false)
    setState('listening')
    setMessage('Simulated request: “Help me with ' + steps[step].title.toLowerCase() + '.”')
    later(600, () => {
      setState('speaking')
      setMessage(steps[step].instruction)
    })
    later(1500, () => {
      active.current = false
      setState('idle')
      setReady(true)
      setMessage('Instruction ready. Make your choice, then apply this local step.')
    })
  }
  function apply() {
    if (active.current || !ready || complete || (step === 0 && !nameChoice.trim())) return
    cancel()
    active.current = true
    const snapshot = { ...draft }
    const currentStep = step
    const result =
      currentStep === 0
        ? { ...snapshot, name: nameChoice.trim() }
        : currentStep === 1
          ? { ...snapshot, visibility: accessChoice }
          : { ...snapshot, reviewed: true }
    setState('thinking')
    setTool(
      'Running local tool: ' +
        ['save workspace draft', 'save access preference', 'mark draft reviewed'][step] +
        '…',
    )
    setMessage('Applying your choice to in-memory state…')
    later(650, () => {
      if (failNext) {
        setFailNext(false)
        active.current = false
        setState('error')
        setTool('Simulated tool failure. No local change was committed.')
        setMessage('Retry Apply local step, or stop and edit your choice.')
        return
      }
      setHistory((previous) => [...previous, snapshot])
      setDraft(result)
      setStep(currentStep + 1)
      setReady(false)
      active.current = false
      setState('idle')
      setTool('Local tool succeeded: ' + steps[currentStep].title + '. Undo is available.')
      setMessage(
        currentStep === 2
          ? 'Setup draft complete. Nothing was created on a server.'
          : 'Step complete. Guide the next step when you are ready.',
      )
    })
  }
  function stop() {
    cancel()
    setState('idle')
    setTool('Pending local work cancelled. Previously completed steps remain.')
    setMessage('Stopped. Guide this step again, or edit your draft.')
  }
  function undo() {
    if (active.current || history.length === 0) return
    cancel()
    setDraft(history[history.length - 1])
    setHistory(history.slice(0, -1))
    setStep((previous) => Math.max(0, previous - 1))
    setReady(false)
    setState('idle')
    setTool('Previous local step undone.')
    setMessage('Back one step. Review your choice and guide it again.')
  }
  const busy = state === 'listening' || state === 'speaking' || state === 'thinking'

  return (
    <section className="recipe-demo" aria-label="Voice guided onboarding with undo">
      <p className="recipe-status">
        LOCAL SIMULATION · No account, network, permissions, or paid calls
      </p>
      <Orb
        theme="radial"
        size={126}
        interactive={false}
        signal={{
          state,
          inputVolume: state === 'listening' ? 0.43 : 0,
          outputVolume: state === 'speaking' ? 0.6 : 0,
        }}
      />
      <p role="status" className="recipe-status">
        {message}
      </p>
      <ol aria-label="Onboarding progress">
        {steps.map((item, index) => (
          <li key={item.title} aria-current={index === step ? 'step' : undefined}>
            {index < step ? '✓ ' : ''}
            {item.title}
            {index === step ? ' · current' : ''}
          </li>
        ))}
      </ol>
      <div className="recipe-card">
        <h3>{complete ? 'Your reviewed local draft' : steps[step].title}</h3>
        {step === 0 && (
          <label className="recipe-field">
            Workspace name
            <input
              required
              value={nameChoice}
              disabled={busy}
              onChange={(event) => setNameChoice(event.target.value)}
            />
          </label>
        )}
        {step === 1 && (
          <label className="recipe-field">
            Access preference
            <select
              value={accessChoice}
              disabled={busy}
              onChange={(event) => setAccessChoice(event.target.value)}
            >
              <option>Private</option>
              <option>Team</option>
            </select>
          </label>
        )}
        {step >= 2 && (
          <dl>
            <dt>Workspace</dt>
            <dd>{draft.name}</dd>
            <dt>Access</dt>
            <dd>{draft.visibility}</dd>
            <dt>Review</dt>
            <dd>{draft.reviewed ? 'Complete' : 'Awaiting your confirmation'}</dd>
          </dl>
        )}
        <div className="recipe-actions">
          <button type="button" disabled={busy || complete} onClick={guide}>
            Guide this step
          </button>
          <button
            type="button"
            disabled={busy || !ready || complete || (step === 0 && !nameChoice.trim())}
            onClick={apply}
          >
            {state === 'error' ? 'Retry local step' : 'Apply local step'}
          </button>
          <button type="button" disabled={!busy} onClick={stop}>
            Stop guidance
          </button>
          <button type="button" disabled={busy || history.length === 0} onClick={undo}>
            Undo previous step
          </button>
        </div>
      </div>
      <p className="recipe-status" role="status">
        {tool}
      </p>
      <label className="recipe-field">
        <span>
          <input
            type="checkbox"
            checked={failNext}
            disabled={busy || complete}
            onChange={(event) => setFailNext(event.target.checked)}
          />{' '}
          Simulate an error on the next local tool
        </span>
      </label>
    </section>
  )
}
