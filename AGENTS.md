# Agent Instructions

This repo is intentionally AI-native. Follow `CONTRIBUTING.md` first, then these durable agent rules.

## PR and Release Standards

- Use Conventional Commit-style PR titles.
- Use `!` for intentional breaking changes, for example `feat!: introduce signal-based adapter API`.
- Breaking API changes need a changeset, migration notes, and matching docs/examples updates.
- Do not mark a change as breaking for internal-only refactors.

## Product Direction

- Keep public product planning in `ROADMAP.md`.
- When making meaningful progress on a roadmap item, update `ROADMAP.md` in the same PR. Mark completed work, adjust status/next steps, or explain in the PR notes why no roadmap update was needed.
- Treat docs and examples as part of the finished change. If behavior, API, adapters, themes, or project direction changes, update the relevant markdown/docs in the same PR.
- Do not commit private analytics, credentials, secret keys, internal research notes, or confidential timelines.
- Use neutral public names for brand-adjacent visual inspiration; avoid third-party brand names in public theme API names.
- New themes belong in `src/themes/`; new provider adapters belong in `src/adapters/`.

## Verification

- Run focused tests/typechecks for the touched surface when possible.
- Before opening a release PR, run `pnpm check`.
- If verification cannot be run, explain why in the PR notes.
