---
title: 'Vapi Alternatives: Managed Platforms and Open-Source Options'
description: Compare Retell, ElevenLabs, LiveKit, Pipecat, and direct realtime APIs as Vapi alternatives, with migration tradeoffs for web and phone agents.
date: '2026-09-28'
category: Comparison
---

**Shortlist Retell for managed phone-agent workflows, ElevenLabs for a managed conversational agent with its voice stack, LiveKit for room-based realtime applications, and Pipecat for a Python pipeline you control.** A direct realtime model API is another option when you want to build the application orchestration yourself.

These are alternatives at different layers. Moving from Vapi to another managed platform changes configuration and integrations. Moving to an open-source framework also transfers deployment and operational responsibilities to your team. Start with the reason you want to leave before comparing feature lists.

Sources checked **September 28, 2026**. This guide is written by the maintainers of orb-ui, a React voice UI library with adapters for several of these providers. Recommendations are based on official documentation, not a controlled latency benchmark or a claim that one platform is cheapest.

## Which Vapi alternative fits your reason for switching?

| Your reason                                                        | First option to evaluate | What to validate before migrating                                               |
| ------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------- |
| You want explicit conversation flows and managed phone operations  | Retell AI                | Transfers, phone-number migration, tool behavior, and custom-LLM limitations    |
| You want ElevenLabs voices and agent configuration in one service  | ElevenLabs Agents        | Your languages, interruption behavior, knowledge retrieval, and telephony route |
| You need browser/mobile media sessions and control over agent code | LiveKit Agents           | Room/token/dispatch setup, agent hosting, and provider integrations             |
| You want to customize the speech pipeline in Python                | Pipecat                  | Transport, processor behavior, deployment, and monitoring ownership             |
| You want to build directly around a realtime speech model          | OpenAI Realtime API      | Session lifecycle, tools, transcripts, and phone operations you must implement  |

For a detailed two-platform comparison, read [Vapi vs Retell](/blog/vapi-vs-retell). For a broader architecture decision, use the [voice AI platform guide](/blog/voice-ai-platforms).

## Retell AI: a managed alternative for phone workflows

