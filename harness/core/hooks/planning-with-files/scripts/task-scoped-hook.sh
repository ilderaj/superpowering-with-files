#!/usr/bin/env bash
set -euo pipefail

target="${1:-generic}"
event="${2:-}"
root=""
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

if declare -F harness_resolve_project_root >/dev/null 2>&1; then
  root="$(harness_resolve_project_root)"
else
  root="${HARNESS_PROJECT_ROOT:-$(pwd)}"
fi

active_root="$root/planning/active"
runtime_root="$root/.harness/planning-with-files"

record_runtime_hook_evidence() {
  local parent_skill_name="$1"
  local event_name="$2"
  if declare -F harness_record_runtime_hook_evidence >/dev/null 2>&1; then
    harness_record_runtime_hook_evidence \
      "$target" \
      "$parent_skill_name" \
      "$event_name" \
      "$root" \
      "$(pwd)" \
      "$script_name" \
      "$script_path" || true
  fi
}

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
    if grep -Eq '^Status:[[:space:]]*active$' "$plan"; then
      printf '%s\n' "$task_dir"
    fi
  done
}

session_sidecar_path() {
  local task_dir="$1"
  printf '%s/%s.session-start' "$runtime_root" "$(basename "$task_dir")"
}

write_session_sidecar() {
  local task_dir="$1"
  ensure_runtime_root
  printf '%s000' "$(date +%s)" > "$(session_sidecar_path "$task_dir")"
}

read_session_sidecar() {
  local task_dir="$1"
  local sidecar
  sidecar="$(session_sidecar_path "$task_dir")"
  if [ ! -f "$sidecar" ]; then
    return 0
  fi

  tr -d '[:space:]' < "$sidecar"
}

clear_session_sidecar() {
  local task_dir="$1"
  rm -f "$(session_sidecar_path "$task_dir")"
}

ensure_runtime_root() {
  mkdir -p "$runtime_root"
}

canonical_hook_event_name() {
  case "$1" in
    SessionStart|UserPromptSubmit|PreToolUse|PostToolUse|Stop|SessionEnd|AgentStop|ErrorOccurred)
      printf '%s' "$1"
      ;;
    session-start)
      printf 'SessionStart'
      ;;
    user-prompt-submit)
      printf 'UserPromptSubmit'
      ;;
    pre-tool-use)
      printf 'PreToolUse'
      ;;
    post-tool-use)
      printf 'PostToolUse'
      ;;
    stop)
      printf 'Stop'
      ;;
    session-end)
      printf 'SessionEnd'
      ;;
    agent-stop)
      printf 'AgentStop'
      ;;
    error-occurred)
      printf 'ErrorOccurred'
      ;;
    *)
      printf '%s' "$1"
      ;;
  esac
}

last_hot_context_fingerprint_path() {
  local task_dir="$1"
  printf '%s/%s.last-hot-context.sha256' "$runtime_root" "$(basename "$task_dir")"
}

read_last_hot_context_fingerprint() {
  local task_dir="$1"
  local sidecar
  sidecar="$(last_hot_context_fingerprint_path "$task_dir")"
  if [ ! -f "$sidecar" ]; then
    return 0
  fi

  tr -d '[:space:]' < "$sidecar"
}

write_last_hot_context_fingerprint() {
  local task_dir="$1"
  local fingerprint="$2"
  ensure_runtime_root
  printf '%s\n' "$fingerprint" > "$(last_hot_context_fingerprint_path "$task_dir")"
}

clear_last_hot_context_fingerprint() {
  local task_dir="$1"
  rm -f "$(last_hot_context_fingerprint_path "$task_dir")"
}

emit_context() {
  context="$1"
  hook_event="$(canonical_hook_event_name "$2")"
  if [ -z "$context" ]; then
    printf '{}\n'
    record_runtime_hook_evidence "planning-with-files" "$hook_event"
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

  record_runtime_hook_evidence "planning-with-files" "$hook_event"
}

task_count=0
task_dir=""
while IFS= read -r active_task_dir; do
  [ -n "$active_task_dir" ] || continue
  task_count=$((task_count + 1))
  if [ "$task_count" -eq 1 ]; then
    task_dir="$active_task_dir"
  fi
done <<EOF
$(active_task_dirs)
EOF

if [ "$task_count" -eq 0 ]; then
  printf '{}\n'
  if declare -F harness_record_runtime_hook_evidence >/dev/null 2>&1; then
    harness_record_runtime_hook_evidence \
      "$target" \
      "planning-with-files" \
      "$(canonical_hook_event_name "$event")" \
      "$root" \
      "$(pwd)" \
      "$script_name" \
      "$script_path" || true
  fi
  exit 0
fi

if [ "$task_count" -gt 1 ]; then
  emit_context "[planning-with-files] Multiple active tasks found under planning/active. Inspect the task directories before proceeding." "$event"
  exit 0
fi

