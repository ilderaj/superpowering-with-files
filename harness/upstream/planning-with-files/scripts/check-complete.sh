#!/bin/bash
# Report completion and archive eligibility for the active task.
# Always exits 0 because incomplete tasks are a normal state.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON_BIN="$(command -v python3 || command -v python)"

if [ -z "$PYTHON_BIN" ]; then
    echo "[planning-with-files] Python is required to check planning task status."
    exit 0
fi

if [ $# -gt 0 ] && [ -n "${1:-}" ]; then
    PLAN_FILE="$1"
    if [ ! -f "$PLAN_FILE" ]; then
        echo "[planning-with-files] No task_plan.md found -- no active planning session."
        exit 0
    fi
    "$PYTHON_BIN" -c 'import sys; from pathlib import Path; sys.path.insert(0, sys.argv[2]); from task_lifecycle import format_summary, inspect_plan_dir; print(format_summary(inspect_plan_dir(Path(sys.argv[1]).resolve().parent)))' "$PLAN_FILE" "$SCRIPT_DIR"
    exit 0
fi

"$PYTHON_BIN" "$SCRIPT_DIR/task-status.py" "$(pwd)"
exit 0
