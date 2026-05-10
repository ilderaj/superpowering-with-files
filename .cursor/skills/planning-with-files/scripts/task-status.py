#!/usr/bin/env python3
"""Report lifecycle status for a planning-with-files active task."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from companion_sync import inspect_companion_sync
import planning_paths
from task_lifecycle import format_summary, inspect_plan_dir


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_path", nargs="?", default=".")
    parser.add_argument("task_id", nargs="?", default=None)
    parser.add_argument("--json", action="store_true", help="emit JSON")
    parser.add_argument(
        "--require-safe-to-archive",
        action="store_true",
        help="exit non-zero unless the task is explicitly safe to archive",
    )
    parser.add_argument(
        "--require-companion-synced",
        action="store_true",
        help="exit non-zero unless companion lifecycle metadata is synchronized",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    project_path = Path(args.project_path).resolve()
    plan_dir = planning_paths.active_dir(project_path, args.task_id)
    status = inspect_plan_dir(plan_dir)
    status["companion"] = inspect_companion_sync(
        project_path,
        plan_dir.name,
        require_lifecycle=status["status"] if status["exists"] else None,
    )

    if args.json:
        print(json.dumps(status, ensure_ascii=False, indent=2))
    else:
        print(format_summary(status))
        if status["companion"]["has_companion"]:
            print(
                "[planning-with-files] Companion sync="
                f"{'ok' if status['companion']['ok'] else 'needs_attention'} "
                f"(path={status['companion']['companion_path']})"
            )
            for reason in status["companion"]["reasons"]:
                print(f"[planning-with-files] Companion sync error: {reason}")

    if args.require_safe_to_archive and not status["safe_to_archive"]:
        return 2
    if args.require_companion_synced and status["companion"]["has_companion"] and not status["companion"]["ok"]:
        return 3

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
