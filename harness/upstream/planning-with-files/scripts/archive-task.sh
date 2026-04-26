#!/bin/bash
# Archive the active planning directory for the current task.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_PATH="${1:-$(pwd)}"
TASK_ID="${2:-}"
PYTHON_BIN="$(command -v python3 || command -v python)"

if [ -z "$PYTHON_BIN" ]; then
    echo "[planning-with-files] Python is required to archive planning files."
    exit 1
fi

"$PYTHON_BIN" "$SCRIPT_DIR/task-status.py" \
    "$PROJECT_PATH" \
    "$TASK_ID" \
    --require-safe-to-archive \
    --require-companion-synced
ARCHIVE_DIR="$("$PYTHON_BIN" "$SCRIPT_DIR/planning_paths.py" archive-active "$PROJECT_PATH" "$TASK_ID")"
echo "[planning-with-files] Archived active planning files to: $ARCHIVE_DIR"
