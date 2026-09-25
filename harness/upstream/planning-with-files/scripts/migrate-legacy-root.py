#!/usr/bin/env python3
"""
Migrate legacy project-root planning files into task-scoped storage.

Usage:
  python migrate-legacy-root.py <project_path> [mode] [task_id]

Modes:
  active  - move root trio into planning/active/<task-id>/
  archive - move root trio into planning/archive/<timestamp>-<task-id>/
  auto    - archive if complete, else active (default)
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from planning_paths import archive_active_task, ensure_active_layout, resolve_task_id

PLANNING_FILES = ("task_plan.md", "findings.md", "progress.md")


def root_files(project_path: Path) -> dict[str, Path]:
    return {name: project_path / name for name in PLANNING_FILES}


def has_legacy_root(project_path: Path) -> bool:
    files = root_files(project_path)
    return any(path.exists() for path in files.values())


def is_complete(project_path: Path) -> bool:
    plan = project_path / "task_plan.md"
    if not plan.exists():
        return False

    script = Path(__file__).resolve().parent / "check-complete.sh"
    result = subprocess.run(
        ["bash", str(script), str(plan)],
        check=False,
        capture_output=True,
        text=True,
    )
    return "ALL PHASES COMPLETE" in result.stdout


def move_root_to_active(project_path: Path, task_id: str) -> Path:
    target_dir = ensure_active_layout(project_path, task_id)
    for name, source in root_files(project_path).items():
        if source.exists():
            shutil.move(str(source), str(target_dir / name))
    return target_dir


def move_root_to_archive(project_path: Path, task_id: str) -> Path:
    staging_dir = move_root_to_active(project_path, task_id)
    return archive_active_task(project_path, task_id)


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: migrate-legacy-root.py <project_path> [mode] [task_id]", file=sys.stderr)
        return 1

    project_path = Path(sys.argv[1]).resolve()
    mode = sys.argv[2] if len(sys.argv) >= 3 else "auto"
    explicit_task_id = sys.argv[3] if len(sys.argv) >= 4 else None

    if not has_legacy_root(project_path):
        print(f"[planning-with-files] No legacy root planning files found in: {project_path}")
        return 0

    task_id = resolve_task_id(project_path, explicit_task_id)
    if mode == "auto":
        mode = "archive" if is_complete(project_path) else "active"

    if mode == "active":
        target = move_root_to_active(project_path, task_id)
        print(f"[planning-with-files] Migrated legacy root planning files to active dir: {target}")
        return 0

    if mode == "archive":
        target = move_root_to_archive(project_path, task_id)
        print(f"[planning-with-files] Migrated legacy root planning files to archive dir: {target}")
        return 0

    print(f"unknown mode: {mode}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
