#!/bin/bash
# Initialize planning files for the active task.
# Usage: ./init-session.sh [project-path] [task-id]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_PATH="${1:-$(pwd)}"
TASK_ID="${2:-}"
TIMESTAMP="$(TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M:%S UTC+8')"
PYTHON_BIN="$(command -v python3 || command -v python)"

if [ -z "$PYTHON_BIN" ]; then
    echo "[planning-with-files] Python is required to initialize planning files."
    exit 1
fi

PLAN_DIR="$("$PYTHON_BIN" "$SCRIPT_DIR/planning_paths.py" ensure-active-dir "$PROJECT_PATH" "$TASK_ID")"
TASK_SLUG="$("$PYTHON_BIN" "$SCRIPT_DIR/planning_paths.py" task-id "$PROJECT_PATH" "$TASK_ID")"

echo "Initializing planning files for task: $TASK_SLUG"
echo "Active planning dir: $PLAN_DIR"

if [ ! -f "$PLAN_DIR/task_plan.md" ]; then
    cp "$SCRIPT_DIR/../templates/task_plan.md" "$PLAN_DIR/task_plan.md"
    {
        echo ""
        echo "## Task Metadata"
        echo "- Task ID: $TASK_SLUG"
        echo "- Planning Directory: $PLAN_DIR"
    } >> "$PLAN_DIR/task_plan.md"
    echo "Created $PLAN_DIR/task_plan.md"
else
    echo "$PLAN_DIR/task_plan.md already exists, skipping"
fi

if [ ! -f "$PLAN_DIR/findings.md" ]; then
    cp "$SCRIPT_DIR/../templates/findings.md" "$PLAN_DIR/findings.md"
    {
        echo ""
        echo "## Task Metadata"
        echo "- Task ID: $TASK_SLUG"
        echo "- Planning Directory: $PLAN_DIR"
    } >> "$PLAN_DIR/findings.md"
    echo "Created $PLAN_DIR/findings.md"
else
    echo "$PLAN_DIR/findings.md already exists, skipping"
fi

if [ ! -f "$PLAN_DIR/progress.md" ]; then
    sed -e "s/\\[TIMESTAMP\\]/$TIMESTAMP/g" -e "s/\\[DATE\\]/$TIMESTAMP/g" "$SCRIPT_DIR/../templates/progress.md" > "$PLAN_DIR/progress.md"
    {
        echo ""
        echo "## Task Metadata"
        echo "- Task ID: $TASK_SLUG"
        echo "- Planning Directory: $PLAN_DIR"
    } >> "$PLAN_DIR/progress.md"
    echo "Created $PLAN_DIR/progress.md"
else
    echo "$PLAN_DIR/progress.md already exists, skipping"
fi

echo ""
echo "Planning files initialized!"
echo "Files: $PLAN_DIR/task_plan.md, $PLAN_DIR/findings.md, $PLAN_DIR/progress.md"
