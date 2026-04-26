#!/usr/bin/env python3
"""Shared companion-plan sync helpers for planning lifecycle scripts."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable

import planning_paths


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="replace")


def _normalize_value(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if normalized.startswith("`") and normalized.endswith("`") and len(normalized) >= 2:
        normalized = normalized[1:-1].strip()
    return normalized


def parse_field(markdown: str, labels: str | Iterable[str]) -> str | None:
    if isinstance(labels, str):
        labels = [labels]

    for label in labels:
        match = re.search(
            rf"^\s*(?:[-*]\s*)?{re.escape(label)}\s*:\s*(.*?)\s*$",
            markdown,
            re.MULTILINE | re.IGNORECASE,
        )
        if match:
            return _normalize_value(match.group(1))
    return None


def inspect_companion_sync(
    project_path: Path,
    task_id: str,
    require_lifecycle: str | None = None,
    require_active_task_path: str | None = None,
) -> dict:
    plan_dir = planning_paths.active_dir(project_path, task_id)
    task_plan = plan_dir / "task_plan.md"
    if not task_plan.exists():
        return {
            "has_companion": False,
            "ok": True,
            "reasons": [],
            "companion_path": None,
            "companion_file": None,
        }
    task_text = read_text(task_plan)
    companion_path = parse_field(task_text, ["Companion plan", "Companion plan path"])
    if not companion_path:
        return {"has_companion": False, "ok": True, "reasons": []}

    companion_file = project_path / companion_path
    reasons: list[str] = []
    if not companion_file.exists():
        reasons.append(f"Companion plan does not exist: {companion_path}")
        return {
            "has_companion": True,
            "ok": False,
            "reasons": reasons,
            "companion_path": companion_path,
            "companion_file": str(companion_file),
        }

    companion_text = read_text(companion_file)
    task_sync_status = parse_field(task_text, "Sync-back status")
    if not parse_field(task_text, "Companion summary"):
        reasons.append("Active task is missing Companion summary")
    if not task_sync_status:
        reasons.append("Active task is missing Sync-back status")

    active_task_path = parse_field(companion_text, "Active task path")
    lifecycle_state = parse_field(companion_text, "Lifecycle state")
    companion_sync_status = parse_field(companion_text, "Sync-back status")
    if not active_task_path:
        reasons.append("Companion plan is missing Active task path")
    if not lifecycle_state:
        reasons.append("Companion plan is missing Lifecycle state")
    if not companion_sync_status:
        reasons.append("Companion plan is missing Sync-back status")

    expected_task_path = require_active_task_path or f"{planning_paths.ACTIVE_ROOT.as_posix()}/{task_id}/"
    if active_task_path and active_task_path != expected_task_path:
        reasons.append(
            f"Companion plan Active task path {active_task_path!r} does not match expected {expected_task_path!r}"
        )
    if require_lifecycle and lifecycle_state and lifecycle_state != require_lifecycle:
        reasons.append(
            f"Companion plan Lifecycle state {lifecycle_state!r} does not match expected {require_lifecycle!r}"
        )
    if task_sync_status and companion_sync_status and companion_sync_status != task_sync_status:
        reasons.append(
            "Companion plan Sync-back status "
            f"{companion_sync_status!r} does not match active task {task_sync_status!r}"
        )

    return {
        "has_companion": True,
        "ok": len(reasons) == 0,
        "reasons": reasons,
        "companion_path": companion_path,
        "companion_file": str(companion_file),
        "active_task_path": active_task_path,
        "expected_active_task_path": expected_task_path,
        "task_sync_status": task_sync_status,
        "companion_lifecycle_state": lifecycle_state,
        "companion_sync_status": companion_sync_status,
        "required_lifecycle": require_lifecycle,
    }


def replace_field(markdown: str, label: str, value: str) -> str:
    pattern = re.compile(
        rf"^(\s*(?:[-*]\s*)?){re.escape(label)}\s*:\s*.*$",
        re.MULTILINE | re.IGNORECASE,
    )
    replacement = rf"\1{label}: {value}"
    if pattern.search(markdown):
        return pattern.sub(replacement, markdown, count=1)
    return markdown.rstrip() + f"\n- {label}: {value}\n"


def sync_close_state(
    project_path: Path,
    task_id: str,
    closed_at: str,
    reason: str,
    task_text: str | None = None,
) -> None:
    plan_dir = planning_paths.active_dir(project_path, task_id)
    task_plan = plan_dir / "task_plan.md"
    if task_text is None:
        task_text = read_text(task_plan)
    companion_path = parse_field(task_text, ["Companion plan", "Companion plan path"])
    if not companion_path:
        return

    sync_status = f"closed at {closed_at}: {reason}"
    companion_file = project_path / companion_path
    companion_original_text = read_text(companion_file)
    companion_text = replace_field(companion_original_text, "Lifecycle state", "closed")
    companion_text = replace_field(companion_text, "Sync-back status", sync_status)

    original_task_text = task_text
    task_text = replace_field(task_text, "Sync-back status", sync_status)
    try:
        task_plan.write_text(task_text, encoding="utf-8")
        companion_file.write_text(companion_text, encoding="utf-8")
    except Exception:
        if task_plan.exists():
            task_plan.write_text(original_task_text, encoding="utf-8")
        if companion_file.exists():
            companion_file.write_text(companion_original_text, encoding="utf-8")
        raise


def rewrite_task_companion_path(task_plan: Path, companion_path: str, task_text: str | None = None) -> None:
    if task_text is None:
        task_text = read_text(task_plan)
    task_text = replace_field(task_text, "Companion plan", f"`{companion_path}`")
    task_plan.write_text(task_text, encoding="utf-8")


def sync_archive_state(
    companion_file: Path,
    archived_task_path: str,
    archived_at: str,
    reason: str = "moved companion plan into archive",
) -> None:
    sync_status = f"archived at {archived_at}: {reason}"
    companion_text = read_text(companion_file)
    companion_text = replace_field(companion_text, "Active task path", f"`{archived_task_path}`")
    companion_text = replace_field(companion_text, "Lifecycle state", "archived")
    companion_text = replace_field(companion_text, "Sync-back status", sync_status)
    companion_file.write_text(companion_text, encoding="utf-8")
