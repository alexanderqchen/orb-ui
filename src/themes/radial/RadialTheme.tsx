import { useEffect, useLayoutEffect, useRef } from 'react'
import type { OrbHtmlAttributes, OrbState, OrbStyle } from '../../components/Orb/Orb.types'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

interface RadialThemeProps extends OrbHtmlAttributes {
  state: OrbState
  volume: number
  size: number
  className?: string
  style?: OrbStyle
  disabled?: boolean
  interactive?: boolean
  onClick?: () => void
}

interface RadialRenderer {
  draw(time: number, rotation: number, listenEnergy: number, speakEnergy: number): void
  destroy(): void
}

const VERTEX_SHADER = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_rotation;
uniform float u_listen;
uniform float u_speak;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = (uv - 0.5) * 2.0;
  float radius = length(p);
  float edge = 1.0 - smoothstep(0.993, 1.0, radius);

  if (edge <= 0.0) discard;

  float angle = atan(p.y, p.x);
  float warpStrength = 0.026 + u_speak * 0.105;
  float angularWarp =
    sin(angle * 3.0 - u_time * 0.54 + radius * 2.1) +
    0.48 * sin(angle * 5.0 + u_time * 0.31 - radius * 3.7) +
    0.22 * sin(angle * 8.0 - u_time * 0.19 + radius * 5.2);
  float phase =
    angle - 1.78 - u_rotation + angularWarp * warpStrength * (0.2 + radius * 0.8);

  // Two opposing dark lobes and two opposing aqua lobes form the main pinwheel.
  float lobeField = cos(phase * 2.0);
  float darkMix = smoothstep(-0.04, 0.38, lobeField);

  vec3 deepBlue = vec3(0.004, 0.105, 0.37);
  vec3 cobalt = vec3(0.015, 0.34, 0.76);
  vec3 aqua = vec3(0.24, 0.76, 0.79);
  vec3 paleAqua = vec3(0.77, 0.96, 0.95);

  float radialLight = 0.5 + 0.5 * sin(radius * 3.0 - u_time * 0.16);
  vec3 darkColor = mix(cobalt, deepBlue, 0.42 + 0.38 * radius);
  float darkRay = pow(max(lobeField, 0.0), 11.0);
  darkColor = mix(darkColor, aqua, darkRay * (0.18 + radialLight * 0.16));

  vec3 lightColor = mix(paleAqua, aqua, 0.5 + 0.2 * sin(radius * 3.4 + phase * 2.0));
  float lightRay = pow(max(-lobeField, 0.0), 5.0);
  lightColor = mix(lightColor, vec3(0.04, 0.42, 0.64), lightRay * 0.28);

  vec3 color = mix(lightColor, darkColor, darkMix);

  // Soft secondary streaks make each of the four lobes feel layered rather than flat.
  float secondaryRay = 0.5 + 0.5 * sin(phase * 6.0 + radius * 1.8 - u_time * 0.42);
  float rayStrength = (0.055 + u_speak * 0.045) * (0.25 + radius * 0.75);
  color = mix(color, vec3(0.26, 0.76, 0.8), secondaryRay * rayStrength);

  // The outer membrane keeps a circular perimeter while independent traveling waves
  // continuously reshape its inner boundary.
  float rimWave =
    0.063 * sin(angle * 3.0 + u_time * 1.34) +
    0.036 * sin(angle * 5.0 - u_time * 0.91 + 1.4) +
    0.021 * sin(angle * 7.0 + u_time * 0.63 - 0.8) +
    0.012 * sin(angle * 11.0 - u_time * 1.72 + sin(angle * 2.0 + u_time * 0.58));
  rimWave *= 1.0 + u_listen * 0.38;
  float rimInner = 0.82 + rimWave - u_listen * 0.2;
  float rim = smoothstep(rimInner - 0.02, rimInner + 0.015, radius);
  float rimStrength = rim * (0.3 + u_listen * 0.3);
  vec3 membrane = mix(
    vec3(0.47, 0.84, 0.84),
    vec3(0.76, 0.93, 0.92),
    smoothstep(0.78, 1.0, radius)
  );
  color = mix(color, membrane, clamp(rimStrength, 0.0, 0.72));

  // Only one transition direction becomes a bright seam, producing two opposing ribbons.
  float seamDirection = max(0.0, -sin(phase * 2.0));
  float seamExponent = mix(30.0, 3.2, smoothstep(0.05, 1.0, radius));
  float seam = pow(seamDirection, seamExponent) * (0.78 + radius * 0.25);
  color = mix(color, vec3(0.985, 0.995, 0.995), clamp(seam, 0.0, 0.96));

  // The drawing buffer uses premultiplied alpha. Premultiply the antialiased
  // perimeter so translucent edge pixels cannot become a bright outline.
  gl_FragColor = vec4(color * edge, edge);
}
`

const KEYFRAMES = `
@keyframes orb-radial-spinner {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  [data-radial-spinner] { animation: none !important; }
}
`

const ARTWORK_DIAMETER = 0.66
const CONTROL_RATIO = 0.2

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function damp(current: number, target: number, rate: number, deltaSeconds: number) {
  return current + (target - current) * (1 - Math.exp(-rate * deltaSeconds))
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | undefined {
  const shader = gl.createShader(type)
  if (!shader) return undefined

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return undefined
  }

  return shader
}

function createRadialRenderer(
  canvas: HTMLCanvasElement,
  diameter: number,
): RadialRenderer | undefined {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
  })
  if (!gl) return undefined

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader)
    if (fragmentShader) gl.deleteShader(fragmentShader)
    return undefined
  }

  const program = gl.createProgram()
  const buffer = gl.createBuffer()
  if (!program || !buffer) {
    if (program) gl.deleteProgram(program)
    if (buffer) gl.deleteBuffer(buffer)
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    return undefined
  }

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    gl.deleteBuffer(buffer)
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    return undefined
  }

  const positionLocation = gl.getAttribLocation(program, 'a_position')
  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
  const timeLocation = gl.getUniformLocation(program, 'u_time')
  const rotationLocation = gl.getUniformLocation(program, 'u_rotation')
  const listenLocation = gl.getUniformLocation(program, 'u_listen')
  const speakLocation = gl.getUniformLocation(program, 'u_speak')

  if (
    positionLocation < 0 ||
    !resolutionLocation ||
    !timeLocation ||
    !rotationLocation ||
    !listenLocation ||
    !speakLocation
  ) {
    gl.deleteProgram(program)
    gl.deleteBuffer(buffer)
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    return undefined
  }

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const pixelSize = Math.max(1, Math.round(diameter * pixelRatio))
  canvas.width = pixelSize
  canvas.height = pixelSize

  gl.viewport(0, 0, pixelSize, pixelSize)
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  )
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
  gl.uniform2f(resolutionLocation, pixelSize, pixelSize)

  return {
    draw(time, rotation, listenEnergy, speakEnergy) {
      gl.uniform1f(timeLocation, time)
      gl.uniform1f(rotationLocation, rotation)
      gl.uniform1f(listenLocation, listenEnergy)
      gl.uniform1f(speakLocation, speakEnergy)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    },
    destroy() {
      gl.deleteProgram(program)
      gl.deleteBuffer(buffer)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
    },
  }
}

function isActiveState(state: OrbState) {
  return state !== 'idle' && state !== 'connecting' && state !== 'error'
}

function PhoneIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 24 24"
      style={{
        display: 'block',
        width: '50%',
        height: '50%',
        transform: `rotate(${active ? 132 : -8}deg)`,
        transformOrigin: 'center',
        transition: 'transform 180ms ease',
      }}
    >
      <path
        d="M6.7 3.8 9.1 7a1.6 1.6 0 0 1-.2 2.1l-1.4 1.3a13.1 13.1 0 0 0 6.1 6.1l1.3-1.4a1.6 1.6 0 0 1 2.1-.2l3.2 2.4a1.6 1.6 0 0 1 .5 1.9l-.7 1.7c-.3.8-1.1 1.3-2 1.2C9.7 21.2 2.8 14.3 1.9 6c-.1-.9.4-1.7 1.2-2l1.7-.7a1.6 1.6 0 0 1 1.9.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function RadialTheme({
  state,
  volume,
  size,
  className,
  style,
  disabled = false,
  interactive = false,
  onClick,
  ...controlProps
}: RadialThemeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef(state)
  const volumeRef = useRef(volume)
  const reducedMotionRef = useRef(false)

  useIsomorphicLayoutEffect(() => {
    stateRef.current = state
    volumeRef.current = volume
  }, [state, volume])

  const diameter = size * ARTWORK_DIAMETER
  const controlSize = diameter * CONTROL_RATIO

  useEffect(() => {
    const id = 'orb-radial-keyframes'
    if (!document.getElementById(id)) {
      const element = document.createElement('style')
      element.id = id
      element.textContent = KEYFRAMES
      document.head.appendChild(element)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateReducedMotion = () => {
      reducedMotionRef.current = motionQuery.matches
    }
    updateReducedMotion()
    motionQuery.addEventListener('change', updateReducedMotion)

    const renderer = createRadialRenderer(canvas, diameter)
    let frame = 0
    let previousTime = performance.now()
    let motionTime = 0
    let currentMotionSpeed = 0.36
    let currentCalmTempo = 0.62
    let currentCalmAmplitude = 0.15
    let rotation = 0
    let rotationVelocity = 0
    let calmClock = 0
    let speakingClock = 0
    let speakingBlend = stateRef.current === 'speaking' ? 1 : 0
    let currentVolume = clamp(volumeRef.current)
    let listenEnergy = stateRef.current === 'listening' ? currentVolume : 0
    let speakEnergy = stateRef.current === 'speaking' ? currentVolume : 0

    const render = (now: number) => {
      const deltaSeconds = Math.min((now - previousTime) / 1000, 0.05)
      previousTime = now

      const nextState = stateRef.current
      const reducedMotion = reducedMotionRef.current
      const rawVolume = clamp(volumeRef.current)
      const volumeRate = rawVolume > currentVolume ? 15 : 7
      currentVolume = reducedMotion ? 0 : damp(currentVolume, rawVolume, volumeRate, deltaSeconds)

      const listenTarget = nextState === 'listening' ? currentVolume : 0
      const speakTarget = nextState === 'speaking' ? currentVolume : 0
      listenEnergy = reducedMotion
        ? 0
        : damp(listenEnergy, listenTarget, listenTarget > listenEnergy ? 17 : 7, deltaSeconds)
      speakEnergy = reducedMotion
        ? 0
        : damp(speakEnergy, speakTarget, speakTarget > speakEnergy ? 12 : 5, deltaSeconds)

      let motionSpeed = 0.36
      let calmTempo = 0.62
      let calmAmplitude = 0.15
      if (nextState === 'connecting') {
        motionSpeed = 0.42
        calmTempo = 0.68
        calmAmplitude = 0.13
      } else if (nextState === 'listening') {
        motionSpeed = 0.54 + listenEnergy * 0.26
        calmTempo = 0.78 + listenEnergy * 0.18
        calmAmplitude = 0.18 + listenEnergy * 0.04
      } else if (nextState === 'thinking') {
        motionSpeed = 0.46
        calmTempo = 0.72
        calmAmplitude = 0.16
      } else if (nextState === 'speaking') {
        motionSpeed = 1.05 + speakEnergy * 1.15
      }

      if (!reducedMotion) {
        currentMotionSpeed = damp(currentMotionSpeed, motionSpeed, 3.6, deltaSeconds)
        currentCalmTempo = damp(currentCalmTempo, calmTempo, 3.6, deltaSeconds)
        currentCalmAmplitude = damp(currentCalmAmplitude, calmAmplitude, 3.6, deltaSeconds)
        speakingBlend = damp(
          speakingBlend,
          nextState === 'speaking' ? 1 : 0,
          nextState === 'speaking' ? 3.8 : 3,
          deltaSeconds,
        )

        motionTime += deltaSeconds * currentMotionSpeed
        calmClock += deltaSeconds * currentCalmTempo

        const irregularTempo =
          1.2 +
          speakEnergy * 1.35 +
          Math.sin(motionTime * 1.73) * 0.34 +
          Math.sin(motionTime * 0.61 + 0.8) * 0.18
        speakingClock += deltaSeconds * Math.max(0.65, irregularTempo)

        const calmTarget =
          Math.sin(calmClock) * currentCalmAmplitude + Math.sin(calmClock * 0.47 + 1.1) * 0.032
        const primarySwing = Math.sin(speakingClock * 1.08)
        const secondarySwing = Math.sin(speakingClock * 2.47 + 0.9)
        const slowDrift = Math.sin(speakingClock * 0.43 - 0.5)
        const swingAmplitude = 0.13 + speakEnergy * 0.17
        const speakingTarget =
          primarySwing * swingAmplitude +
          secondarySwing * (0.035 + speakEnergy * 0.035) +
          slowDrift * 0.055
        const rotationTarget = calmTarget + (speakingTarget - calmTarget) * speakingBlend

        // Keep one position and velocity across states so mode changes alter the
        // trajectory without replacing it or snapping to another oscillator.
        const responsiveness = 4.2 + speakingBlend * 3
        const stiffness = responsiveness * responsiveness
        const drag = 2 * responsiveness
        rotationVelocity +=
          ((rotationTarget - rotation) * stiffness - rotationVelocity * drag) * deltaSeconds
        rotation += rotationVelocity * deltaSeconds
      }

      renderer?.draw(motionTime, rotation, listenEnergy, speakEnergy)
      frame = requestAnimationFrame(render)
    }

    frame = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(frame)
      motionQuery.removeEventListener('change', updateReducedMotion)
      renderer?.destroy()
    }
  }, [diameter])

  const active = isActiveState(state)
  const connecting = state === 'connecting'
  const stackHeight = diameter + (interactive ? controlSize * 0.5 : 0)
  const rootStyle: OrbStyle = {
    '--orb-ui-radial-control-surround': '#fff',
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...style,
  }

  const artwork = (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-radial-surface=""
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        display: 'block',
        width: diameter,
        height: diameter,
        borderRadius: '50%',
        background:
          'conic-gradient(from 12deg, #06358d 0deg, #0b65b5 72deg, #c7f1ef 92deg, #45c2c8 172deg, #06358d 196deg, #0b65b5 254deg, #c7f1ef 278deg, #45c2c8 360deg)',
      }}
    />
  )

  const content = (
    <span
      style={{
        position: 'relative',
        display: 'block',
        width: diameter,
        height: stackHeight,
        lineHeight: 0,
      }}
    >
      {artwork}
      {interactive ? (
        <button
          {...controlProps}
          type="button"
          data-radial-control=""
          disabled={disabled}
          onClick={disabled ? undefined : onClick}
          style={{
            appearance: 'none',
            WebkitAppearance: 'none',
            position: 'absolute',
            left: '50%',
            top: diameter - controlSize * 0.52,
            width: controlSize,
            height: controlSize,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
            padding: 0,
            margin: 0,
            border: 0,
            borderRadius: '50%',
            background: connecting ? '#9da1aa' : active ? '#ef4146' : '#080808',
            color: '#fff',
            boxShadow: `0 0 0 ${Math.max(3, controlSize * 0.085)}px var(--orb-ui-radial-control-surround), 0 2px 5px rgba(0, 0, 0, 0.18)`,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.52 : 1,
            transform: 'translateX(-50%)',
            transition: 'background 160ms ease, opacity 160ms ease, transform 160ms ease',
            font: 'inherit',
          }}
        >
          {connecting ? (
            <span
              aria-hidden="true"
              data-radial-spinner=""
              style={{
                width: '42%',
                height: '42%',
                boxSizing: 'border-box',
                border: `${Math.max(1.5, controlSize * 0.055)}px solid rgba(255, 255, 255, 0.38)`,
                borderTopColor: '#fff',
                borderRightColor: '#fff',
                borderRadius: '50%',
                animation: 'orb-radial-spinner 760ms linear infinite',
              }}
            />
          ) : (
            <PhoneIcon active={active} />
          )}
        </button>
      ) : null}
    </span>
  )

  if (interactive) {
    return (
      <div className={className} style={rootStyle}>
        {content}
      </div>
    )
  }

  return (
    <div {...controlProps} className={className} style={rootStyle}>
      {content}
    </div>
  )
}
