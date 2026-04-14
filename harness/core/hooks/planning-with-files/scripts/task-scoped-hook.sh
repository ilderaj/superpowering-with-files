#!/usr/bin/env bash
set -euo pipefail

target="${1:-generic}"
event="${2:-}"
root="${HARNESS_PROJECT_ROOT:-$(pwd)}"
active_root="$root/planning/active"

json_escape() {
  node -e 'let input = ""; process.stdin.setEncoding("utf8"); process.stdin.on("data", chunk => { input += chunk; }); process.stdin.on("end", () => { process.stdout.write(JSON.stringify(input)); });'
}

active_task_dirs() {
  if [ ! -d "$active_root" ]; then
    return 0
  fi

  for task_dir in "$active_root"/*; do
    [ -d "$task_dir" ] || continue
    plan="$task_dir/task_plan.md"
    [ -f "$plan" ] || continue
    if grep -q '^Status: active$' "$plan"; then
      printf '%s\n' "$task_dir"
    fi
  done
}

emit_context() {
  context="$1"
  hook_event="$2"
  if [ -z "$context" ]; then
    printf '{}\n'
    return 0
  fi

  escaped="$(printf '%s' "$context" | json_escape)"
  case "$target" in
    codex)
      printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":%s}}\n' "$hook_event" "$escaped"
      ;;
    cursor)
      if [ "$event" = "pre-tool-use" ]; then
        printf '%s\n' "$context" >&2
        printf '{"decision":"allow"}\n'
      else
        printf '{"additional_context":%s}\n' "$escaped"
      fi
      ;;
    copilot)
      if [ "$event" = "pre-tool-use" ]; then
        printf '{"hookSpecificOutput":{"hookEventName":"%s","permissionDecision":"allow","additionalContext":%s}}\n' "$hook_event" "$escaped"
      else
        printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":%s}}\n' "$hook_event" "$escaped"
      fi
      ;;
    claude-code)
      printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":%s}}\n' "$hook_event" "$escaped"
      ;;
    *)
      printf '{"additionalContext":%s}\n' "$escaped"
      ;;
  esac
}

tasks_file="${TMPDIR:-/tmp}/harness-planning-tasks.$$"
trap 'rm -f "$tasks_file"' EXIT
active_task_dirs > "$tasks_file"
task_count="$(sed '/^$/d' "$tasks_file" | wc -l | tr -d '[:space:]')"

if [ "$task_count" -eq 0 ]; then
  printf '{}\n'
  exit 0
fi

if [ "$task_count" -gt 1 ]; then
  emit_context "[planning-with-files] Multiple active tasks found under planning/active. Inspect the task directories before proceeding." "$event"
  exit 0
fi

task_dir="$(sed -n '1p' "$tasks_file")"
plan="$task_dir/task_plan.md"
progress="$task_dir/progress.md"

case "$event" in
  session-start)
    context="$(printf '[planning-with-files] ACTIVE PLAN\n'; sed -n '1,80p' "$plan"; printf '\n=== recent progress ===\n'; tail -20 "$progress" 2>/dev/null || true)"
    emit_context "$context" "SessionStart"
    ;;
  user-prompt-submit)
    context="$(printf '[planning-with-files] ACTIVE PLAN\n'; sed -n '1,80p' "$plan"; printf '\n=== recent progress ===\n'; tail -20 "$progress" 2>/dev/null || true)"
    emit_context "$context" "UserPromptSubmit"
    ;;
  pre-tool-use)
    context="$(sed -n '1,40p' "$plan" 2>/dev/null || true)"
    emit_context "$context" "PreToolUse"
    ;;
  post-tool-use)
    emit_context "[planning-with-files] Update $progress with what you just did. If the phase changed, update $plan." "PostToolUse"
    ;;
  stop)
    emit_context "[planning-with-files] Before stopping, update $progress and confirm $plan lifecycle state." "Stop"
    ;;
  agent-stop|session-end)
    emit_context "[planning-with-files] Before stopping, update $progress and confirm $plan lifecycle state." "$event"
    ;;
  error-occurred)
    emit_context "[planning-with-files] An error occurred. Log the error, attempt, and resolution in $plan." "ErrorOccurred"
    ;;
  *)
    printf '{}\n'
    ;;
esac
