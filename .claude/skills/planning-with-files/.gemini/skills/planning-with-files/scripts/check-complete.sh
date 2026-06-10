#!/usr/bin/env bash
# Report completion and lifecycle readiness for the active planning task.
# Always exits 0 because incomplete tasks are a normal state.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON_BIN="$(command -v python3 || command -v python)"

if [ -z "$PYTHON_BIN" ]; then
    echo "[planning-with-files] Python is required to check planning task status."
    exit 0
fi

PLAN_FILE=""
if [ $# -gt 0 ] && [ -n "${1:-}" ]; then
    PLAN_FILE="$1"
else
    PLAN_DIR=""
    RESOLVER="$SCRIPT_DIR/resolve-plan-dir.sh"
    if [ -f "$RESOLVER" ]; then
        PLAN_DIR="$(sh "$RESOLVER" 2>/dev/null || true)"
    fi
    if [ -z "$PLAN_DIR" ]; then
        PLAN_DIR="$("$PYTHON_BIN" "$SCRIPT_DIR/planning_paths.py" active-dir "$(pwd)" 2>/dev/null || true)"
    fi
    if [ -n "$PLAN_DIR" ] && [ -f "$PLAN_DIR/task_plan.md" ]; then
        PLAN_FILE="$PLAN_DIR/task_plan.md"
    elif [ -f "task_plan.md" ]; then
        PLAN_FILE="task_plan.md"
    fi
fi

if [ -z "$PLAN_FILE" ] || [ ! -f "$PLAN_FILE" ]; then
    echo "[planning-with-files] No task_plan.md found — no active planning session."
    exit 0
fi

"$PYTHON_BIN" - <<'PY' "$PLAN_FILE" "$SCRIPT_DIR"
import sys
from pathlib import Path

sys.path.insert(0, sys.argv[2])

from task_lifecycle import format_summary, inspect_plan_dir

plan_file = Path(sys.argv[1]).resolve()
status = inspect_plan_dir(plan_file.parent)

if status.get("safe_to_archive") and status.get("looks_complete"):
    print(
        "[planning-with-files] ALL PHASES COMPLETE "
        f"({status['phase_complete']}/{status['phase_total']}). "
        "If the user has additional work, add new phases to task_plan.md before starting."
    )
else:
    print(format_summary(status))
PY
exit 0
