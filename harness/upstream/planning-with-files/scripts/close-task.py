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
"""

def update_current_state(markdown: str, reason: str, closed_at: str) -> str:
    block = CURRENT_STATE_TEMPLATE.format(reason=reason, closed_at=closed_at).rstrip()
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
    updated = update_current_state(read_text(task_plan), args.reason, closed_at)
    if sync_status["has_companion"]:
        sync_close_state(project_path, task_id, closed_at, args.reason, updated)
    else:
        task_plan.write_text(updated, encoding="utf-8")
    print(f"[planning-with-files] Closed task and marked archive eligible: {plan_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
