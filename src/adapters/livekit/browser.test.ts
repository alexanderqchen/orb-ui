import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdvancedLiveKitAdapter: vi.fn((config: unknown) => config),
  createAudioAnalyser: vi.fn(),
  endpoint: vi.fn((url: string, options?: unknown) => ({ type: 'endpoint', url, options })),
  sandboxTokenServer: vi.fn((id: string, options?: unknown) => ({ type: 'sandbox', id, options })),
  Room: class Room {},
}))

vi.mock('livekit-client', () => ({
  Room: mocks.Room,
  TokenSource: {
    endpoint: mocks.endpoint,
    sandboxTokenServer: mocks.sandboxTokenServer,
  },
  createAudioAnalyser: mocks.createAudioAnalyser,
}))

vi.mock('./index', () => ({
  createLiveKitAdapter: mocks.createAdvancedLiveKitAdapter,
}))

import { createLiveKitAdapter } from './browser'

describe('managed LiveKit browser adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates the recommended token-endpoint adapter with a fresh default room', () => {
    createLiveKitAdapter({
      tokenEndpoint: '/api/livekit-token',
      tokenEndpointOptions: { headers: { Authorization: 'Bearer app-session' } },
      agentName: 'support-agent',
    })

    expect(mocks.endpoint).toHaveBeenCalledWith('/api/livekit-token', {
      headers: { Authorization: 'Bearer app-session' },
    })
    expect(mocks.createAdvancedLiveKitAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenSource: expect.objectContaining({ type: 'endpoint' }),
        RoomClass: mocks.Room,
        createAudioAnalyser: mocks.createAudioAnalyser,
      }),
    )

    const advancedConfig = mocks.createAdvancedLiveKitAdapter.mock.calls[0][0] as {
      tokenOptions: { agentName?: string; roomName: () => string }
    }
    expect(advancedConfig.tokenOptions.agentName).toBe('support-agent')
    expect(advancedConfig.tokenOptions.roomName()).toMatch(/^orb-/)
  })

  it('creates sandbox adapters and forwards optional token values', () => {
    const roomName = () => 'custom-room'
    const participantAttributes = () => ({ plan: 'test' })

    createLiveKitAdapter({
      sandboxId: 'sandbox-123',
      sandboxOptions: { baseUrl: 'https://sandbox.example.com' },
      agentName: 'test-agent',
      roomName,
      participantAttributes,
      enableMicrophone: false,
    })

    expect(mocks.sandboxTokenServer).toHaveBeenCalledWith('sandbox-123', {
      baseUrl: 'https://sandbox.example.com',
    })
    expect(mocks.createAdvancedLiveKitAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        enableMicrophone: false,
        tokenOptions: expect.objectContaining({
          agentName: 'test-agent',
          roomName,
          participantAttributes,
        }),
      }),
    )
  })
})
