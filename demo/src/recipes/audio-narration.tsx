import { useEffect, useRef, useState } from 'react'
import { Orb, type OrbSignal } from 'orb-ui'

const transcript = [
  { start: 0, end: 3.125306, text: 'Welcome to the garden. Take a moment to notice the light.' },
  {
    start: 3.125306,
    end: 6.013787,
    text: 'Follow the path toward the fountain and listen to the water.',
  },
  {
    start: 6.013787,
    end: 9.4039,
    text: 'Pause here. Your next chapter begins whenever you are ready.',
  },
]

interface AudioGraph {
  context: AudioContext
  source: MediaElementAudioSourceNode
  analyser: AnalyserNode
}

export default function AudioNarration() {
  const audio = useRef<HTMLAudioElement>(null)
  const graph = useRef<AudioGraph | null>(null)
  const frame = useRef(0)
  const generation = useRef(0)
  const active = useRef(false)
  const lastSample = useRef(0)
  const [signal, setSignal] = useState<OrbSignal>({ state: 'idle' })
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(9.4039)
  const [status, setStatus] = useState('Play the local narration fixture to follow its transcript.')
  const [failNext, setFailNext] = useState(false)
  const [volume, setVolume] = useState(0.2)
  const playing = signal.state === 'speaking' || signal.state === 'connecting'
  const currentSegment = transcript.findIndex(
    (segment) => position >= segment.start && position < segment.end,
  )

  useEffect(() => {
    const element = audio.current
    return () => {
      generation.current += 1
      active.current = false
      cancelAnimationFrame(frame.current)
      element?.pause()
      const current = graph.current
      current?.source.disconnect()
      current?.analyser.disconnect()
      if (current && current.context.state !== 'closed')
        void current.context.close().catch(() => undefined)
      graph.current = null
    }
  }, [])

  function pause() {
    generation.current += 1
    active.current = false
    cancelAnimationFrame(frame.current)
    audio.current?.pause()
    const context = graph.current?.context
    if (context?.state === 'running') void context.suspend().catch(() => undefined)
    setSignal({ state: 'idle', inputVolume: 0, outputVolume: 0 })
    setStatus('Paused. Resume from the highlighted passage.')
  }

  function reportError(message: string) {
    pause()
    setSignal({ state: 'error', inputVolume: 0, outputVolume: 0 })
    setStatus(message)
  }

  async function play() {
    const element = audio.current
    if (!element || active.current) return
    if (failNext) {
      setFailNext(false)
      reportError('Simulated playback failure. Your position is preserved; press Play to retry.')
      return
    }
    const run = ++generation.current
    active.current = true
    setSignal({ state: 'connecting', inputVolume: 0, outputVolume: 0 })
    setStatus('Preparing local audio playback…')
    try {
      if (!graph.current) {
        const context = new AudioContext()
        try {
          const source = context.createMediaElementSource(element)
          const analyser = context.createAnalyser()
          analyser.fftSize = 512
          source.connect(analyser)
          analyser.connect(context.destination)
          graph.current = { context, source, analyser }
        } catch (error) {
          void context.close().catch(() => undefined)
          throw error
        }
      }
      const { context, analyser } = graph.current
      if (element.error) element.load()
      if (element.ended || element.currentTime >= duration) element.currentTime = 0
      element.volume = volume
      // Both calls happen in the user's click handler for browser autoplay policy.
      await Promise.all([context.resume(), element.play()])
      if (run !== generation.current) {
        if (!active.current) element.pause()
        return
      }
      setStatus('Playing local narration. Highlighting follows the audio clock, not a timer.')
      const samples = new Float32Array(analyser.fftSize)
      lastSample.current = 0
      function sample(timestamp: number) {
        if (!active.current || run !== generation.current) return
        if (timestamp - lastSample.current >= 50) {
          lastSample.current = timestamp
          analyser.getFloatTimeDomainData(samples)
          let sum = 0
          for (const value of samples) sum += value * value
          const level = Math.min(1, Math.sqrt(sum / samples.length) * 6)
          setPosition(element!.currentTime)
          setSignal({ state: 'speaking', inputVolume: 0, outputVolume: level })
        }
        frame.current = requestAnimationFrame(sample)
      }
      frame.current = requestAnimationFrame(sample)
    } catch {
      if (run !== generation.current) return
      reportError(
        'Audio could not play. Check browser playback permission and the local fixture, then retry.',
      )
    }
  }

  function reset() {
    pause()
    if (audio.current && audio.current.readyState >= 1) audio.current.currentTime = 0
    setPosition(0)
    setStatus('Track reset. Press Play to begin again.')
  }

  function seek(next: number) {
    const element = audio.current
    if (!element || element.readyState < 1) return
    element.currentTime = next
    setPosition(next)
  }

  function ended() {
    pause()
    setPosition(audio.current?.duration || duration)
    setStatus('Fixture complete. Replay it or seek to a passage.')
  }

  return (
    <section className="recipe-demo" aria-label="Audio reactive narration">
      <p>Local synthesized narration fixture · no microphone, runtime synthesis, or AI calls</p>
      <audio
        ref={audio}
        src="/fixtures/narration.wav"
        preload="metadata"
        onLoadedMetadata={() => {
          if (audio.current && Number.isFinite(audio.current.duration))
            setDuration(audio.current.duration)
        }}
        onEnded={ended}
        onError={() =>
          reportError(
            'The local audio fixture could not load. Check /fixtures/narration.wav and retry.',
          )
        }
      />
      <Orb signal={signal} theme="radial" size={136} interactive={false} />
      <p className="recipe-status" role="status" aria-atomic="true">
        {status}
      </p>
      <div className="recipe-actions">
        <button type="button" onClick={() => void play()} disabled={playing}>
          {position >= duration ? 'Play again' : position > 0 ? 'Resume' : 'Play fixture'}
        </button>
        <button type="button" onClick={pause} disabled={!playing}>
          Pause
        </button>
        <button type="button" onClick={reset}>
          Reset track
        </button>
      </div>
      <label className="recipe-field">
        Playback position: {position.toFixed(1)} / {duration.toFixed(1)} seconds
        <input
          type="range"
          min="0"
          max={duration}
          step="0.1"
          value={Math.min(position, duration)}
          onChange={(event) => seek(Number(event.target.value))}
        />
      </label>
      <label className="recipe-field">
        Volume: {Math.round(volume * 100)}%
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(event) => {
            const next = Number(event.target.value)
            setVolume(next)
            if (audio.current) audio.current.volume = next
          }}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={failNext}
          disabled={playing}
          onChange={(event) => setFailNext(event.target.checked)}
        />{' '}
        Simulate a playback error next time
      </label>
      <article className="recipe-card" aria-label="Timed sample transcript">
        <h3>A walk through the garden</h3>
        <p>
          The local recording speaks these three passages. Highlighting follows its playback clock.
        </p>
        <ol>
          {transcript.map((segment, index) => (
            <li key={segment.start} aria-current={currentSegment === index ? 'true' : undefined}>
              <button
                type="button"
                aria-label={`Seek to passage ${index + 1}: ${segment.start} seconds`}
                onClick={() => seek(segment.start)}
              >
                {segment.start.toFixed(1)}s
              </button>{' '}
              {currentSegment === index ? <mark>{segment.text}</mark> : segment.text}
            </li>
          ))}
        </ol>
      </article>
      <p>
        The orb measures the actual audio waveform. Replace the local fixture and timestamps with
        your own narration; keep the same player lifecycle.
      </p>
    </section>
  )
}
