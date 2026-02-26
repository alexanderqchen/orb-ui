# Voice AI UI Research

> Research compiled 2026-02-26 to inform visual design of orb-ui themes.
> Goal: understand the design language of the major voice AI products before building circle, bars, and jarvis.

---

## Summary

The voice AI UI landscape has converged on a few patterns: **animated orbs/blobs**, **waveforms/bars**, and **radial gradients with ripple effects**. Almost every major product uses one or a combination of these. The differentiators are color, personality, and how state changes are communicated. There's a clear market opportunity for something that feels more raw, developer-native, and customizable — which is exactly what orb-ui aims to be.

---

## Platform-by-Platform

### 1. OpenAI — ChatGPT Advanced Voice Mode

**Visual:** An animated **blue orb** that fills most of the screen. Widely recognized as *the* voice AI visual — it's become iconic enough that Reddit has threads celebrating its return.

**States:**
- **Idle:** Soft, slow pulse. Orb breathes gently.
- **Listening:** Orb reacts to user voice input — expands/contracts with audio amplitude.
- **Speaking:** More energetic animation, orb "speaks" with fluid motion.
- **Thinking:** Subtle animation shift between user stop and AI response.

**Design language:**
- Single color (blue), very clean, full-screen takeover on mobile.
- Dark background. The orb is the only thing on screen.
- Two modes exist: the standalone blue orb screen, and an integrated experience inside the chat view (newer).
- Animation is fluid and feels alive — clearly heavily engineered.

**Notes:**
- The blue orb is so associated with ChatGPT that cloning it would be derivative. It's also periodically removed/returned (Reddit drama about this).
- Users clearly have emotional attachment to it — it feels like a "character."

---

### 2. Google Gemini — Gemini Live

**Visual:** A **radial gradient** with **rippling motion**. Multi-color (Google brand: blue, red, yellow, green), fluid and organic.

**States:**
- **Idle/Listening:** Slow, gentle ripple outward from center.
- **Speaking:** Faster, more energetic ripple. The motion "gives a sense of anticipation, then release" (Google Design).
- **Thinking:** Gradients shift and animate with anticipatory motion.

**Design language:**
- Google's official design doc describes it as "visualizing Gemini's conversations and listening abilities" via a rippling motion in a radial gradient.
- Colors shift dynamically — the gradient isn't static, it moves and morphs.
- No hard boundary — the gradient bleeds and flows, very organic.
- Feels "living" and fluid rather than mechanical.

**Notes:**
- This is probably the most visually sophisticated of the big players.
- The ripple + radial gradient pattern is distinctive from OpenAI's orb — more ambient, less defined.
- Designed in-house by Google Design team, with a lot of intentional motion theory behind it.

---

### 3. Anthropic — Claude Voice Mode

**Visual:** Minimalist. Launched May 2025 on iOS/Android. **No orb or dramatic animation** — Claude's voice mode focuses on *functionality* over visual spectacle.

**States:**
- Displays **key points on-screen as Claude speaks** (text overlay during speech).
- Shows a transcript and summary after conversations.
- Standard microphone/speaking indicators, no flashy orb.

**Design language:**
- Anthropic's aesthetic is intentionally understated. Clean, sans-serif, lots of white space.
- The voice mode feels like a voice layer on top of the existing Claude UI, not a reimagined experience.
- 5 voice options. Users can switch between text/voice mid-conversation.
- Mobile-first (iOS/Android), some web presence.

**Notes:**
- Surprisingly un-flashy for a frontier AI lab. This is deliberate — Anthropic's brand is "serious, trustworthy AI."
- Biggest visual differentiator: the real-time text key points during speech — almost like subtitles.
- This is the biggest gap in the market — no one is building *Claude-powered* voice agent UIs that look great.

---

### 4. Perplexity — Voice Mode

**Visual:** **Animated stroke lines** that respond to voice. Not a blob or orb — more abstract, like signal waves rendered as strokes.

**States:**
- Strokes animate in response to audio input/output.
- Chat-integrated — voice mode lives inside the conversation UI, not a dedicated fullscreen takeover.

**Design language:**
- Perplexity's aesthetic is dark, techy, minimal. The stroke animation fits their brand.
- Feels more like a "voice search" than a "voice companion."
- Less emphasis on the AI having a "presence" — more utilitarian.

**Notes:**
- The stroke animation style is underused and visually distinctive. Worth exploring as a theme.

---

### 5. xAI — Grok Voice Mode

**Visual:** Started as a standard animated interface, experimenting with a **transparent overlay / spatial UI** direction as of mid-2025.

**States:**
- Transparent overlay on top of real-world camera view.
- Signals ambition toward mixed-reality/spatial computing.

**Design language:**
- xAI is pointing toward AR/spatial UI — voice mode as a "layer over reality" rather than a fullscreen app.
- Very early, not well-documented visually yet.

**Notes:**
- Not relevant for short-term, but directionally interesting. The "voice as ambient layer" concept is where the industry is heading long-term.

---

### 6. ElevenLabs — Conversational AI Widget + ElevenLabs UI

**Visual:** Two products:
1. **Embeddable widget** — a floating chat widget with voice support. Standard chat bubble aesthetic.
2. **ElevenLabs UI** (`ui.elevenlabs.io`) — open-source React component library. This is the most direct competitor to orb-ui.

