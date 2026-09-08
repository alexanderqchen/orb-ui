import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Orb } from './Orb'
import { OrbThemeProvider } from './OrbThemeProvider'
import { deriveOrbState, selectOrbVolume } from './signals'
import type { OrbAdapter, OrbSignal } from './Orb.types'

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

  it('renders the cloud theme as a passive visual when interaction is external', () => {
    const html = renderToStaticMarkup(
      <Orb adapter={createAdapter()} theme="cloud" interactive={false} data-testid="cloud-orb" />,
    )

    expect(html).toContain('<canvas')
    expect(html).toContain('data-testid="cloud-orb"')
    expect(html).not.toContain('<button')
  })

  it('renders a solid launch layer before the cloud surface fades in', () => {
    const html = renderToStaticMarkup(<Orb state="listening" theme="cloud" />)

    expect(html).toContain('data-cloud-launch-dot=""')
    expect(html).toContain('background:#5659dc')
  })

  it('renders the radial artwork with a dedicated phone control', () => {
    const html = renderToStaticMarkup(
      <Orb
        adapter={createAdapter()}
        theme="radial"
        id="radial-control"
        aria-label="Start radial voice assistant"
      />,
    )

    expect(html).toContain('<canvas')
    expect(html).toContain('data-radial-surface=""')
    expect(html).toContain('data-radial-control=""')
    expect(html).toContain('data-orb-ui-theme="radial"')
    expect(html).toContain('data-orb-ui-preset="balanced"')
    expect(html).toContain('id="radial-control"')
    expect(html).toContain('aria-label="Start radial voice assistant"')
    expect(html).toContain('background:#080808')
  })

  it('keeps the radial artwork passive when interaction is external', () => {
    const html = renderToStaticMarkup(
      <Orb adapter={createAdapter()} theme="radial" interactive={false} />,
    )

    expect(html).toContain('<canvas')
    expect(html).not.toContain('data-radial-control')
    expect(html).not.toContain('<button')
  })

  it('lets radial controls match the surrounding application surface', () => {
    const html = renderToStaticMarkup(
      <Orb
        adapter={createAdapter()}
        theme="radial"
        style={{ '--orb-ui-radial-control-surround': '#101010' }}
      />,
    )

    expect(html).toContain('--orb-ui-radial-control-surround:#101010')
    expect(html).toContain('var(--orb-ui-radial-control-surround)')
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

  it('applies a preset before theme-specific low-level overrides', () => {
    const html = renderToStaticMarkup(
      <Orb
        signal={{ state: 'speaking', outputVolume: 0.25 }}
        theme={{
          name: 'debug',
          preset: 'expressive',
          appearance: { colors: { speaking: '#12ab34' } },
          motion: { responseExponent: 0.5 },
        }}
      />,
    )

    expect(html).toContain('#12ab34')
    expect(html).toContain('0.50')
  })

  it('applies provider defaults and local theme overrides together', () => {
    const html = renderToStaticMarkup(
      <OrbThemeProvider
        className="brand-orb"
        size={260}
        slotProps={{ surface: { className: 'brand-surface' } }}
        theme={{
          name: 'circle',
          preset: 'calm',
          appearance: { colors: { listening: '#123456' } },
        }}
      >
        <Orb
          signal={{ state: 'speaking', outputVolume: 0.5 }}
          theme={{ name: 'circle', appearance: { colors: { speaking: '#abcdef' } } }}
        />
      </OrbThemeProvider>,
    )

    expect(html).toContain('orb-ui--circle')
    expect(html).toContain('brand-orb')
    expect(html).toContain('brand-surface')
    expect(html).toContain('width:var(--orb-ui-size, 260px)')
    expect(html).toContain('background:#abcdef')
    expect(html).toContain('data-orb-ui-preset="calm"')
  })

  it('exposes stable slots and responsive CSS variables', () => {
    const html = renderToStaticMarkup(
      <Orb
        signal={{ state: 'speaking', outputVolume: 0.5 }}
        style={{ '--orb-ui-size': 'min(70vw, 320px)' }}
        slotProps={{
          root: { className: 'voice-root' },
          bar: { className: 'voice-bar', style: { opacity: 0.8 } },
        }}
        theme="bars"
      />,
    )

    expect(html).toContain('voice-root')
    expect(html).toContain('orb-ui__bar voice-bar')
    expect(html).toContain('data-orb-ui-index="4"')
    expect(html).toContain('--orb-ui-size:min(70vw, 320px)')
    expect(html).toContain('opacity:0.8')
  })

  it('supports replaceable built-in control chrome', () => {
    const html = renderToStaticMarkup(
      <Orb
        adapter={createAdapter()}
        components={{ controlIcon: <span data-testid="custom-control-icon">Talk</span> }}
        theme="radial"
      />,
    )

    expect(html).toContain('data-testid="custom-control-icon"')
    expect(html).toContain('data-orb-ui-slot="icon"')
  })

  it('provides signal, sizing, and accessible lifecycle props to custom renderers', () => {
    const html = renderToStaticMarkup(
      <Orb
        aria-label="Toggle custom voice artwork"
        onStart={() => undefined}
        renderTheme={({ activity, controlProps, rootProps, state }) => (
          <div {...rootProps}>
            <button {...controlProps}>
              {state}:{activity.toFixed(2)}
            </button>
          </div>
        )}
        signal={{ state: 'idle', inputVolume: 0.4 }}
      />,
    )

    expect(html).toContain('data-orb-ui-theme="custom"')
    expect(html).toContain('aria-label="Toggle custom voice artwork"')
    expect(html).toContain('idle:0.00')
    expect(html).toContain('orb-ui--custom')
  })

  it('selects the volume channel for an overridden controlled state', () => {
    const html = renderToStaticMarkup(
      <Orb
        signal={{ state: 'speaking', inputVolume: 0.4, outputVolume: 0.72 }}
        state="listening"
      />,
    )

    expect(html).toContain('listening')
    expect(html).toContain('0.40')
  })

  it('renders thinking state in every theme', () => {
    expect(renderToStaticMarkup(<Orb state="thinking" theme="debug" />)).toContain('thinking')
    expect(renderToStaticMarkup(<Orb state="thinking" theme="circle" />)).toContain('<div')
    expect(renderToStaticMarkup(<Orb state="thinking" theme="bars" />)).toContain('<div')
    expect(renderToStaticMarkup(<Orb state="thinking" theme="cloud" />)).toContain('<canvas')
    expect(renderToStaticMarkup(<Orb state="thinking" theme="radial" />)).toContain('<canvas')
  })
})

describe('Orb signal helpers', () => {
  it('derives state and selects the matching directional volume', () => {
    const adapterSignal: OrbSignal = { state: 'speaking', outputVolume: 0.9 }

    expect(deriveOrbState(undefined, undefined, adapterSignal)).toBe('speaking')
    expect(deriveOrbState('listening', { state: 'speaking' }, adapterSignal)).toBe('listening')
    expect(selectOrbVolume('speaking', adapterSignal)).toBe(0.9)
    expect(selectOrbVolume('listening', { state: 'listening', inputVolume: 0.3 })).toBe(0.3)
    expect(selectOrbVolume('thinking', adapterSignal)).toBe(0)
  })
})
