#!/usr/bin/env python3
"""Scan planning/active task directories and optionally archive closed tasks."""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import planning_paths
from task_lifecycle import inspect_plan_dir


def archive_plan_dir(project_path: Path, plan_dir: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    archive_dir = project_path / planning_paths.ARCHIVE_ROOT / f"{timestamp}-{plan_dir.name}"
    archive_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(plan_dir), str(archive_dir))
    return archive_dir


def scan(project_path: Path, archive_closed: bool) -> Dict[str, Any]:
    active_root = project_path / planning_paths.ACTIVE_ROOT
    results: List[Dict[str, Any]] = []
    archived: List[Dict[str, str]] = []

    if not active_root.exists():
        return {
            "project_path": str(project_path),
            "active_root": str(active_root),
            "tasks": [],
            "archived": [],
        }

    for plan_dir in sorted(path for path in active_root.iterdir() if path.is_dir()):
        status = inspect_plan_dir(plan_dir)
        if archive_closed and status["safe_to_archive"]:
            archive_dir = archive_plan_dir(project_path, plan_dir)
            status["archived_to"] = str(archive_dir)
            archived.append({"task_id": status["task_id"], "archive_dir": str(archive_dir)})
        results.append(status)

    return {
        "project_path": str(project_path),
        "active_root": str(active_root),
        "tasks": results,
        "archived": archived,
    }


def print_text(report: Dict[str, Any]) -> None:
    print(f"[planning-with-files] Active root: {report['active_root']}")
    if not report["tasks"]:
        print("[planning-with-files] No active planning tasks found.")
        return

    for task in report["tasks"]:
        marker = "ARCHIVE_OK" if task["safe_to_archive"] else "ACTIVE"
        if task.get("archived_to"):
            marker = "ARCHIVED"
        print(
            "[planning-with-files] "
            f"{marker} {task['task_id']}: "
            f"status={task['status']}, "
            f"archive_eligible={'yes' if task['archive_eligible'] else 'no'}, "
            f"phases={task['phase_complete']}/{task['phase_total']}, "
            f"reason={task['reason']}"
        )
        for warning in task.get("warnings", []):
            print(f"[planning-with-files]   warning: {warning}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_path", nargs="?", default=".")
    parser.add_argument("--json", action="store_true", help="emit JSON")
    parser.add_argument(
        "--archive-closed",
        action="store_true",
        help="move only tasks with Status: closed and Archive Eligible: yes",
    )
    args = parser.parse_args()

    report = scan(Path(args.project_path).resolve(), args.archive_closed)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_text(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
