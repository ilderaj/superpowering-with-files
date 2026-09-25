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
THREAD_BINDINGS_ROOT = Path(".harness") / "planning-with-files" / "thread-bindings"
SAFE_THREAD_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
TASK_ID_RE = re.compile(r"^Task ID:\s*([A-Za-z0-9][A-Za-z0-9._-]{0,79})\s*$", re.MULTILINE)


def stable_task_id(plan_dir: Path) -> str:
    text = (plan_dir / "task_plan.md").read_text(encoding="utf-8")
    matches = TASK_ID_RE.findall(text)
    if len(matches) > 1:
        raise RuntimeError(f"task_plan.md contains duplicate Task ID fields: {plan_dir}")
    if not matches:
        raise RuntimeError(f"task_plan.md must contain an explicit stable Task ID: {plan_dir}")
    return matches[0]


def stage_lifecycle_sync(project_path: Path, task_id: str, plan_dir: Path, event: str) -> str:
    try:
        from linear_lifecycle_sync import stage_lifecycle_sync as sync
        result = sync(project_path, task_id, plan_dir, event)
        return str(result or "ok")
    except ModuleNotFoundError:
        return "linear lifecycle sync unavailable"
    except Exception as error:
        return f"linear lifecycle sync failed: {error}"


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


def thread_binding_path(project_path: Path, thread_id: str) -> Path:
    if not SAFE_THREAD_ID_RE.match(thread_id):
        raise ValueError(f"invalid thread id: {thread_id!r}")
    return project_path / THREAD_BINDINGS_ROOT / f"{thread_id}.json"


