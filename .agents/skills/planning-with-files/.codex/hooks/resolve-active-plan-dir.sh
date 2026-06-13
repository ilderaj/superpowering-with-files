#!/bin/sh
# planning-with-files: resolve the current active plan directory for Codex hooks.
#
# Resolution order:
#   1. Canonical planning/active/<task-id>/ via planning_paths.py active-dir
#   2. Newest planning/active/<task-id>/ containing task_plan.md
#   3. Legacy .planning/<slug>/ via resolve-plan-dir.sh
#   4. Otherwise empty stdout (caller falls back to legacy ./task_plan.md)

set -u

HOOK_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 || command -v python)}"
PLANNING_PATHS="${HOOK_DIR}/../../scripts/planning_paths.py"
ACTIVE_ROOT="$(pwd)/planning/active"

resolve_latest_active_dir() {
    [ -d "${ACTIVE_ROOT}" ] || return 1

    latest=""
    latest_mtime=0
    for entry in "${ACTIVE_ROOT}"/*/; do
        [ -d "${entry}" ] || continue
        clean="${entry%/}"
        [ -f "${clean}/task_plan.md" ] || continue
        mtime="$(date -r "${clean}" +%s 2>/dev/null || stat -c '%Y' "${clean}" 2>/dev/null || echo 0)"
        if [ "${mtime}" -gt "${latest_mtime}" ] 2>/dev/null; then
            latest_mtime="${mtime}"
            latest="${clean}"
        fi
    done

    if [ -n "${latest}" ]; then
        printf "%s\n" "${latest}"
        return 0
    fi

    return 1
}

if [ -n "${PYTHON_BIN}" ] && [ -f "${PLANNING_PATHS}" ]; then
    PLAN_DIR="$("${PYTHON_BIN}" "${PLANNING_PATHS}" active-dir "$(pwd)" 2>/dev/null || true)"
    if [ -n "${PLAN_DIR}" ] && [ -f "${PLAN_DIR}/task_plan.md" ]; then
        printf "%s\n" "${PLAN_DIR}"
        exit 0
    fi
fi

if resolve_latest_active_dir; then
    exit 0
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
