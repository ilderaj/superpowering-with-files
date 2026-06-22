#!/usr/bin/env bash
# Initialize planning files for the active task, or delegate to the canonical
# slug/v3 initializer when the caller is using the shipped skill entrypoint.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CANONICAL_INIT="${SCRIPT_DIR}/../skills/planning-with-files/scripts/init-session.sh"

looks_like_project_path() {
    case "${1:-}" in
        /*|./*|../*|~/*) return 0 ;;
    esac
    [ -d "${1:-}" ]
}

if [ "$#" -eq 2 ] && looks_like_project_path "${1:-}" && [ "${2#-}" = "${2:-}" ]; then
    PROJECT_PATH="$1"
    TASK_ID="$2"
    PYTHON_BIN="$(command -v python3 || command -v python)"

    if [ -z "$PYTHON_BIN" ]; then
        echo "[planning-with-files] Python is required to initialize planning files."
        exit 1
    fi

    TIMESTAMP="$("$PYTHON_BIN" "$SCRIPT_DIR/planning_record.py" timestamp)"
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
    exit 0
fi

if [ ! -f "$CANONICAL_INIT" ]; then
    echo "[planning-with-files] Canonical init-session.sh missing at $CANONICAL_INIT"
    exit 1
fi

exec bash "$CANONICAL_INIT" "$@"
