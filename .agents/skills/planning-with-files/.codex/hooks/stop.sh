#!/bin/bash
# planning-with-files: Stop hook for Codex

HOOK_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
PLAN_DIR="$(sh "${HOOK_DIR}/resolve-active-plan-dir.sh" 2>/dev/null)"
PLAN_FILE="${PLAN_DIR:+${PLAN_DIR}/}task_plan.md"
CHECK_COMPLETE="${HOOK_DIR}/../../scripts/check-complete.sh"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 || command -v python)}"

if [ ! -f "$PLAN_FILE" ] || [ ! -f "$CHECK_COMPLETE" ] || [ -z "$PYTHON_BIN" ]; then
    exit 0
fi

CHECK_OUTPUT="$(bash "$CHECK_COMPLETE" "$PLAN_FILE" 2>/dev/null || true)"
[ -n "$CHECK_OUTPUT" ] || exit 0

"$PYTHON_BIN" - <<'PY' "$CHECK_OUTPUT"
import json
import sys

print(json.dumps({"followup_message": sys.argv[1]}, ensure_ascii=False))
PY
exit 0