[Retell](https://docs.retellai.com/general/introduction) offers single-prompt agents and conversation flows with nodes and transitions. It also documents phone transfers, imported numbers, custom telephony, and browser calling. That makes it a practical candidate when you want to keep a managed operating model while changing how calls are configured.

A useful migration pilot is one existing inbound call flow: identify the caller, collect a request, call your backend, and transfer to a person when necessary. Recreate the successful path and the failure paths before moving a phone number. In particular, test a failed tool request, an unavailable transfer destination, and a caller who changes their answer halfway through.

**The main migration trap is assuming custom LLM integrations are interchangeable.** Vapi documents an OpenAI-compatible endpoint; Retell documents a custom LLM WebSocket interface. Retell also documents limitations for custom LLM agents, including built-in simulation and batch testing. Budget for adapting your backend and replacing any testing features your chosen configuration does not support.

Choose Retell for its workflow and operating fit, then compare your full bill. A lower headline price is not enough evidence to migrate.

## ElevenLabs: a managed agent around its voice stack

[ElevenLabs Agents](https://elevenlabs.io/docs/eleven-agents/overview) combines speech recognition, a selected or custom language model, text-to-speech, and turn-taking. It includes agent configuration, knowledge, tools, workflows, web SDKs, and phone integrations.

This is worth evaluating if you already use ElevenLabs voices through Vapi and want to compare a more integrated setup. Start by porting one prompt, one backend tool, and a small set of representative knowledge documents. Compare whether the agent completes the same tasks; using the same voice does not guarantee equivalent turn-taking, retrieval, or tool execution.

For browser applications, use a server-issued conversation token for private WebRTC agents or a signed URL for WebSocket sessions. Our [ElevenLabs React tutorial](/blog/elevenlabs-conversational-ai-react) walks through that boundary and a complete client.

Do not assume that a voice subscription, a conversational-agent plan, and third-party model usage have identical billing. Confirm the selected agent configuration and deployment terms. ElevenLabs also documents enterprise private deployment options; that is a procurement discussion, separate from running an open-source framework yourself.

## LiveKit Agents: application and media control

[LiveKit Agents](https://docs.livekit.io/agents/start/voice-ai/) is an open-source framework with Python and Node.js options. Agents and users participate in realtime rooms, with browser and native client SDKs, agent dispatch, and SIP telephony integration. You can use LiveKit Cloud or assemble a self-hosted deployment.

Evaluate it when your application needs more control over the session: custom agent logic, multiple participants, or voice alongside other realtime media. The change from Vapi is architectural. Your backend issues participant credentials, your application joins a room, and an agent process handles the conversation.

Self-hosting the media server is only part of that deployment. You also need agent workers, scaling, monitoring, network configuration, and access to the models your agent uses. Cloud-specific capabilities may need replacements in a self-hosted setup; the [official quickstart](https://docs.livekit.io/agents/start/voice-ai/) calls out differences explicitly.

For a pilot, build a browser session first, then add telephony. Verify that dispatch starts exactly one intended agent, credentials cannot join arbitrary rooms, and the worker exits when a session ends. Our [LiveKit adapter reference](/docs/adapters/livekit) covers the optional React orb integration.

## Pipecat: control over a Python speech pipeline

[Pipecat](https://docs.pipecat.ai/overview/pipecat) is an open-source Python framework that connects transports and processors into a realtime pipeline. It can compose speech recognition, an LLM, and text-to-speech, or integrate realtime model services. Browser clients connect through supported transports and client SDKs.

Evaluate it when you need to change how frames move through the conversation: custom audio processing, provider selection, context handling, or specialized tool behavior. It is a framework for building the agent application, so there is more code to own than an assistant configuration in a managed platform.

Open source does not require self-hosting everything. [Pipecat Cloud](https://docs.pipecat.ai/overview/cloud) provides managed agent hosting; self-hosting and enterprise deployment options are separate choices. Model inference, media transport, phone service, and operations still have costs whichever hosting model you choose.

Port the smallest complete workflow first. Test interruption while speech is playing, tool responses that arrive late, and cleanup after the browser disconnects. If you use orb-ui, its [Pipecat adapter](/docs/adapters/pipecat) consumes client events while your app retains transport and backend ownership.

## Direct realtime APIs: fewer layers, more application work

A direct API such as OpenAI Realtime can be a good candidate for a focused browser voice feature. Your server creates a short-lived client credential; the browser establishes a realtime session; your application handles UI, tools, and lifecycle. See our [React/WebRTC tutorial](/blog/openai-realtime-api-tutorial) for a complete starting point.

This is not a drop-in replacement for a managed phone-agent platform. You need to account for the operating features your Vapi application actually uses: routing, transfers, retries, call review, evaluations, and billing controls. Some capabilities exist through provider APIs or other infrastructure, but assembling them is part of your implementation.

Choose this route when that control is useful to the application and your team can maintain it. Removing an orchestration fee does not establish a lower total cost.

## How to compare migration cost

Use the same workload for every candidate. Record your language, approximate call duration, model, voice, tool usage, transfer behavior, peak concurrency, and whether calls use the browser or phone network.

Calculate:

```text
Monthly operating cost =
  platform and subscription charges
  + speech/model usage
  + media and telephony charges
  + hosting, concurrency, and add-ons
  + engineering and ongoing operations
```

Avoid adding bundled components twice. Use each provider's actual usage report from your pilot to map the formula to its billing model. Compare **cost per completed task** alongside cost per minute: a cheap conversation that repeats questions or fails to finish can cost more in practice.

Migration effort is separate from steady-state cost. Include rewriting tool schemas, authenticating webhooks, changing transcript consumers, porting prompts and knowledge, moving phone numbers, and rebuilding dashboards. Keep your current provider available until the replacement can handle the same failure cases.

## A migration pilot you can finish this week

1. **Pick two candidates and one workflow.** Choose candidates that solve the specific problem with your current setup.
2. **Create a fixed conversation set.** Include interruptions, silence, accented speech, a failed tool, and a handoff. Use the same inputs and expected outcomes for each candidate.
3. **Measure the full session.** Record completed tasks, first audible response, turn gaps, tool failures, disconnects, and billed usage. Define your timing boundaries so the results are comparable.
4. **Test the production constraints.** Include the expected concurrent calls, authentication, number/carrier configuration, and data retention requirements.
5. **Migrate a limited slice.** Keep rollback possible and compare real results before moving all traffic.

There is no universal best Vapi alternative. For managed operations, start with Retell or ElevenLabs. For ownership of agent code and deployment, evaluate LiveKit or Pipecat. For a narrow browser feature, include a direct realtime API in the pilot.

## Sources

- [Vapi documentation](https://docs.vapi.ai/introduction), [custom LLMs](https://docs.vapi.ai/customization/custom-llm/using-your-server), and [pricing](https://vapi.ai/pricing)
- [Retell conversation flows](https://docs.retellai.com/build/conversation-flow), [custom LLMs](https://docs.retellai.com/integrate-llm/overview), and [pricing](https://www.retellai.com/pricing)
- [ElevenLabs Agents overview](https://elevenlabs.io/docs/eleven-agents/overview), [authentication](https://elevenlabs.io/docs/eleven-agents/customization/authentication), and [private deployment](https://elevenlabs.io/docs/overview/capabilities/private-deployment)
- [LiveKit voice AI quickstart](https://docs.livekit.io/agents/start/voice-ai/) and [self-hosting](https://docs.livekit.io/transport/self-hosting/)
- [Pipecat framework](https://docs.pipecat.ai/overview/pipecat), [Cloud](https://docs.pipecat.ai/overview/cloud), and [deployment](https://docs.pipecat.ai/pipecat/deployment/overview)
- [OpenAI Realtime API](https://developers.openai.com/api/docs/guides/realtime)
