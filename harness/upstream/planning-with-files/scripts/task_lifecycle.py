#!/usr/bin/env python3
"""Planning task lifecycle inspection helpers."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List, Optional

LIFECYCLE_STATUSES = {
    "active",
    "blocked",
    "waiting_review",
    "waiting_execution",
    "waiting_integration",
    "closed",
    "archived",
    "unknown",
}


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="replace")


def _extract_section(markdown: str, heading: str) -> str:
    pattern = re.compile(
        rf"^##\s+{re.escape(heading)}\s*$([\s\S]*?)(?=^##\s+|\Z)",
        re.MULTILINE,
    )
    match = pattern.search(markdown)
    return match.group(1).strip() if match else ""


def _parse_field(section: str, name: str) -> Optional[str]:
    pattern = re.compile(
        rf"^\s*(?:[-*]\s*)?{re.escape(name)}\s*:\s*(.*?)\s*$",
        re.IGNORECASE | re.MULTILINE,
    )
    match = pattern.search(section)
    return match.group(1).strip() if match else None


def _normalize_status(value: Optional[str]) -> str:
    if not value:
        return "unknown"

    normalized = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return normalized if normalized in LIFECYCLE_STATUSES else "unknown"


def _parse_bool(value: Optional[str]) -> bool:
    if value is None:
        return False

    return value.strip().lower() in {"yes", "true", "1", "y", "ready"}


def _normalize_reconciliation_value(value: Optional[str]) -> str:
    if not value:
        return ""

    normalized = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    if normalized.startswith(("not_required", "not_require", "not_needed", "none")):
        return "not_required"
    if normalized.startswith(("complete", "completed", "done", "ready")):
        return "complete"
    if normalized.startswith(("waived", "waiver")):
        return "waived"
    if normalized.startswith(("open", "pending", "todo", "unknown")):
        return "open"
    return ""


def _detect_reconciliation(plan_dir: Path, task_plan_markdown: str, safe_to_archive: bool) -> Dict[str, Any]:
    progress_path = plan_dir / "progress.md"
    progress_markdown = _read_text(progress_path) if progress_path.exists() else ""
    combined = f"{task_plan_markdown}\n{progress_markdown}"
    artifact_path = plan_dir / "reconciliation.md"

    if artifact_path.exists():
        status = "complete"
        reason = "reconciliation.md exists"
        evidence = str(artifact_path)
    elif re.search(r"^##\s+Reconciliation\s*$", progress_markdown, flags=re.IGNORECASE | re.MULTILINE):
        status = "complete"
        reason = "progress.md has a Reconciliation section"
        evidence = str(progress_path)
    else:
        field_match = re.search(
            r"^\s*(?:[-*]\s*)?Reconcile\s*:\s*(.*?)\s*$",
            combined,
            flags=re.IGNORECASE | re.MULTILINE,
        )
        field_value = field_match.group(1).strip() if field_match else None
        normalized = _normalize_reconciliation_value(field_value)
        if normalized:
            status = normalized
            reason = f"Reconcile field records {normalized}"
            evidence = "task_plan.md/progress.md"
        elif safe_to_archive:
            status = "open"
            reason = "archive-eligible task has no reconciliation signal"
            evidence = ""
        else:
            status = "unknown"
            reason = "no reconciliation signal recorded yet"
            evidence = ""

    return {
        "reconciliation_status": status,
        "reconciliation_ready": status in {"complete", "not_required", "waived"},
        "reconciliation_reason": reason,
        "reconciliation_artifact": str(artifact_path) if artifact_path.exists() else "",
        "reconciliation_evidence": evidence,
    }


def _count_phase_statuses(markdown: str) -> Dict[str, int]:
    total = len(re.findall(r"^###\s+Phase\b", markdown, flags=re.MULTILINE))
    complete = len(re.findall(r"\*\*Status:\*\*\s*complete\b", markdown))
    in_progress = len(re.findall(r"\*\*Status:\*\*\s*in_progress\b", markdown))
    pending = len(re.findall(r"\*\*Status:\*\*\s*pending\b", markdown))

    if complete == 0 and in_progress == 0 and pending == 0:
        complete = len(re.findall(r"\[complete\]", markdown))
        in_progress = len(re.findall(r"\[in_progress\]", markdown))
        pending = len(re.findall(r"\[pending\]", markdown))

    return {
        "phase_total": total,
        "phase_complete": complete,
        "phase_in_progress": in_progress,
        "phase_pending": pending,
    }


def inspect_plan_dir(plan_dir: Path) -> Dict[str, Any]:
    """Return lifecycle metadata for a single active planning directory."""
    task_id = plan_dir.name
    task_plan = plan_dir / "task_plan.md"
    warnings: List[str] = []

    if not task_plan.exists():
        return {
            "task_id": task_id,
            "plan_dir": str(plan_dir),
            "task_plan": str(task_plan),
            "exists": False,
            "status": "unknown",
            "archive_eligible": False,
            "close_reason": "",
            "phase_total": 0,
            "phase_complete": 0,
            "phase_in_progress": 0,
            "phase_pending": 0,
            "looks_complete": False,
            "safe_to_archive": False,
            "reconciliation_status": "unknown",
            "reconciliation_ready": False,
            "reconciliation_reason": "task_plan.md is missing",
            "reconciliation_artifact": "",
            "reconciliation_evidence": "",
            "reason": "task_plan.md is missing",
            "warnings": ["missing task_plan.md"],
        }

    markdown = _read_text(task_plan)
    current_state = _extract_section(markdown, "Current State")
    lifecycle_status = _normalize_status(_parse_field(current_state, "Status"))
    archive_eligible = _parse_bool(_parse_field(current_state, "Archive Eligible"))
    close_reason = _parse_field(current_state, "Close Reason") or ""
    phase_counts = _count_phase_statuses(markdown)

    looks_complete = (
        phase_counts["phase_total"] > 0
        and phase_counts["phase_complete"] == phase_counts["phase_total"]
        and phase_counts["phase_in_progress"] == 0
        and phase_counts["phase_pending"] == 0
    )
    safe_to_archive = lifecycle_status == "closed" and archive_eligible
    reconciliation = _detect_reconciliation(plan_dir, markdown, safe_to_archive)

    if not current_state:
        warnings.append("missing Current State lifecycle block")
    if looks_complete and not safe_to_archive:
        warnings.append("all phases look complete, but task is not explicitly closed and archive eligible")
    if lifecycle_status == "closed" and not archive_eligible:
        warnings.append("task is closed but Archive Eligible is not yes")
    if safe_to_archive and not reconciliation["reconciliation_ready"]:
        warnings.append("archive-eligible task has no reconciliation readiness signal")

    if safe_to_archive:
        reason = "task is explicitly closed and archive eligible"
    elif looks_complete:
        reason = "task looks complete but must be explicitly closed before archiving"
    elif lifecycle_status == "closed":
        reason = "task is closed but not archive eligible"
    else:
        reason = "task is active or incomplete"

    return {
        "task_id": task_id,
        "plan_dir": str(plan_dir),
        "task_plan": str(task_plan),
        "exists": True,
        "status": lifecycle_status,
        "archive_eligible": archive_eligible,
        "close_reason": close_reason,
        **phase_counts,
        "looks_complete": looks_complete,
        "safe_to_archive": safe_to_archive,
        **reconciliation,
        "reason": reason,
        "warnings": warnings,
    }


def format_summary(status: Dict[str, Any]) -> str:
    prefix = "[planning-with-files]"
    lines = [
        (
            f"{prefix} Task {status['task_id']}: status={status['status']}, "
            f"archive_eligible={'yes' if status['archive_eligible'] else 'no'}, "
            f"phases={status['phase_complete']}/{status['phase_total']}, "
            f"safe_to_archive={'yes' if status['safe_to_archive'] else 'no'}, "
            f"reconciliation={status.get('reconciliation_status', 'unknown')}"
        ),
        f"{prefix} {status['reason']}.",
    ]

    for warning in status.get("warnings", []):
        lines.append(f"{prefix} Warning: {warning}.")

    if status.get("looks_complete") and not status.get("safe_to_archive"):
        lines.append(
            f"{prefix} Leave this task in planning/active until it is explicitly closed."
        )

    return "\n".join(lines)
