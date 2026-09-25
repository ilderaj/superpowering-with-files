#!/usr/bin/env python3
"""Local-first lifecycle staging for existing Linear metadata."""
from __future__ import annotations

import json
import os
import re
import uuid
import subprocess
from datetime import datetime, timezone
from pathlib import Path

EVENTS = {"close", "archive", "reopen"}
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")


def _safe_path(project: Path, candidate: Path) -> Path:
    project = Path(os.path.abspath(project))
    current = candidate if candidate.is_absolute() else project / candidate
    current = current.absolute()
    raw_project = Path(os.path.abspath(project))
    try:
        relative = current.relative_to(raw_project)
        cursor = raw_project
    except ValueError:
        relative = current.relative_to(raw_project.resolve())
        cursor = raw_project.resolve()
    for part in relative.parts:
        cursor /= part
        if cursor.is_symlink():
            raise RuntimeError(f"symlink is not allowed: {cursor}")
    resolved = current.resolve()
    if os.path.commonpath((str(project.resolve()), str(resolved))) != str(project.resolve()):
        raise RuntimeError(f"path escapes project: {candidate}")
    return resolved


def _read_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:
        raise RuntimeError(f"corrupt Linear metadata: {path} ({error})") from error
    if not isinstance(value, dict):
        raise RuntimeError(f"Linear metadata must be an object: {path}")
    return value


def _metadata_path(project: Path, task_id: str, plan_dir: Path) -> Path:
    preferred = _safe_path(project, project / "reports" / "linear" / task_id / "linear.json")
    try:
        preferred.lstat()
    except FileNotFoundError:
        fallback = _safe_path(project, plan_dir / "linear.json")
        return fallback
    return preferred


def _matches(payload: dict, task_id: str) -> bool:
    script_dir = Path(__file__).resolve().parent
    roots = [script_dir.parent.parent / "linear-work-control" / "lib",
             script_dir.parent.parent.parent / "skills" / "linear-work-control" / "lib"]
    lib = next((root for root in roots if (root / "linear-work-control.mjs").is_file()), None)
    if lib is None:
        raise RuntimeError("canonical Linear binding validators unavailable")
    code = """import {pathToFileURL} from 'node:url';
let raw='';for await(const c of process.stdin) raw+=c;
const value=JSON.parse(raw), base=process.argv[1];
const mod=await import(pathToFileURL(base+'/'+(value.schemaVersion===2?'linear-product-binding.mjs':'linear-work-control.mjs')));
const result=(value.schemaVersion===2?mod.validateTaskBinding:mod.validateBinding)(value);
console.log(JSON.stringify(result.ok ? {ok:true} : {ok:false,errors:result.errors}));"""
    result = subprocess.run(["node", "--input-type=module", "-e", code, str(lib)], input=json.dumps(payload), text=True, capture_output=True, timeout=15)
    if result.returncode != 0:
        raise RuntimeError("canonical Linear binding validation failed")
    validation = json.loads(result.stdout)
    if not validation.get("ok"):
        raise RuntimeError("invalid Linear binding: " + "; ".join(validation.get("errors", [])))
    if payload.get("schemaVersion") == 2:
        return payload.get("taskId") == task_id
    task_map = payload.get("taskMap")
    return isinstance(task_map, dict) and task_id in task_map and isinstance(task_map[task_id], dict)


