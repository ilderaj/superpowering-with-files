#!/bin/sh
# planning-with-files: resolve the current active plan directory for Codex hooks.
#
# Resolution order:
#   1. Canonical planning/active/<task-id>/ via planning_paths.py active-dir
#   2. Legacy .planning/<slug>/ via resolve-plan-dir.sh
#   3. Otherwise empty stdout (caller falls back to legacy ./task_plan.md)

set -u

HOOK_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 || command -v python)}"
PLANNING_PATHS="${HOOK_DIR}/../../scripts/planning_paths.py"

if [ -n "${PYTHON_BIN}" ] && [ -f "${PLANNING_PATHS}" ]; then
    PLAN_DIR="$("${PYTHON_BIN}" "${PLANNING_PATHS}" active-dir "$(pwd)" 2>/dev/null || true)"
    if [ -n "${PLAN_DIR}" ] && [ -f "${PLAN_DIR}/task_plan.md" ]; then
        printf "%s\n" "${PLAN_DIR}"
        exit 0
    fi
fi

LEGACY_RESOLVER="${HOOK_DIR}/resolve-plan-dir.sh"
if [ -f "${LEGACY_RESOLVER}" ]; then
    PLAN_DIR="$(sh "${LEGACY_RESOLVER}" 2>/dev/null || true)"
    if [ -n "${PLAN_DIR}" ] && [ -f "${PLAN_DIR}/task_plan.md" ]; then
        printf "%s\n" "${PLAN_DIR}"
        exit 0
    fi
fi

exit 0