def read_thread_binding(project_path: Path, thread_id: str) -> Optional[Path]:
    binding_file = thread_binding_path(project_path, thread_id)
    if not binding_file.exists():
        return None

    try:
        payload = json.loads(binding_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None

    task_id = payload.get("taskId")
    if not isinstance(task_id, str) or not task_id.strip():
        return None

    task_dir = active_dir(project_path, task_id)
    task_plan = task_dir / "task_plan.md"
    if not task_plan.exists():
        return None

    status = inspect_plan_dir(task_dir).get("status")
    return task_dir if status == "active" else None


def binding_status(project_path: Path, thread_id: str) -> str:
    binding_file = thread_binding_path(project_path, thread_id)
    if not binding_file.exists():
        return ""

    return "thread-binding" if read_thread_binding(project_path, thread_id) is not None else "stale-binding"


def clear_thread_binding(project_path: Path, thread_id: str) -> None:
    binding_file = thread_binding_path(project_path, thread_id)
    binding_file.unlink(missing_ok=True)


def write_thread_binding(project_path: Path, task_id: str, thread_id: str) -> Path:
    task_dir = active_dir(project_path, task_id)
    if not (task_dir / "task_plan.md").exists():
        raise FileNotFoundError(f"task_plan.md not found for task: {task_id}")

    if inspect_plan_dir(task_dir).get("status") != "active":
        raise RuntimeError(f"task is not active: {task_id}")

    binding_file = thread_binding_path(project_path, thread_id)
    binding_file.parent.mkdir(parents=True, exist_ok=True)
    binding_file.write_text(
        json.dumps({"schemaVersion": 1, "taskId": task_dir.name}, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return task_dir


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
    task_plan = source_dir / "task_plan.md"
    text = task_plan.read_text(encoding="utf-8")
    needs_migration = False
    try:
        stable_id = stable_task_id(source_dir)
    except RuntimeError as error:
        if "must contain an explicit stable Task ID" not in str(error):
            raise
        if re.search(r"^Task ID:", text, re.MULTILINE):
            raise
        stable_id = source_dir.name
        if not TASK_ID_RE.fullmatch("Task ID: " + stable_id):
            raise RuntimeError(f"legacy task basename is unsafe as stable Task ID: {stable_id}") from error
        needs_migration = True
    if task_id and task_id != stable_id:
        raise RuntimeError(f"requested task id {task_id!r} does not match stable Task ID {stable_id!r}")

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
    archive_dir = project_path / ARCHIVE_ROOT / f"{timestamp}-{stable_id}"
    if archive_dir.exists():
        raise FileExistsError(f"archive collision: {archive_dir}")
    archive_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source_dir), str(archive_dir))

    try:
        # Move first; legacy identity migration is rolled back with the move
        # transaction if any publication step fails.
        if needs_migration:
            (archive_dir / "task_plan.md").write_text("Task ID: " + stable_id + "\n" + text, encoding="utf-8")
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

    stage_lifecycle_sync(project_path, stable_id, archive_dir, "archive")
    return archive_dir


def reopen_task(project_path: Path, target: str) -> Path:
    candidate = Path(target).expanduser()
    if not candidate.is_absolute():
        candidate = project_path / candidate
    candidate = candidate.absolute()
    if candidate.is_symlink() or not candidate.is_dir():
        raise RuntimeError(f"reopen target must be a real directory: {candidate}")
    candidate = candidate.resolve()
    project_root = project_path.absolute()
    try:
        relative = Path(os.path.relpath(candidate, project_root))
        if str(relative).startswith(".."):
            raise ValueError
    except ValueError as error:
        raise RuntimeError("reopen target must be inside the project") from error
    parts = relative.parts
    if len(parts) != 3 or parts[:2] not in (("planning", "archive"), ("planning", "active")):
        raise RuntimeError("reopen target must be an exact planning/archive or planning/active task path")
    cursor = project_root
    for component in parts:
        cursor /= component
        if cursor.is_symlink():
            raise RuntimeError(f"reopen path contains a symlink: {cursor}")
    if inspect_plan_dir(candidate)["status"] != "closed":
        raise RuntimeError("reopen requires a closed Current State")
    for name in ("task_plan.md", "findings.md", "progress.md", "companion_plan.md"):
        if (candidate / name).is_symlink():
            raise RuntimeError("reopen rejects symlink planning files")
    stable_id = stable_task_id(candidate)
    active = project_path / ACTIVE_ROOT / stable_id
    if active.exists() and active != candidate:
        raise RuntimeError(f"ambiguous duplicate identity: active task already exists at {active}")
    moved = candidate != active
    if moved:
        active.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(candidate), str(active))
    task_plan = active / "task_plan.md"
    original_plan = task_plan.read_text(encoding="utf-8")
    companion = active / "companion_plan.md"
    original_companion = companion.read_text(encoding="utf-8") if companion.exists() else None
    try:
        def reopen_block(match):
            block = re.sub(r"^Status:[ \t]*.*$", "Status: active", match.group(0), count=1, flags=re.MULTILINE)
            block = re.sub(r"^Archive Eligible:[ \t]*.*$", "Archive Eligible: no", block, count=1, flags=re.MULTILINE)
            return re.sub(r"^(Close Reason|Closed At):.*\n?", "", block, flags=re.MULTILINE)
        text, changed = re.subn(r"^##\s+Current State\s*$[\s\S]*?(?=^## |\Z)", reopen_block, original_plan, count=1, flags=re.MULTILINE)
        if changed != 1 or not re.search(r"^Status:[ \t]*active\s*$", text, flags=re.MULTILINE):
            raise RuntimeError("reopen could not update exactly one Current State block")
        if companion.exists():
            text = re.sub(r"^\s*(?:[-*]\s*)?Companion plan\s*:\s*.*$", "- Companion plan: `planning/active/%s/companion_plan.md`" % stable_id, text, count=1, flags=re.MULTILINE | re.IGNORECASE)
            companion_text = original_companion
            companion_text = re.sub(r"^\s*(?:[-*]\s*)?Active task path\s*:\s*.*$", "- Active task path: `planning/active/%s/`" % stable_id, companion_text, count=1, flags=re.MULTILINE | re.IGNORECASE)
            companion_text = re.sub(r"^\s*(?:[-*]\s*)?Lifecycle state\s*:\s*.*$", "- Lifecycle state: active", companion_text, count=1, flags=re.MULTILINE | re.IGNORECASE)
            companion.write_text(companion_text, encoding="utf-8")
        task_plan.write_text(text, encoding="utf-8")
        stage_lifecycle_sync(project_path, stable_id, active, "reopen")
        return active
    except Exception:
        task_plan.write_text(original_plan, encoding="utf-8")
        if original_companion is not None:
            companion.write_text(original_companion, encoding="utf-8")
        if moved:
            shutil.move(str(active), str(candidate))
        raise


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
    if command == "bound-task":
        if len(sys.argv) < 4:
            print("usage: planning_paths.py bound-task <project_path> <thread_id>", file=sys.stderr)
            return 1
        bound_dir = read_thread_binding(project_path, sys.argv[3])
        if bound_dir is not None:
            print(bound_dir)
        return 0
    if command == "bind-thread":
        if len(sys.argv) < 5:
            print(
                "usage: planning_paths.py bind-thread <project_path> <task_id> <thread_id>",
                file=sys.stderr,
            )
            return 1
        print(write_thread_binding(project_path, task_id or "", sys.argv[4]))
        return 0
    if command == "binding-status":
        if len(sys.argv) < 4:
            print("usage: planning_paths.py binding-status <project_path> <thread_id>", file=sys.stderr)
            return 1
        status = binding_status(project_path, sys.argv[3])
        if status:
            print(status)
        return 0
    if command == "clear-thread-binding":
        if len(sys.argv) < 4:
            print("usage: planning_paths.py clear-thread-binding <project_path> <thread_id>", file=sys.stderr)
            return 1
        clear_thread_binding(project_path, sys.argv[3])
        return 0
    if command == "archive-active":
        print(archive_active_task(project_path, task_id))
        return 0
    if command == "reopen":
        if len(sys.argv) < 4:
            print("usage: planning_paths.py reopen <project_path> <archive-or-closed-active-path>", file=sys.stderr)
            return 1
        print(reopen_task(project_path, sys.argv[3]))
        return 0

    print(f"unknown command: {command}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