def _write_atomic(path: Path, payload: dict) -> None:
    temp = path.with_name(path.name + f".{uuid.uuid4().hex}.tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp, path)


def _record_failure(plan_dir: Path, message: str) -> None:
    progress = plan_dir / "progress.md"
    if progress.is_symlink():
        raise RuntimeError(f"progress path is a symlink: {progress}")
    line = f"\n- Lifecycle sync staging failed: {message}\n"
    with progress.open("a", encoding="utf-8") as stream:
        stream.write(line)


def stage_lifecycle_sync(project_path, task_id, plan_dir, event):
    project = Path(project_path).absolute()
    plan = Path(plan_dir)
    safe_plan = None
    try:
        if event not in EVENTS or not ID_RE.fullmatch(task_id):
            raise RuntimeError(f"invalid lifecycle sync input: event={event!r}, taskId={task_id!r}")
        plan = _safe_path(project, plan)
        safe_plan = plan
        task_plan = _safe_path(project, plan / "task_plan.md")
        text = task_plan.read_text(encoding="utf-8")
        ids = re.findall(r"^Task ID:\s*([A-Za-z0-9][A-Za-z0-9._-]{0,79})\s*$", text, re.MULTILINE)
        if len(ids) != 1 or ids[0] != task_id:
            raise RuntimeError("task_plan.md must contain exactly one matching stable Task ID")
        state_block = re.search(r"^## Current State\s*$([\s\S]*?)(?=^## |\Z)", text, re.MULTILINE)
        status = re.search(r"^Status:[ \t]*([^\n]+)", state_block.group(1) if state_block else "", re.MULTILINE)
        expected = {"close": {"closed"}, "archive": {"closed", "archived"}, "reopen": {"active"}}[event]
        if not status or status.group(1).strip().lower() not in expected:
            raise RuntimeError(f"Current State Status does not match lifecycle event {event}")
        metadata = _metadata_path(project, task_id, plan)
        if not metadata.exists():
            return {"ok": True, "skipped": True, "reason": "local-only task has no existing Linear metadata"}
        payload = _read_json(metadata)
        if not _matches(payload, task_id):
            raise RuntimeError(f"Linear metadata has no exact task mapping for {task_id}")
        sync = payload.get("sync")
        if not isinstance(sync, dict):
            sync = {}
        previous = sync.get("lifecycle")
        prior_debt = bool(previous.get("priorPendingRetry")) if isinstance(previous, dict) else bool(sync.get("pendingRetry"))
        lifecycle = {
            "eventId": str(uuid.uuid4()),
            "event": event,
            "taskId": task_id,
            "trioPath": str(plan),
            "recordedAt": datetime.now(timezone.utc).isoformat(),
            "priorPendingRetry": prior_debt,
        }
        sync["lifecycle"] = lifecycle
        sync["pendingRetry"] = True
        sync["lastResult"] = "failed"
        payload["sync"] = sync
        _write_atomic(metadata, payload)
        return {"ok": False, "pendingRetry": True, "lastResult": "failed", "path": str(metadata)}
    except Exception as error:
        message = str(error)
        try:
            if safe_plan is not None:
                _record_failure(safe_plan, message)
        except Exception:
            pass
        return {"ok": False, "pendingRetry": True, "lastResult": "failed", "error": message}


def ack_lifecycle_sync(project_path, task_id, event_id, plan_dir=None):
    """Acknowledge exactly one staged event without erasing unrelated debt."""
    project = Path(project_path).absolute()
    try:
        if not ID_RE.fullmatch(task_id) or not isinstance(event_id, str) or not event_id:
            raise RuntimeError("invalid lifecycle acknowledgement identity")
        metadata = _metadata_path(project, task_id, Path(plan_dir) if plan_dir else project / "planning" / "active" / task_id)
        if not metadata.exists():
            raise RuntimeError(f"no existing Linear metadata for stable Task ID {task_id}")
        payload = _read_json(metadata)
        if not _matches(payload, task_id):
            raise RuntimeError(f"Linear metadata has no exact task mapping for {task_id}")
        sync = payload.get("sync")
        if not isinstance(sync, dict) or not isinstance(sync.get("lifecycle"), dict):
            raise RuntimeError(f"pending lifecycle event not found: {event_id}")
        lifecycle = sync["lifecycle"]
        if lifecycle.get("eventId") != event_id:
            raise RuntimeError(f"pending lifecycle event is newer or has a different eventId: {event_id}")
        prior_debt = bool(lifecycle.get("priorPendingRetry"))
        sync.pop("lifecycle", None)
        if prior_debt:
            sync["pendingRetry"] = True
            sync["lastResult"] = "failed"
        else:
            sync["pendingRetry"] = False
            sync["lastResult"] = "ok"
            sync.pop("lifecyclePriorPendingRetry", None)
        payload["sync"] = sync
        _write_atomic(metadata, payload)
        return {"ok": True, "eventId": event_id, "pendingRetry": sync["pendingRetry"], "path": str(metadata)}
    except Exception as error:
        return {"ok": False, "error": str(error)}
