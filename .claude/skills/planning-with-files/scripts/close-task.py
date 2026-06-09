#!/usr/bin/env python3
"""Mark a planning-with-files active task as closed and archive eligible."""

from __future__ import annotations

import argparse
import re
from datetime import datetime
from pathlib import Path

from companion_sync import inspect_companion_sync, read_text, sync_close_state
import planning_paths


CURRENT_STATE_TEMPLATE = """## Current State
Status: closed
Archive Eligible: yes
Close Reason: {reason}
Closed At: {closed_at}
Reconcile: {reconcile}
"""

READY_RECONCILIATION_STATES = {"complete", "not_required", "waived"}


def _normalize_reconciliation_value(value: str | None) -> str:
    if not value:
        return ""

    normalized = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    if normalized.startswith(("not_required", "not_require", "not_needed", "none")):
        return "not_required"
    if normalized.startswith(("complete", "completed", "done")):
        return "complete"
    if normalized.startswith(("waived", "waiver")):
        return "waived"
    if normalized.startswith(("open", "pending", "todo", "unknown", "not_ready")):
        return "open"
    return ""


def _archive_readiness_status(reconciliation_markdown: str) -> str:
    section_match = re.search(
        r"^##\s+Archive Readiness\s*$([\s\S]*?)(?=^##\s+|\Z)",
        reconciliation_markdown,
        flags=re.MULTILINE,
    )
    section = section_match.group(1).strip() if section_match else ""
    if not section:
        return ""

    for raw_line in section.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        normalized = re.sub(r"[^a-z0-9]+", "_", line.lower()).strip("_")
        if not normalized or "ready_not_ready" in normalized or "not_ready_ready" in normalized:
            continue
        if normalized.startswith(("not_ready", "open", "pending", "todo", "unknown")):
            return "open"
        if re.match(r"^(?:[-*]\s*)?(?:\[[xX]\]\s*)?Ready\b", line, flags=re.IGNORECASE):
            return "complete"

    return ""


def resolve_reconcile_state(plan_dir: Path, markdown: str) -> str:
    field_match = re.search(
        r"^\s*(?:[-*]\s*)?Reconcile\s*:\s*(.*?)\s*$",
        markdown,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    current_state = _normalize_reconciliation_value(field_match.group(1).strip() if field_match else None)
    if current_state in READY_RECONCILIATION_STATES:
        return current_state

    artifact_path = plan_dir / "reconciliation.md"
    if artifact_path.exists():
        artifact_state = _archive_readiness_status(read_text(artifact_path))
        if artifact_state == "open":
            return "open"
        if artifact_state == "complete":
            return "complete"

    return "complete"


def update_current_state(markdown: str, reason: str, closed_at: str, reconcile: str) -> str:
    block = CURRENT_STATE_TEMPLATE.format(
        reason=reason,
        closed_at=closed_at,
        reconcile=reconcile,
    ).rstrip()
    pattern = re.compile(r"^##\s+Current State\s*$[\s\S]*?(?=^##\s+|\Z)", re.MULTILINE)

    if pattern.search(markdown):
        return pattern.sub(block + "\n\n", markdown, count=1)

    goal_match = re.search(r"^##\s+Goal\s*$[\s\S]*?(?=^##\s+|\Z)", markdown, re.MULTILINE)
    if goal_match:
        insert_at = goal_match.end()
        return markdown[:insert_at].rstrip() + "\n\n" + block + "\n\n" + markdown[insert_at:].lstrip()

    return block + "\n\n" + markdown


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_path", nargs="?", default=".")
    parser.add_argument("task_id", nargs="?", default=None)
    parser.add_argument("--reason", default="Task completed and verified.")
    args = parser.parse_args()

    project_path = Path(args.project_path).resolve()
    plan_dir = planning_paths.active_dir(project_path, args.task_id)
    task_id = plan_dir.name
    task_plan = plan_dir / "task_plan.md"

    if not task_plan.exists():
        print(f"[planning-with-files] task_plan.md not found: {task_plan}")
        return 1

    sync_status = inspect_companion_sync(project_path, task_id)
    if sync_status["has_companion"] and not sync_status["ok"]:
        for reason in sync_status["reasons"]:
            print(f"[planning-with-files] Companion sync error: {reason}")
        return 2

    closed_at = datetime.now().isoformat(timespec="seconds")
    current_markdown = read_text(task_plan)
    reconcile = resolve_reconcile_state(plan_dir, current_markdown)
    updated = update_current_state(current_markdown, args.reason, closed_at, reconcile)
    if sync_status["has_companion"]:
        sync_close_state(project_path, task_id, closed_at, args.reason, updated)
    else:
        task_plan.write_text(updated, encoding="utf-8")
    print(f"[planning-with-files] Closed task and marked archive eligible: {plan_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
