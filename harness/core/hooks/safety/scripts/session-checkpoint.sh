#!/usr/bin/env bash
set -euo pipefail

platform="${1:-unknown}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="${HARNESS_PROJECT_ROOT:-$(pwd)}"
script_name="$(basename "${BASH_SOURCE[0]}")"
script_path="$script_dir/$script_name"

source_runtime_hook_evidence_helper() {
  local helper
  for helper in \
    "$script_dir/runtime-hook-evidence.sh" \
    "$script_dir/../../runtime-hook-evidence.sh"; do
    if [ -f "$helper" ]; then
      # shellcheck source=/dev/null
      . "$helper"
      return 0
    fi
  done

  return 1
}

source_runtime_hook_evidence_helper || true

if command -v git >/dev/null 2>&1; then
  git_root="$(git -C "$project_root" rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$git_root" ]; then
    project_root="$git_root"
  fi
fi

if [ -x "$project_root/scripts/harness" ]; then
  "$project_root/scripts/harness" checkpoint "$project_root" --quiet --skip-if-clean >/dev/null 2>&1 || true
  exit 0
fi

if [ -f "$script_dir/../../../safety/bin/checkpoint" ]; then
  bash "$script_dir/../../../safety/bin/checkpoint" "$project_root" --quiet --skip-if-clean >/dev/null 2>&1 || true
fi

if declare -F harness_record_runtime_hook_evidence >/dev/null 2>&1; then
  harness_record_runtime_hook_evidence \
    "$platform" \
    "safety" \
    "SessionStart" \
    "$project_root" \
    "$(pwd)" \
    "$script_name" \
    "$script_path" || true
fi

exit 0
