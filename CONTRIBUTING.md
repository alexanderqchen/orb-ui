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

Because we think the most interesting question in open source right now isn't *"how do we keep AI out?"* — it's *"what does a project look like when AI is the primary contributor?"*

This is that experiment.

---

## How to contribute via agent

1. Read [`STATUS.md`](./STATUS.md) to understand what's built and what's next
2. Read [`REQUIREMENTS.md`](./REQUIREMENTS.md) for the full design spec
3. Give your agent both files as context
4. Have it implement one item from the build order
5. Open a PR with a note on what model/tool you used

That's it.

---

## Ground rules (for everyone)

- Don't break the public API (`VoiceOrb` props, `OrbAdapter` interface, `OrbState` union)
- New themes go in `src/themes/`, new adapters in `src/adapters/`
- Run `npm run typecheck` and `npm run build` before opening a PR
- Keep bundle size in mind — no heavy dependencies without discussion

---

*orb-ui is maintained by [Alexander Chen](https://github.com/alexanderqchen).*