**ElevenLabs UI components:**
- `Orb` — interactive orb visualization with `idle`, `listening`, `talking` states
- `BarVisualizer` — vertical bars animating with audio
- `LiveWaveform` — real-time audio waveform
- `Waveform` — static/scrubable waveform
- `Matrix` — unknown, likely a matrix/grid visualization
- `ShimmeringText` — text that shimmers while speaking
- `VoiceButton` — microphone button with visual states
- `ConversationBar` — full bar-style conversation UI

**Design language:**
- ElevenLabs UI is built on top of shadcn/ui. It looks polished and production-ready.
- The orb component appears to be a dark, glowing sphere.
- Very comprehensive — they've basically built what orb-ui is trying to build.

**Notes:**
- ⚠️ This is the most direct competitor. Key differentiators for orb-ui:
  - orb-ui is **provider-agnostic** (Vapi, ElevenLabs, Pipecat, Bland) — ElevenLabs UI is ElevenLabs-only
  - orb-ui has a **simpler single-component API** (`<VoiceOrb adapter={...} theme={...} />`)
  - orb-ui's `jarvis` theme targets a more sci-fi/dramatic aesthetic than ElevenLabs' clean design
  - ElevenLabs UI has more components; orb-ui is more opinionated and focused

---

### 7. Hume AI

**Visual:** Focus on **emotional expressiveness** rather than a specific orb/waveform aesthetic. The UI communicates emotional tone of the AI's voice.

**Design language:**
- More conversational chat interface with voice overlaid.
- The emotional intelligence aspect sets it apart (detecting/reflecting emotions in voice).
- Less about the orb, more about the conversation experience.

**Notes:**
- Not a direct UI competitor but worth watching for the "expressive voice" angle.

---

### 8. Pipecat — voice-ui-kit

**Visual:** Open-source React component library for building voice AI UIs. Provider-agnostic like orb-ui.

**Design language:**
- Developer-focused. Less opinionated on visual style — more of a toolkit.
- Includes components, hooks, and template apps.

**Notes:**
- Direct open-source competitor, but positioned as a lower-level toolkit. orb-ui's advantage: higher-level, more opinionated, better defaults.

---

### 9. VoiceOrbs.com (non-AI, but relevant)

**Visual:** No-code voice AI widget builder. Drag-and-drop customization of orbs — gradient colors, animations, pulse styles, export as code snippets.

**Design language:**
- Purely visual tool, no AI integration. But shows the market demand for customizable orb designs.

**Notes:**
- Signals that developers want customizable, beautiful orbs. orb-ui is the engineering-first version of this.

---

## Design Patterns Summary

| Pattern | Who Uses It | Notes |
|---|---|---|
| Animated orb/blob | OpenAI (blue), ElevenLabs | Most recognizable, emotionally resonant |
| Radial gradient + ripple | Google Gemini | Most visually sophisticated, organic |
| Stroke/signal lines | Perplexity | Underused, distinctive, tech-forward |
| Vertical bars (audio viz) | ElevenLabs, many devs | Classic, reliable, easy to build |
| Waveform | ElevenLabs, audio apps | Good for showing spoken content history |
| Transparent/spatial overlay | Grok (early experiments) | Future direction, AR/spatial |
| Minimal + text overlay | Anthropic Claude | Functional, no-frills |

---

## Competitive Landscape

| Product | Provider-agnostic | Open source | Single component API | Visual quality | Sci-fi/dramatic theme |
|---|---|---|---|---|---|
| **orb-ui** | ✅ | ✅ | ✅ | 🚧 building | ✅ (jarvis) |
| ElevenLabs UI | ❌ EL only | ✅ | ❌ many components | ✅ high | ❌ |
| Pipecat voice-ui-kit | ✅ | ✅ | ❌ toolkit | 🟡 medium | ❌ |
| VoiceOrbs.com | n/a | ❌ | n/a | ✅ | 🟡 |

---

## Implications for orb-ui Themes

### `circle` theme
- Should feel **alive** — not static. Even at idle, it should breathe.
- Inspiration: OpenAI's blue orb, but less branded. Color should be themeable.
- Avoid: being a clone of ChatGPT's orb. Go softer or more minimal.
- Suggested direction: **single circle, soft glow, slow idle breathing, scale + bloom on speaking, ring pulse on listening, rotating dashed border on thinking.**
- Color system: single accent color (CSS custom property, defaulting to a nice blue/purple).

### `bars` theme
- Classic, instantly legible. ElevenLabs' BarVisualizer does this well.
- Differentiate with: **uneven bar count** (5-7 bars), slightly organic heights, smooth spring physics instead of linear animation.
- Consider: bars can also represent thinking with a "loading" sweep animation.

### `jarvis` theme
- This is the hero. Needs to be **genuinely stunning** — the thing people screenshot and post.
- Inspiration: Iron Man HUD, HAL 9000, Gemini's organic fluid motion, but darker and more sci-fi.
- No existing voice AI product has done this well. That's the gap.
- Technical direction: Canvas + WebGL, particle systems, concentric rings, hexagonal grid, scanline effects, glowing energy core.
- Color: electric blue/cyan with orange/red accents for state changes. Dark background, no light mode.
- Must feel like something out of a movie.

---

*Last updated: 2026-02-26*
