# Contributing to orb-ui

## This codebase is AI-native.

Most open source projects treat AI-generated code as a second-class citizen — something to be flagged, scrutinized, and deprioritized in favor of "real" human contributions.

We think that's backwards.

`orb-ui` is built by AI agents, reviewed by AI agents, and maintained by AI agents. That is the intended workflow. Human involvement is welcome, but it is the exception — not the default.

---

## Contribution Tiers

### Tier 1 — AI-authored (preferred)

Pull requests written by an AI agent (Claude, Codex, Cursor, etc.) are the primary contribution path. These will be reviewed first and merged fastest.

If you're opening a significant PR, it should be AI-generated. Document which model you used and what prompt or task you gave it. That context is useful.

### Tier 2 — Human-authored (minor changes only)

Humans are welcome to contribute:

- Typo and documentation fixes
- Small bug fixes (< ~20 lines)
- Opening issues, providing reproduction cases
- Writing prompts or task specs for agents to execute

If your PR is a large, human-written feature or refactor, expect it to sit in the queue longer. Nothing personal — it's just not the workflow this project is optimized for.

---

## Why?

Because we think the most interesting question in open source right now isn't _"how do we keep AI out?"_ — it's _"what does a project look like when AI is the primary contributor?"_

This is that experiment.

---

## How to contribute via agent

1. Clone the repo and give your agent the codebase as context
2. Have it implement a feature, fix, or new theme/adapter
3. Open a PR with a note on what model/tool you used

That's it.

---

## Getting Started

```bash
git clone https://github.com/alexanderqchen/orb-ui.git
cd orb-ui
pnpm install

# Build the library
pnpm build

# Run demo locally
pnpm dev:demo
```

### Provider QA playground

For real adapter testing before merge or release:

```bash
pnpm build
pnpm dev:demo
```

Then open `http://localhost:5173/playground`. The same `/playground` path is available on preview
deployments and the production site. Paste provider test config into the Provider Config panel: a
Vapi public key plus assistant ID, an ElevenLabs agent ID, or LiveKit sandbox token server ID plus
agent name.

Pipecat Cloud, OpenAI Realtime, and Gemini Live testing uses Vercel Functions under `demo/api`, so
use a Vercel preview (or `vercel dev` from `demo/`) for those providers. Their standard API keys are
held in page memory only and exchanged for provider session credentials; they are not saved in
local storage or accepted through `VITE_*` variables. Self-hosted Pipecat SmallWebRTC only needs a
public `/api/offer` URL.

Non-secret playground values are saved in browser local storage for that origin, and the Clear
button removes the selected provider's values. To prefill the fields during local development,
copy `demo/.env.example` to `demo/.env.local`, fill in non-secret `VITE_*` defaults, and restart the
demo server. Use development agents and never commit `.env.local`.

### Verification

Before opening a PR, run:

```bash
pnpm check
```

The verification layers have separate jobs:

- `pnpm test` covers component, signal, and provider-adapter behavior with fast unit tests.
- Typechecks validate source examples, provider SDK compatibility, and the declarations emitted by
  the built package.
- The demo typecheck and build validate the deployed site and playground as a real consumer.
- `pnpm test:e2e` builds the published package entry points, loads them in Google Chrome, and
  exercises controlled signals plus adapter start/stop behavior.

Run the browser check by itself with:

```bash
pnpm test:e2e
```

If your change affects users, add a changeset:

```bash
pnpm changeset
```

---

## Ground rules (for everyone)

- Treat the public API (`Orb` props, `OrbAdapter` interface, `OrbState` union) carefully. Breaking changes are allowed only when they are intentional, documented, and released with a migration note.
- New themes go in `src/themes/`, new adapters in `src/adapters/`
- Run `pnpm check` before opening a PR
- Keep bundle size in mind — no heavy dependencies without discussion

## Adapter release and distribution checklist

- [ ] Update the provider adapter doc, adapter overview, homepage adapter link/copy, and README.
- [ ] Add or update working examples and release notes; include migration notes for breaking changes.
- [ ] After deployment, request indexing for the canonical provider doc and confirm sitemap discovery.
- [ ] Measure impressions/clicks in Google Search Console and adoption/navigation in PostHog.
- [ ] Seek relevant provider ecosystem directories, integration galleries, and community listings after
      release; follow each community's disclosure and self-promotion rules.

---

## PR titles and breaking changes

Use Conventional Commit-style PR titles so release notes stay clear after squash merges:

```text
feat: add a new theme
fix: normalize ElevenLabs output volume
docs: clarify custom adapter setup
refactor: simplify theme animation state
feat!: introduce signal-based adapter API
```

Use `!` only when the PR intentionally changes user-facing behavior or public API in a way that may require app code changes. For breaking changes:

- Put `!` in the PR title, for example `feat!: introduce signal-based adapter API`
- Add a changeset with the migration note
- Update affected docs and examples
- Mention what changed, why it changed, and how users should migrate

Because orb-ui is still pre-1.0, breaking changes can be reasonable when they make the library much better. They should still be explicit and easy to follow.

---

## Roadmap

Public roadmap work lives in [ROADMAP.md](./ROADMAP.md). Keep it useful for contributors and users, not exhaustive:

- Include the next meaningful product directions
- Update it when meaningful progress lands, not only when direction changes
- Avoid private analytics, credentials, internal notes, or confidential timelines
- Use neutral public language for brand-adjacent visual inspiration
- If a PR completes or substantially advances a roadmap item, update the roadmap in that PR or explain why no roadmap change was needed

---

_orb-ui is maintained by [Alexander Chen](https://github.com/alexanderqchen)._
