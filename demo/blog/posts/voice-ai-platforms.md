---
title: 'Voice AI Platforms Compared: Which Stack Should You Choose?'
description: Choose a voice AI stack by comparing managed platforms, open-source agent frameworks, and direct realtime APIs for phone, browser, and mobile applications.
date: '2026-09-28'
category: Guide
---

**Choose a voice AI platform by deciding which parts of a conversation your team wants to operate.** Managed platforms package agent configuration and call operations. Frameworks give you agent code and deployment control. Direct realtime APIs give you a model session that your application turns into a product.

For a phone workflow with transfers and call review, start by evaluating managed platforms. For a custom browser or mobile experience, include frameworks and direct APIs. All three approaches can support serious applications; they put the work in different places.

Sources checked **September 28, 2026**. This is a documentation-based architecture guide from the maintainers of orb-ui, a React voice UI library. It is not a measured ranking of latency, voice quality, or total cost.

## The three kinds of voice AI stack

| Approach                                             | Examples                        | What you configure or build                                                     | What your team still owns                                                    |
| ---------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Managed agent platform                               | Vapi, Retell, ElevenLabs Agents | Agents, prompts, tools, knowledge, workflows, and integrations                  | Business logic, permissions, evaluation, application UI, and rollout         |
| Agent framework with cloud or self-hosted deployment | LiveKit Agents, Pipecat         | Agent code, model/provider integrations, sessions, and deployment configuration | Agent behavior and the operations not covered by your chosen hosting service |
| Direct realtime model API                            | OpenAI Realtime                 | Model sessions, media connections, events, and tool execution                   | Application orchestration, evaluation, and integrations around the session   |

These categories can overlap. LiveKit Cloud and Pipecat Cloud offer managed infrastructure for framework-based agents. A managed agent platform can call your custom backend. A framework can connect to a realtime model instead of assembling separate speech-to-text, LLM, and text-to-speech services.

The useful distinction is **who runs each part of your application**, not whether a vendor uses the word “platform.”

## A decision matrix for six options

| Option            | Start evaluating it when…                                                  | Main architectural commitment                                      | First thing to prove                                                |
| ----------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Vapi              | You want managed voice orchestration with configurable providers and tools | Platform assistants and call APIs                                  | Your selected provider combination and tool flow work together      |
| Retell            | You want managed calls with explicit conversation-flow configuration       | Platform agents, flow nodes, and call operations                   | Transfers and exception paths match your real workflow              |
| ElevenLabs Agents | You want an integrated voice and agent service                             | Agent configuration plus its client and phone integrations         | Your voice, languages, turn-taking, and retrieval meet the use case |
| LiveKit Agents    | You need agent code connected to realtime rooms and client media           | Room participants, credentials, agent dispatch, and workers        | Sessions connect reliably and dispatch the intended agent           |
| Pipecat           | You want to compose and customize a Python audio pipeline                  | Transports, processors, provider services, and agent hosting       | The pipeline handles interruptions and slow dependencies correctly  |
| OpenAI Realtime   | You want to build around a direct speech-to-speech model session           | Session credentials, realtime events, media, and application tools | Your app can own session lifecycle and tool execution end to end    |

For provider migration details, see [Vapi alternatives](/blog/vapi-alternatives). For pricing and call-operation differences between two managed options, see [Vapi vs Retell](/blog/vapi-vs-retell).

## Phone agents: evaluate the call operation

For appointment booking, inbound support, qualification, or outbound follow-up, start with the full call journey. The AI response is one part of it.

Before choosing a platform, implement a call that looks up a record, handles a missing result, and transfers to a person. Test what happens when the destination does not answer. Check whether the caller hears hold audio, whether the recipient gets context, and whether the call stays connected after the handoff.

Vapi and Retell document managed telephony and custom telephony integrations. ElevenLabs documents Twilio and SIP integrations. LiveKit provides SIP integration into rooms, and Pipecat documents telephony transports and integrations. Their existence does not establish equivalent transfer behavior on every carrier; test the exact route you will deploy.

Phone numbers, concurrency, outbound policies, regional availability, recordings, and retention can eliminate a candidate before model quality matters. Write those requirements down before your pilot. A browser demo cannot verify them.

## Browser and mobile agents: evaluate session ownership

For an in-app assistant, onboarding guide, tutor, or voice interface, the critical path includes authentication, microphone permission, connection startup, playback, interruption, and cleanup.

Managed SDKs can reduce how much media plumbing you write. LiveKit is worth evaluating when rooms, participants, and cross-platform realtime media are central to the product. Pipecat is worth evaluating when the backend pipeline needs custom processing. A direct realtime API can fit a focused application whose team wants to implement the surrounding behavior itself.

