#!/usr/bin/env bash
set -euo pipefail

WORKTREE_PATH="${CODEX_WORKTREE_PATH:-$PWD}"
SOURCE_TREE_PATH="${CODEX_SOURCE_TREE_PATH:-}"
REMOTE="${CODEX_REMOTE:-origin}"
MAIN_BRANCH="${CODEX_MAIN_BRANCH:-main}"
DIAGNOSTIC_LOG="/tmp/orb-ui-codex-setup.log"

log() {
  printf '%s\n' "$*" >> "$DIAGNOSTIC_LOG"
}

is_work_tree() {
  git -C "$1" rev-parse --is-inside-work-tree >/dev/null 2>&1
}

current_branch() {
  git -C "$1" branch --show-current 2>/dev/null || true
}

resolve_source_tree() {
  if [[ -n "$SOURCE_TREE_PATH" ]]; then
    return
  fi

  # Codex usually creates linked worktrees, so Git's common directory points back
  # to the developer's canonical checkout regardless of where they keep the repo.
  # Set CODEX_SOURCE_TREE_PATH if your setup needs to override this inference.
  local common_dir
  common_dir="$(git -C "$WORKTREE_PATH" rev-parse --path-format=absolute --git-common-dir)"
  SOURCE_TREE_PATH="${common_dir%/.git}"
}

fetch_fresh_main() {
  local target_tree="$1"

  git -C "$target_tree" fetch "$REMOTE" "$MAIN_BRANCH:refs/remotes/$REMOTE/$MAIN_BRANCH"
}

pull_source_main_if_safe() {
  if [[ "$SOURCE_TREE_PATH" == "$WORKTREE_PATH" ]]; then
    return
  fi

  if ! is_work_tree "$SOURCE_TREE_PATH"; then
    echo "Skipping source main pull: $SOURCE_TREE_PATH is not a git work tree"
    return
  fi

  local source_branch
  source_branch="$(current_branch "$SOURCE_TREE_PATH")"

  if [[ "$source_branch" != "$MAIN_BRANCH" ]]; then
    echo "Skipping source main pull: $SOURCE_TREE_PATH is on '$source_branch', not '$MAIN_BRANCH'"
    fetch_fresh_main "$SOURCE_TREE_PATH"
    return
  fi

  if [[ -n "$(git -C "$SOURCE_TREE_PATH" status --porcelain)" ]]; then
    echo "Skipping source main pull: $SOURCE_TREE_PATH has local changes"
    fetch_fresh_main "$SOURCE_TREE_PATH"
    return
  fi

  git -C "$SOURCE_TREE_PATH" pull --ff-only "$REMOTE" "$MAIN_BRANCH"
}

update_worktree_to_fresh_main() {
  cd "$WORKTREE_PATH"

  fetch_fresh_main "$WORKTREE_PATH"

  local target_sha
  local current_sha
  target_sha="$(git rev-parse "refs/remotes/$REMOTE/$MAIN_BRANCH")"
  current_sha="$(git rev-parse HEAD)"

  if [[ "$current_sha" == "$target_sha" ]]; then
    echo "Worktree already at $REMOTE/$MAIN_BRANCH ($target_sha)"
    return
  fi

  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Skipping worktree update: $WORKTREE_PATH has local changes"
    return
  fi

  git switch --detach "$target_sha"
  echo "Updated worktree to $REMOTE/$MAIN_BRANCH ($target_sha)"
}

copy_source_env_file() {
  local relative_path="$1"

  if [[ "$SOURCE_TREE_PATH" == "$WORKTREE_PATH" ]]; then
    return
  fi

  if [[ -f "$SOURCE_TREE_PATH/$relative_path" ]]; then
    mkdir -p "$(dirname "$WORKTREE_PATH/$relative_path")"
    cp -p "$SOURCE_TREE_PATH/$relative_path" "$WORKTREE_PATH/$relative_path"
    echo "Copied $relative_path"
  else
    echo "No source $relative_path found"
  fi
}

{
  printf '%s setup-worktree start\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf 'PWD=%s\n' "$PWD"
  printf 'CODEX_WORKTREE_PATH=%s\n' "${CODEX_WORKTREE_PATH:-}"
  printf 'CODEX_SOURCE_TREE_PATH=%s\n' "${CODEX_SOURCE_TREE_PATH:-}"
  printf 'REMOTE=%s\n' "$REMOTE"
  printf 'MAIN_BRANCH=%s\n' "$MAIN_BRANCH"
  printf '\n'
} >> "$DIAGNOSTIC_LOG"

resolve_source_tree
log "Resolved SOURCE_TREE_PATH=$SOURCE_TREE_PATH"

pull_source_main_if_safe
update_worktree_to_fresh_main

# Copy local-only env files into Codex worktrees when they exist. These files are
# ignored by git, but they may contain secrets, so keep this list narrow.
copy_source_env_file ".env.local"
copy_source_env_file "demo/.env"
copy_source_env_file "demo/.env.local"

cd "$WORKTREE_PATH"
pnpm install
