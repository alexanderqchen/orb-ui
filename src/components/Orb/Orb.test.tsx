import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Orb } from './Orb'
import type { OrbAdapter } from './Orb.types'

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
})