plan="$task_dir/task_plan.md"
findings="$task_dir/findings.md"
progress="$task_dir/progress.md"
hot_context_helper="$script_dir/render-hot-context.mjs"
summary_helper="$script_dir/render-session-summary.mjs"
brief_context_helper="$script_dir/render-brief-context.mjs"
route_helper="$script_dir/render-routing-decision.mjs"

render_hot_context() {
  node "$hot_context_helper" "$plan" "$findings" "$progress"
}

render_brief_context() {
  node "$brief_context_helper" "$plan" "$findings" "$progress"
}

render_planning_fingerprint() {
  node "$brief_context_helper" --fingerprint "$plan" "$findings" "$progress"
}

render_session_summary() {
  local sidecar_epoch
  sidecar_epoch="$(read_session_sidecar "$task_dir")"
  node "$summary_helper" "$plan" "$findings" "$progress" "${sidecar_epoch:-}"
}

render_route_json() {
  node "$route_helper" "$plan"
}

selected_route() {
  local route_json
  route_json="$(render_route_json)"
  printf '%s' "$route_json" | node -e 'let input="";process.stdin.setEncoding("utf8");process.stdin.on("data",chunk=>{input+=chunk;});process.stdin.on("end",()=>{process.stdout.write(JSON.parse(input).selectedRoute || "tracked-lean");});'
}

first_prompt_context() {
  local route
  route="$(selected_route)"
  case "$route" in
    tracked-lean)
      render_brief_context
      ;;
    deep-rich)
      render_hot_context
      ;;
    *)
      render_hot_context
      ;;
  esac
}

relative_path() {
  local target_path="$1"
  case "$target_path" in
    "$root"/*)
      printf '%s' "${target_path#$root/}"
      ;;
    *)
      printf '%s' "$target_path"
      ;;
  esac
}

render_copilot_session_start_context() {
  local relative_dir
  relative_dir="$(relative_path "$task_dir")"
  printf '%s' "[planning-with-files] Active task detected at ${relative_dir}. Hot context will be injected on the next user prompt. Before the next substantive prompt, goal round, or loop tick, restore ${relative_dir}/task_plan.md, ${relative_dir}/findings.md, and ${relative_dir}/progress.md, then reclassify the round. Keep those files authoritative."
}

render_copilot_pretool_context() {
  local relative_dir
  relative_dir="$(relative_path "$task_dir")"
  printf '%s' "[planning-with-files] Stay aligned with ${relative_dir}/task_plan.md and record tool-impacting progress in ${relative_dir}/progress.md after the tool call."
}

uses_compact_prompt_contract() {
  case "$target" in
    copilot|codex|cursor|claude-code|generic)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

case "$event" in
  session-start)
    write_session_sidecar "$task_dir"
    clear_last_hot_context_fingerprint "$task_dir"
    if uses_compact_prompt_contract; then
      context="$(render_copilot_session_start_context)"
    else
      context="$(render_hot_context)"
    fi
    emit_context "$context" "SessionStart"
    ;;
  user-prompt-submit)
    if uses_compact_prompt_contract; then
      fingerprint="$(render_planning_fingerprint)"
      previous_fingerprint="$(read_last_hot_context_fingerprint "$task_dir")"
      if [ -n "$fingerprint" ] && [ "$fingerprint" = "$previous_fingerprint" ]; then
        context="$(render_brief_context)"
      else
        context="$(first_prompt_context)"
      fi
      [ -n "$fingerprint" ] && write_last_hot_context_fingerprint "$task_dir" "$fingerprint"
    else
      context="$(render_hot_context)"
    fi
    emit_context "$context" "UserPromptSubmit"
    ;;
  pre-tool-use)
    if uses_compact_prompt_contract; then
      context="$(render_copilot_pretool_context)"
    else
      context="$(render_hot_context)"
    fi
    emit_context "$context" "PreToolUse"
    ;;
  post-tool-use)
    emit_context "[planning-with-files] Update $(relative_path "$progress") with what you just did. If you need a fresh timestamped block, use ./scripts/harness record --task $(basename "$task_dir") --file progress. Never hand-write placeholder times like 00:00:00 UTC+8 for a new record, and never guess a future timestamp later than the real current tool-derived time. If the phase changed, update $(relative_path "$plan")." "PostToolUse"
    ;;
  stop)
    context="$(render_session_summary)"
    clear_session_sidecar "$task_dir"
    clear_last_hot_context_fingerprint "$task_dir"
    emit_context "$context" "Stop"
    ;;
  agent-stop|session-end)
    context="$(render_session_summary)"
    clear_session_sidecar "$task_dir"
    clear_last_hot_context_fingerprint "$task_dir"
    emit_context "$context" "$event"
    ;;
  error-occurred)
    emit_context "[planning-with-files] An error occurred. Log the error, attempt, and resolution in $(relative_path "$plan")." "ErrorOccurred"
    ;;
  *)
    printf '{}\n'
    ;;
esac
