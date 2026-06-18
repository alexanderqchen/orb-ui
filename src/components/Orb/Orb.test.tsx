import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Orb } from './Orb'
import { createOrbSignalListener, deriveOrbState, deriveOrbVolume } from './signals'
import type { LegacyOrbAdapter, OrbAdapter, OrbSignal } from './Orb.types'

function createAdapter(): OrbAdapter {
  return {
    subscribe: () => () => {},
    start: vi.fn(),
    stop: vi.fn(),
  }
}

describe('Orb accessibility', () => {
  it('renders clickable circle theme as a labelled button with forwarded attributes', () => {
    const html = renderToStaticMarkup(
      <Orb
        adapter={createAdapter()}
        theme="circle"
        id="voice-orb"
        aria-label="Start voice assistant"
        disabled
      />,
    )

    expect(html).toContain('<button')
    expect(html).toContain('type="button"')
    expect(html).toContain('id="voice-orb"')
    expect(html).toContain('aria-label="Start voice assistant"')
    expect(html).toContain('disabled')
    expect(html).not.toContain('<div')
  })

  it('renders clickable bars theme as a labelled button with forwarded attributes', () => {
    const html = renderToStaticMarkup(
      <Orb
        adapter={createAdapter()}
        theme="bars"
        id="bars-orb"
        aria-label="Start voice assistant"
      />,
    )

    expect(html).toContain('<button')
    expect(html).toContain('type="button"')
    expect(html).toContain('id="bars-orb"')
    expect(html).toContain('aria-label="Start voice assistant"')
    expect(html).not.toContain('<div')
  })

  it('preserves consumer style overrides on clickable themes', () => {
    const html = renderToStaticMarkup(
      <Orb
        adapter={createAdapter()}
        theme="circle"
        aria-label="Start voice assistant"
        style={{ border: '1px solid red', padding: 8 }}
      />,
    )

    expect(html).toContain('border:1px solid red')
    expect(html).toContain('padding:8px')
  })

  it('does not forward internal interactive props to the debug DOM node', () => {
    const html = renderToStaticMarkup(<Orb adapter={createAdapter()} theme="debug" />)

    expect(html).not.toContain('interactive=')
  })

  it('renders controlled signal state and output volume', () => {
    const html = renderToStaticMarkup(
      <Orb signal={{ state: 'speaking', outputVolume: 0.72 }} theme="debug" />,
    )

    expect(html).toContain('speaking')
    expect(html).toContain('0.72')
  })

  it('lets scalar controlled props override signal values', () => {
    const html = renderToStaticMarkup(
      <Orb signal={{ state: 'speaking', outputVolume: 0.72 }} state="listening" volume={0.4} />,
    )

    expect(html).toContain('listening')
    expect(html).toContain('0.40')
  })

  it('renders thinking state in every theme', () => {
    expect(renderToStaticMarkup(<Orb state="thinking" theme="debug" />)).toContain('thinking')
    expect(renderToStaticMarkup(<Orb state="thinking" theme="circle" />)).toContain('<div')
    expect(renderToStaticMarkup(<Orb state="thinking" theme="bars" />)).toContain('<div')
  })
})

describe('Orb signal helpers', () => {
  it('derives state and volume with controlled prop precedence', () => {
    const adapterSignal: OrbSignal = { state: 'speaking', outputVolume: 0.9 }

    expect(deriveOrbState(undefined, undefined, adapterSignal)).toBe('speaking')
    expect(deriveOrbState('listening', { state: 'speaking' }, adapterSignal)).toBe('listening')
    expect(deriveOrbVolume(undefined, 'speaking', adapterSignal)).toBe(0.9)
    expect(deriveOrbVolume(undefined, 'listening', { state: 'listening', inputVolume: 0.3 })).toBe(
      0.3,
    )
    expect(deriveOrbVolume(0.4, 'speaking', adapterSignal)).toBe(0.4)
  })

  it('bridges legacy callback-object adapters into signals with one warning', () => {
    const onSignal = vi.fn()
    const warn = vi.fn()
    let warned = false
    const warnOnce = () => {
      if (warned) return
      warned = true
      warn()
    }
    const listener = createOrbSignalListener(onSignal, warnOnce)

    listener({ state: 'speaking', outputVolume: 0.6 })
    listener.onStateChange('listening')
    listener.onVolumeChange(0.35)

    expect(onSignal).toHaveBeenNthCalledWith(1, { state: 'speaking', outputVolume: 0.6 })
    expect(onSignal).toHaveBeenNthCalledWith(2, {
      state: 'listening',
      outputVolume: 0.6,
    })
    expect(onSignal).toHaveBeenNthCalledWith(3, {
      state: 'listening',
      outputVolume: 0.6,
      volume: 0.35,
    })
    expect(warn).toHaveBeenCalledOnce()
  })

  it('accepts deprecated legacy adapters in Orb props', () => {
    const legacyAdapter: LegacyOrbAdapter = {
      subscribe: () => () => undefined,
    }

    const html = renderToStaticMarkup(<Orb adapter={legacyAdapter} theme="debug" />)

    expect(html).toContain('ORB DEBUG')
  })
})
