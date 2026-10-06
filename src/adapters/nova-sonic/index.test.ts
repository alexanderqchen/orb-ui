import { describe, expect, it, vi } from 'vitest'
import { createNovaSonicBridge } from './index'
import type { OrbSignal } from '../types'

describe('Nova Sonic controlled session bridge', () => {
  it('fences previous sessions, resets errors and reports the current signal immediately', () => {
    const bridge = createNovaSonicBridge()
    const signals: OrbSignal[] = []
    const unsubscribe = bridge.subscribe((signal) => signals.push(signal))
    bridge.beginSession('a')
    bridge.connected('a')
    bridge.beginSession('b')
    bridge.connected('a')
    bridge.failed('a', new Error('old'))
    bridge.setPlayback('a', true, 1)
    expect(signals.at(-1)?.state).toBe('connecting')
    bridge.connected('b')
    bridge.failed('b', new Error('transport closed'))
    expect(signals.at(-1)).toMatchObject({ state: 'error', inputVolume: 0, outputVolume: 0 })
    bridge.beginSession('c')
    expect(signals.at(-1)?.error).toBeUndefined()
    bridge.endSession('c')
    expect(signals.at(-1)?.state).toBe('idle')
    unsubscribe()
    const count = signals.length
    bridge.beginSession('d')
    expect(signals).toHaveLength(count)
  })

  it('uses actual playback and drains buffered speech after completion', () => {
    const bridge = createNovaSonicBridge()
    let latest: OrbSignal = { state: 'idle' }
    bridge.subscribe((signal) => (latest = signal))
    bridge.beginSession('a')
    bridge.connected('a')
    bridge.handleEvent('a', {
      contentStart: { contentId: 'audio', type: 'AUDIO', role: 'ASSISTANT' },
    })
    bridge.handleEvent('a', { audioOutput: { contentId: 'audio', content: 'AAA=' } })
    expect(latest.state).toBe('thinking')
    bridge.setPlayback('a', true, 0.4)
    expect(latest).toMatchObject({ state: 'speaking', outputVolume: 0.4 })
    bridge.handleEvent('a', { completionEnd: { stopReason: 'END_TURN' } })
    expect(latest.state).toBe('speaking')
    bridge.setPlayback('a', false)
    expect(latest).toMatchObject({ state: 'listening', outputVolume: 0 })
  })

  it('clears playback synchronously on supported INTERRUPTED contentEnd', () => {
    const interrupt = vi.fn()
    const bridge = createNovaSonicBridge({ onInterrupt: interrupt })
    let latest: OrbSignal = { state: 'idle' }
    bridge.subscribe((signal) => (latest = signal))
    bridge.beginSession('a')
    bridge.connected('a')
    bridge.setPlayback('a', true, 0.7)
    bridge.handleEvent('a', {
      contentEnd: { contentId: 'text', type: 'TEXT', stopReason: 'INTERRUPTED' },
    })
    expect(interrupt).toHaveBeenCalledTimes(2)
    expect(latest).toMatchObject({ state: 'listening', outputVolume: 0 })
  })

  it('matches contentId and emits FINAL spoken transcripts once, excluding SPECULATIVE text', () => {
    const transcript = vi.fn()
    const bridge = createNovaSonicBridge({ onTranscript: transcript })
    bridge.beginSession('a')
    bridge.connected('a')
    bridge.handleEvent('a', {
      contentStart: {
        contentId: 'draft',
        type: 'TEXT',
        role: 'ASSISTANT',
        additionalModelFields: '{"generationStage":"SPECULATIVE"}',
      },
    })
    bridge.handleEvent('a', { textOutput: { contentId: 'draft', content: 'Maybe' } })
    bridge.handleEvent('a', { contentEnd: { contentId: 'draft' } })
    expect(transcript).not.toHaveBeenCalled()
    bridge.handleEvent('a', {
      contentStart: {
        contentId: 'spoken',
        type: 'TEXT',
        role: 'ASSISTANT',
        additionalModelFields: '{"generationStage":"FINAL"}',
      },
    })
    bridge.handleEvent('a', { textOutput: { contentId: 'spoken', content: 'Hello ' } })
    bridge.handleEvent('a', { textOutput: { contentId: 'spoken', content: 'there.' } })
    bridge.handleEvent('a', { contentEnd: { contentId: 'spoken' } })
    expect(transcript).toHaveBeenLastCalledWith({
      contentId: 'spoken',
      role: 'ASSISTANT',
      text: 'Hello there.',
      final: true,
    })
    bridge.handleEvent('a', { textOutput: { contentId: 'spoken', content: 'stale' } })
    expect(transcript).toHaveBeenCalledTimes(3)
  })

  it('meters both directions without treating microphone amplitude as turn detection', () => {
    const bridge = createNovaSonicBridge()
    let latest: OrbSignal = { state: 'idle' }
    bridge.subscribe((signal) => (latest = signal))
    bridge.beginSession('a')
    bridge.connected('a')
    bridge.setInputVolume('a', Infinity)
    expect(latest.inputVolume).toBe(0)
    bridge.setInputVolume('a', 2)
    expect(latest.inputVolume).toBe(1)
    bridge.setPlayback('a', true, -1)
    expect(latest).toMatchObject({ state: 'speaking', outputVolume: 0 })
    bridge.handleEvent('a', {
      contentStart: {
        contentId: 'user',
        type: 'TEXT',
        role: 'USER',
        additionalModelFields: 'invalid JSON',
      },
    })
    expect(latest.state).toBe('listening')
  })
})
