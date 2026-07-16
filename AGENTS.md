# Agent Instructions

This repo is intentionally AI-native. Follow `CONTRIBUTING.md` first, then these durable agent rules.

## PR and Release Standards

- Use Conventional Commit-style PR titles.
- Use `!` for intentional breaking changes, for example `feat!: introduce signal-based adapter API`.
- Breaking API changes need a changeset, migration notes, and matching docs/examples updates.
- Do not mark a change as breaking for internal-only refactors.

## Git and GitHub Workflow

- Use local Git for branch creation, staging, commits, and pushes.
- When a connected GitHub App is available, prefer it for repository metadata and pull request creation after the branch has been pushed.
- Do not treat `gh auth status` as a universal prerequisite. An expired or missing GitHub CLI token only blocks operations that actually require `gh`; it does not block local Git, an authenticated `git push`, or the connected GitHub App.
- Use `gh` as a fallback when the GitHub App is unavailable or does not support the required operation. Request `gh auth login` only when that fallback is genuinely required.
- Before opening a PR, confirm the intended diff, push the current branch, derive the target repository from `origin`, and derive the base branch from `origin/HEAD` or GitHub App repository metadata.
- Open draft PRs by default unless the user explicitly asks for a ready-for-review PR.
- If publishing fails, report the failing layer precisely: local Git state, remote push authentication, GitHub App access, or GitHub CLI authentication.

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