For every option, answer these questions in a working prototype:

- Can the user stop a session during startup and reconnect without creating duplicate calls?
- Does an expired credential produce a useful error, and can the client retry safely?
- Does interruption stop playback and leave the conversation in a consistent state?
- What happens when a tool finishes after the user has already disconnected?
- Does navigating away release microphone tracks and end the provider session?

Build the same small UI for the candidates you compare. Our [ElevenLabs React tutorial](/blog/elevenlabs-conversational-ai-react) and [OpenAI Realtime tutorial](/blog/openai-realtime-api-tutorial) show two different session architectures. The UI can remain simple while you compare the backend behavior.

## Cascaded speech versus realtime speech models

A common voice pipeline is:

```text
Microphone → speech-to-text → language model → text-to-speech → playback
```

This makes provider choices explicit and gives you text boundaries to inspect. It also means that turn detection, buffering, inference, synthesis, and transport all contribute to the response time.

A realtime speech model can accept and generate audio within the model session. That changes the integration and often the event model. It does not remove the need for application tools, access control, transcript handling, or a reliable media connection.

Neither design guarantees the fastest experience. Compare **end of user speech to first audible agent response** under the same network conditions, and separate tool-dependent turns from simple replies. Also measure how quickly playback stops when the user interrupts. A single average hides the slow conversations your users will notice.

## What open source and self-hosting actually mean

LiveKit and Pipecat provide open-source building blocks. You can use hosted services with those frameworks or operate more of the stack yourself. That is different from having a turnkey voice platform deployed inside your infrastructure.

If you self-host, identify the components separately: media transport, agent workers, model inference, knowledge stores, recordings, and monitoring. Running your agent worker in your own cloud does not keep audio or transcripts there if it still calls external speech and model APIs.

If private deployment is a requirement, compare the exact deployment boundary and contract. ElevenLabs documents enterprise private deployment options; availability and scope need confirmation for your workload. Avoid equating “managed” with “no private deployment” or “open source” with “all data stays local.”

## Compare the cost of completed work

An advertised per-minute price can include different components. One service may separate orchestration and model costs; another may bundle some usage; an infrastructure service may also meter media or worker resources. Phone charges and concurrency can be separate again.

For a useful comparison, run the same task set and collect the actual billable units. Record:

| Metric                             | Why it matters                                    |
| ---------------------------------- | ------------------------------------------------- |
| Completed tasks / attempted tasks  | Establishes whether the system does the job       |
| Cost per completed task            | Includes retries and unsuccessful conversations   |
| Median and slow-tail response time | Shows both the typical experience and long pauses |
| Interruption recovery              | Reveals overlapping playback and lost context     |
| Transfer and tool success          | Tests dependencies outside the model              |
| Engineering and operating effort   | Captures the cost that usage pricing omits        |

Use your observed call lengths and peak concurrency for the monthly projection. Do not extrapolate an unusually short demo into a production budget.

## A practical shortlist

For a **managed phone agent**, compare Vapi, Retell, and ElevenLabs against one real call flow and your carrier requirements. For a **custom realtime application**, compare LiveKit and Pipecat against your language, media, and deployment needs. For a **focused model-driven browser feature**, include a direct realtime API and budget for the application code around it.

Limit the first pilot to two candidates. Define a few pass/fail requirements, run the same representative conversations, and choose from observed results. You can make that initial decision in days without pretending the pilot proves every production condition.

Once the backend is chosen, a UI library such as orb-ui can display connection, listening, thinking, and speaking states. It does not replace the platform or framework. See the [adapter overview](/docs/adapters/overview) for supported integrations.

## Sources

- [Vapi documentation](https://docs.vapi.ai/introduction)
- [Retell documentation](https://docs.retellai.com/general/introduction)
- [ElevenLabs Agents](https://elevenlabs.io/docs/eleven-agents/overview) and [private deployment](https://elevenlabs.io/docs/overview/capabilities/private-deployment)
- [LiveKit Agents quickstart](https://docs.livekit.io/agents/start/voice-ai/), [telephony](https://docs.livekit.io/telephony/), and [self-hosting](https://docs.livekit.io/transport/self-hosting/)
- [Pipecat framework](https://docs.pipecat.ai/overview/pipecat), [Cloud](https://docs.pipecat.ai/overview/cloud), and [telephony](https://docs.pipecat.ai/pipecat/telephony/overview)
- [OpenAI Realtime API](https://developers.openai.com/api/docs/guides/realtime)
