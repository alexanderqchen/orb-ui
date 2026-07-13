import { useEffect, useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { OrbHtmlAttributes, OrbState } from '../../components/Orb/Orb.types'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

interface CloudThemeProps extends OrbHtmlAttributes {
  state: OrbState
  volume: number
  size: number
  className?: string
  style?: CSSProperties
  disabled?: boolean
  interactive?: boolean
  onClick?: () => void
}

interface CloudRenderer {
  draw(time: number, activity: number): void
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
uniform float u_activity;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.52;
  mat2 rotation = mat2(0.80, 0.60, -0.60, 0.80);

  for (int octave = 0; octave < 5; octave++) {
    value += amplitude * noise(p);
    p = rotation * p * 1.92 + vec2(9.7, 4.3);
    amplitude *= 0.5;
  }

  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 centered = uv - 0.5;
  float radius = length(centered);
  float edge = 1.0 - smoothstep(0.488, 0.5, radius);

  if (edge <= 0.0) discard;

  vec2 p = centered * 2.0;
  float t = u_time;

  vec2 warp = vec2(
    fbm(p * 1.02 + vec2(t * 0.34, -t * 0.24)),
    fbm(p * 1.08 + vec2(-t * 0.27, t * 0.32) + vec2(6.7, 2.9))
  );
  vec2 curl = vec2(
    sin(p.y * 2.4 + t * 0.68 + warp.y * 3.2),
    cos(p.x * 2.1 - t * 0.61 + warp.x * 3.0)
  );
  vec2 warped =
    p +
    (warp - 0.5) * (1.18 + u_activity * 0.38) +
    curl * (0.035 + u_activity * 0.07);
  float broad = fbm(warped * 0.92 + vec2(t * 0.14, -t * 0.18));
  float folded = fbm(warped * 1.66 + vec2(-t * 0.23, t * 0.19) + 5.2);
  float field = mix(broad, folded, 0.3 + u_activity * 0.14);

  float horizon =
    0.46 +
    0.08 * sin((uv.x + warp.x * 0.2) * 5.4 + t * 0.42) +
    0.16 * (broad - 0.5);
  float upper = smoothstep(horizon - 0.12, horizon + 0.08, uv.y);
  float band = exp(-pow((uv.y - horizon) * (5.2 + u_activity * 0.8), 2.0));
  float cloud = smoothstep(0.24, 0.79, field);

  vec3 deepPeriwinkle = vec3(0.36, 0.39, 0.985);
  vec3 upperPeriwinkle = vec3(0.48, 0.56, 0.985);
  vec3 lowerLavender = vec3(0.72, 0.78, 0.975);
  vec3 milk = vec3(0.89, 0.92, 0.995);

  vec3 color = mix(lowerLavender, upperPeriwinkle, upper);
  float upperDepth = upper * (0.14 + smoothstep(0.42, 0.78, folded) * 0.5);
  color = mix(color, deepPeriwinkle, upperDepth);

  float milkAmount = clamp(band * (0.42 + cloud * 0.62), 0.0, 0.88);
  color = mix(color, milk, milkAmount);

  float lowerMist = (1.0 - upper) * smoothstep(0.58, 0.9, broad) * 0.18;
  color = mix(color, milk, lowerMist);

  float grain = (noise(gl_FragCoord.xy * 0.64) - 0.5) / 255.0;
  color += grain;

  gl_FragColor = vec4(color, edge);
}
`

const NEUTRAL_DIAMETER = 0.55
const LISTEN_SHRINK = 0.204
const SPEAK_GROW = 0.2145
const DOT_SCALE = 0.063
const LAUNCH_DOT_COLOR = '#5659dc'
const ENTRANCE_OVERSHOOT = 1.178
const DOT_HOLD_MS = 180
const GROW_MS = 300
const SETTLE_MS = 1350
const SURFACE_FADE_START_MS = DOT_HOLD_MS + GROW_MS * 0.22
const SURFACE_FADE_END_MS = DOT_HOLD_MS + GROW_MS * 0.8
const DOT_FADE_START_MS = DOT_HOLD_MS + GROW_MS * 0.58
const DOT_FADE_END_MS = DOT_HOLD_MS + GROW_MS

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function damp(current: number, target: number, rate: number, deltaSeconds: number) {
  return current + (target - current) * (1 - Math.exp(-rate * deltaSeconds))
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3)
}

function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress
}

function smoothstepRange(value: number, start: number, end: number) {
  const progress = clamp((value - start) / (end - start))
  return progress * progress * (3 - 2 * progress)
}

function isVisibleState(state: OrbState) {
  return state === 'listening' || state === 'speaking' || state === 'thinking'
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

function createCloudRenderer(
  canvas: HTMLCanvasElement,
  diameter: number,
): CloudRenderer | undefined {
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
  const activityLocation = gl.getUniformLocation(program, 'u_activity')
  if (positionLocation < 0 || !resolutionLocation || !timeLocation || !activityLocation) {
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
    draw(time, activity) {
      gl.uniform1f(timeLocation, time)
      gl.uniform1f(activityLocation, activity)
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

function entranceScale(elapsed: number) {
  if (elapsed <= DOT_HOLD_MS) return DOT_SCALE

  if (elapsed <= DOT_HOLD_MS + GROW_MS) {
    const progress = easeOutCubic((elapsed - DOT_HOLD_MS) / GROW_MS)
    return mix(DOT_SCALE, ENTRANCE_OVERSHOOT, progress)
  }

  const settleElapsed = elapsed - DOT_HOLD_MS - GROW_MS
  if (settleElapsed >= SETTLE_MS) return 1

  const progress = clamp(settleElapsed / SETTLE_MS)
  return 1 + (ENTRANCE_OVERSHOOT - 1) * Math.pow(1 - progress, 2)
}

export function CloudTheme({
  state,
  volume,
  size,
  className,
  style,
  disabled = false,
  interactive = false,
  onClick,
  ...controlProps
}: CloudThemeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const launchDotRef = useRef<HTMLSpanElement>(null)
  const spinnerRef = useRef<HTMLSpanElement>(null)
  const stateRef = useRef(state)
  const volumeRef = useRef(volume)
  const interactiveRef = useRef(interactive)
  const reducedMotionRef = useRef(false)

  useIsomorphicLayoutEffect(() => {
    stateRef.current = state
    volumeRef.current = volume
    interactiveRef.current = interactive
  }, [interactive, state, volume])

  const diameter = size * NEUTRAL_DIAMETER

  useEffect(() => {
    const canvas = canvasRef.current
    const launchDot = launchDotRef.current
    const spinner = spinnerRef.current
    if (!canvas || !launchDot || !spinner) return

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateReducedMotion = () => {
      reducedMotionRef.current = motionQuery.matches
    }
    updateReducedMotion()
    motionQuery.addEventListener('change', updateReducedMotion)

    const renderer = createCloudRenderer(canvas, diameter)
    if (!renderer) {
      canvas.style.background =
        'linear-gradient(180deg, #626afb 2%, #8f9dfb 32%, #dde6fd 52%, #c9d3fb 84%)'
    }

    let frame = 0
    let previousTime = performance.now()
    let previousState = stateRef.current
    let entranceStarted = isVisibleState(previousState) ? previousTime : undefined
    let currentVolume = clamp(volumeRef.current)
    let currentAudioScale = 1
    let currentOpacity = isVisibleState(previousState) ? 1 : 0
    let currentExitScale = 1
    let currentSpinnerOpacity = previousState === 'connecting' ? 1 : 0
    let flowTime = 0

    const render = (now: number) => {
      const deltaSeconds = Math.min((now - previousTime) / 1000, 0.05)
      previousTime = now

      const nextState = stateRef.current
      const reducedMotion = reducedMotionRef.current

      if (nextState !== previousState) {
        if (isVisibleState(nextState) && !isVisibleState(previousState)) entranceStarted = now
        if (nextState === 'idle' || nextState === 'error') entranceStarted = undefined
        previousState = nextState
      }

      const rawVolume = clamp(volumeRef.current)
      const volumeRate = rawVolume > currentVolume ? 11 : 6
      currentVolume = reducedMotion ? 0 : damp(currentVolume, rawVolume, volumeRate, deltaSeconds)

      let audioScaleTarget = 1
      if (nextState === 'listening') audioScaleTarget = 1 - currentVolume * LISTEN_SHRINK
      if (nextState === 'speaking') audioScaleTarget = 1 + currentVolume * SPEAK_GROW

      const scaleRate = Math.abs(audioScaleTarget - 1) > Math.abs(currentAudioScale - 1) ? 12 : 6
      currentAudioScale = reducedMotion
        ? 1
        : damp(currentAudioScale, audioScaleTarget, scaleRate, deltaSeconds)

      const visible = isVisibleState(nextState)
      const idleDot = nextState === 'idle' && interactiveRef.current
      const canvasOpacityTarget = visible || idleDot ? 1 : 0
      currentOpacity = reducedMotion
        ? canvasOpacityTarget
        : damp(currentOpacity, canvasOpacityTarget, 14, deltaSeconds)

      const exitScaleTarget = visible || idleDot ? 1 : 0.92
      currentExitScale = reducedMotion
        ? exitScaleTarget
        : damp(currentExitScale, exitScaleTarget, 12, deltaSeconds)

      let scale = currentAudioScale * currentExitScale
      if (idleDot) scale = DOT_SCALE

      let surfaceMix = idleDot ? 0 : 1
      let launchDotOpacity = idleDot ? currentOpacity : 0

      if (visible && entranceStarted !== undefined && !reducedMotion) {
        const elapsed = now - entranceStarted
        const entrance = entranceScale(elapsed)
        const audioInfluence = clamp((elapsed - DOT_HOLD_MS - GROW_MS) / SETTLE_MS)
        scale = entrance * mix(1, currentAudioScale, audioInfluence)
        surfaceMix = smoothstepRange(elapsed, SURFACE_FADE_START_MS, SURFACE_FADE_END_MS)
        launchDotOpacity =
          currentOpacity * (1 - smoothstepRange(elapsed, DOT_FADE_START_MS, DOT_FADE_END_MS))
        if (elapsed >= DOT_HOLD_MS + GROW_MS + SETTLE_MS) entranceStarted = undefined
      }

      const spinnerTarget = nextState === 'connecting' ? 1 : 0
      currentSpinnerOpacity = reducedMotion
        ? spinnerTarget
        : damp(currentSpinnerOpacity, spinnerTarget, 18, deltaSeconds)

      canvas.style.opacity = String(currentOpacity * surfaceMix)
      canvas.style.transform = `scale(${scale})`
      launchDot.style.opacity = String(launchDotOpacity)
      launchDot.style.transform = `scale(${scale})`
      spinner.style.opacity = String(currentSpinnerOpacity)
      spinner.style.transform = `rotate(${reducedMotion ? 45 : now * 0.34}deg)`

      let speed = 0.24
      let activity = 0.1
      if (nextState === 'listening') {
        speed = 0.72 + currentVolume * 0.78
        activity = 0.28 + currentVolume * 0.32
      } else if (nextState === 'speaking') {
        speed = 1.65 + currentVolume * 1.55
        activity = 0.66 + currentVolume * 0.34
      }

      if (!reducedMotion) flowTime += deltaSeconds * speed
      renderer?.draw(flowTime, activity)

      frame = requestAnimationFrame(render)
    }

    frame = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(frame)
      motionQuery.removeEventListener('change', updateReducedMotion)
      renderer?.destroy()
    }
  }, [diameter])

  const rootStyle: CSSProperties = {
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...style,
  }

  const content = (
    <span
      style={{
        position: 'relative',
        display: 'block',
        width: diameter,
        height: diameter,
        borderRadius: '50%',
        lineHeight: 0,
        cursor: interactive ? (disabled ? 'not-allowed' : 'pointer') : 'default',
      }}
    >
      <span
        ref={launchDotRef}
        data-cloud-launch-dot=""
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'block',
          borderRadius: '50%',
          background: LAUNCH_DOT_COLOR,
          opacity: 0,
          transform: `scale(${DOT_SCALE})`,
          transformOrigin: 'center',
          willChange: 'opacity, transform',
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'block',
          width: diameter,
          height: diameter,
          borderRadius: '50%',
          opacity: 0,
          transform: `scale(${DOT_SCALE})`,
          transformOrigin: 'center',
          willChange: 'opacity, transform',
        }}
      />
      <span
        ref={spinnerRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: diameter * 0.105,
          height: diameter * 0.105,
          boxSizing: 'border-box',
          border: `${Math.max(1.5, diameter * 0.012)}px solid rgba(113, 120, 245, 0.24)`,
          borderTopColor: '#777ff6',
          borderRightColor: '#777ff6',
          borderRadius: '50%',
          opacity: 0,
          transform: 'rotate(0deg)',
          transformOrigin: 'center',
          marginLeft: diameter * -0.0525,
          marginTop: diameter * -0.0525,
          willChange: 'opacity, transform',
        }}
      />
    </span>
  )

  if (interactive) {
    return (
      <button
        {...controlProps}
        type="button"
        className={className}
        disabled={disabled}
        onClick={disabled ? undefined : onClick}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          border: 0,
          padding: 0,
          margin: 0,
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...rootStyle,
        }}
      >
        {content}
      </button>
    )
  }

  return (
    <div {...controlProps} className={className} style={rootStyle}>
      {content}
    </div>
  )
}
