#!/usr/bin/env python3
"""
Resolve planning-with-files paths for task-scoped storage.

One active task directory lives at planning/active/<task-id>/.
Archived task directories live at planning/archive/.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

from task_lifecycle import inspect_plan_dir

PLANNING_FILES = ("task_plan.md", "findings.md", "progress.md")
ACTIVE_ROOT = Path("planning") / "active"
ARCHIVE_ROOT = Path("planning") / "archive"


def sanitize_task_id(raw: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", raw.strip())
    slug = re.sub(r"-{2,}", "-", slug).strip("-._")
    return slug[:80] or "default"


def git_branch(project_path: Path) -> Optional[str]:
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=project_path,
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return None

    branch = result.stdout.strip()
    return branch or None


def resolve_task_id(project_path: Path, explicit: Optional[str] = None) -> str:
    for candidate in (
        explicit,
        os.getenv("PLANNING_TASK_ID"),
        os.getenv("CODEX_THREAD_ID"),
        os.getenv("CLAUDE_SESSION_ID"),
        git_branch(project_path),
        "default",
    ):
        if candidate:
            return sanitize_task_id(candidate)
    return "default"


def legacy_planning_exists(project_path: Path) -> bool:
    return any((project_path / name).exists() for name in PLANNING_FILES)


def active_dir(project_path: Path, task_id: Optional[str] = None) -> Path:
    return project_path / ACTIVE_ROOT / resolve_task_id(project_path, task_id)


def resolve_plan_dir(project_path: Path, task_id: Optional[str] = None) -> Path:
    plan_dir = active_dir(project_path, task_id)
    if plan_dir.exists():
        return plan_dir

    active_root = project_path / ACTIVE_ROOT
    if task_id or os.getenv("PLANNING_TASK_ID") or os.getenv("CODEX_THREAD_ID") or active_root.exists():
        return plan_dir

    if legacy_planning_exists(project_path):
        return project_path

    return plan_dir


def planning_file_map(project_path: Path, task_id: Optional[str] = None) -> Dict[str, str]:
    plan_dir = resolve_plan_dir(project_path, task_id)
    return {name: str(plan_dir / name) for name in PLANNING_FILES}


def ensure_active_layout(project_path: Path, task_id: Optional[str] = None) -> Path:
    plan_dir = active_dir(project_path, task_id)
    plan_dir.mkdir(parents=True, exist_ok=True)
    (project_path / ARCHIVE_ROOT).mkdir(parents=True, exist_ok=True)
    return plan_dir


def archive_active_task(project_path: Path, task_id: Optional[str] = None) -> Path:
    from companion_sync import (
        inspect_companion_sync,
        read_text,
        rewrite_task_companion_path,
        sync_archive_state,
    )

    source_dir = active_dir(project_path, task_id)
    if not source_dir.exists():
        raise FileNotFoundError(f"active planning directory does not exist: {source_dir}")

    status = inspect_plan_dir(source_dir)
    if not status["safe_to_archive"]:
        raise RuntimeError(
            "active planning directory is not safe to archive: "
            f"{source_dir} ({status['reason']})"
        )

    companion_status = inspect_companion_sync(project_path, source_dir.name, require_lifecycle="closed")
    if companion_status["has_companion"] and not companion_status["ok"]:
        raise RuntimeError(
            "companion lifecycle metadata must be synchronized before archiving: "
            + "; ".join(companion_status["reasons"])
        )

    companion_source = None
    companion_original_text = None
    task_plan_original_text = None
    if companion_status["has_companion"]:
        companion_source = Path(companion_status["companion_file"])
        companion_original_text = read_text(companion_source)
        task_plan_original_text = read_text(source_dir / "task_plan.md")

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    archive_dir = project_path / ARCHIVE_ROOT / f"{timestamp}-{source_dir.name}"
    archive_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source_dir), str(archive_dir))

    try:
        if companion_status["has_companion"]:
            archived_companion = archive_dir / "companion_plan.md"
            assert companion_source is not None
            shutil.move(str(companion_source), str(archived_companion))

            archived_task_plan = archive_dir / "task_plan.md"
            archived_task_relative = archive_dir.relative_to(project_path).as_posix() + "/"
            archived_companion_relative = archived_companion.relative_to(project_path).as_posix()
            rewrite_task_companion_path(archived_task_plan, archived_companion_relative)
            sync_archive_state(
                archived_companion,
                archived_task_relative,
                datetime.now().isoformat(timespec="seconds"),
            )
    except Exception:
        if archive_dir.exists():
            shutil.move(str(archive_dir), str(source_dir))
            orphan_companion = source_dir / "companion_plan.md"
            if orphan_companion.exists():
                orphan_companion.unlink()

        if companion_source is not None and companion_original_text is not None:
            companion_source.parent.mkdir(parents=True, exist_ok=True)
            companion_source.write_text(companion_original_text, encoding="utf-8")

        if task_plan_original_text is not None:
            (source_dir / "task_plan.md").write_text(task_plan_original_text, encoding="utf-8")
        raise

    return archive_dir


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: planning_paths.py <command> [project_path] [task_id]", file=sys.stderr)
        return 1

    command = sys.argv[1]
    project_path = Path(sys.argv[2]).resolve() if len(sys.argv) >= 3 else Path.cwd().resolve()
    task_id = sys.argv[3] if len(sys.argv) >= 4 else None

    if command == "task-id":
        print(resolve_task_id(project_path, task_id))
        return 0
    if command == "active-dir":
        print(resolve_plan_dir(project_path, task_id))
        return 0
    if command == "ensure-active-dir":
        print(ensure_active_layout(project_path, task_id))
        return 0
    if command == "files-json":
        print(json.dumps(planning_file_map(project_path, task_id)))
        return 0
    if command == "archive-active":
        print(archive_active_task(project_path, task_id))
        return 0

    print(f"unknown command: {command}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
