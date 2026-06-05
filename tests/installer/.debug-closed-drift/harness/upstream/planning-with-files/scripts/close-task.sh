#!/bin/bash
# Mark the active planning directory for the current task as closed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_PATH="${1:-$(pwd)}"
TASK_ID="${2:-}"
REASON="${3:-Task completed and verified.}"
PYTHON_BIN="$(command -v python3 || command -v python)"

if [ -z "$PYTHON_BIN" ]; then
    echo "[planning-with-files] Python is required to close planning tasks."
    exit 1
fi

"$PYTHON_BIN" "$SCRIPT_DIR/close-task.py" "$PROJECT_PATH" "$TASK_ID" --reason "$REASON"
