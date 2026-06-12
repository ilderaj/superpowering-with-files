#!/usr/bin/env python3
"""Planning task lifecycle inspection helpers."""

from __future__ import annotations

import json
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
    if normalized.startswith(("complete", "completed", "done")):
        return "complete"
    if normalized.startswith(("waived", "waiver")):
        return "waived"
    if normalized.startswith(("open", "pending", "todo", "unknown", "not_ready")):
        return "open"
    return ""


def _archive_readiness_status(reconciliation_markdown: str) -> str:
    section = _extract_section(reconciliation_markdown, "Archive Readiness")
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


def _execution_receipt_directory(plan_dir: Path) -> Path:
    project_path = plan_dir.parent.parent.parent
    return project_path / ".harness" / "execution" / "receipts" / plan_dir.name


def _followup_closure_directory(plan_dir: Path) -> Path:
    project_path = plan_dir.parent.parent.parent
    return project_path / ".harness" / "execution" / "followup-closures" / plan_dir.name


def _derive_followup_id(unit_id: str, followup: Dict[str, Any]) -> str:
    followup_type = str(followup.get("type") or "unknown")
    followup_target = str(followup.get("target") or "unknown")
    return f"{unit_id}:{followup_type}:{followup_target}"


def _read_followup_closures(plan_dir: Path) -> Dict[str, Dict[str, Any]]:
    closure_dir = _followup_closure_directory(plan_dir)
    closures: Dict[str, Dict[str, Any]] = {}
    if not closure_dir.exists():
        return closures

    for closure_path in sorted(closure_dir.glob("*.json")):
        try:
            closure = json.loads(_read_text(closure_path))
        except json.JSONDecodeError:
            continue

        followup_id = str(closure.get("followupId") or "").strip()
        if followup_id:
            closures[followup_id] = closure

    return closures


def _detect_execution_signals(plan_dir: Path) -> Dict[str, int]:
    receipt_dir = _execution_receipt_directory(plan_dir)
    if not receipt_dir.exists():
        return {
            "receipt_count": 0,
            "blocked_units": 0,
            "failed_units": 0,
            "open_followups": 0,
            "resolved_followups": 0,
            "waived_followups": 0,
        }

    closures = _read_followup_closures(plan_dir)
    summary = {
        "receipt_count": 0,
        "blocked_units": 0,
        "failed_units": 0,
        "open_followups": 0,
        "resolved_followups": 0,
        "waived_followups": 0,
    }
    for receipt_path in sorted(receipt_dir.glob("*.json")):
        try:
            receipt = json.loads(_read_text(receipt_path))
        except json.JSONDecodeError:
            continue

        summary["receipt_count"] += 1
        if receipt.get("resultStatus") == "blocked":
            summary["blocked_units"] += 1
        if receipt.get("resultStatus") == "failed":
            summary["failed_units"] += 1
        unit_id = str(receipt.get("unitId") or "unknown")
        followups = receipt.get("followups") or []
        for followup in followups:
            if followup.get("status") != "open":
                continue

            followup_id = _derive_followup_id(unit_id, followup)
            closure = closures.get(followup_id)
            if not closure:
                summary["open_followups"] += 1
                continue

            closure_status = str(closure.get("closureStatus") or "").strip().lower()
            if closure_status == "resolved":
                summary["resolved_followups"] += 1
            elif closure_status == "waived":
                summary["waived_followups"] += 1
            else:
                summary["open_followups"] += 1

    return summary


def _detect_reconciliation(plan_dir: Path, task_plan_markdown: str, safe_to_archive: bool) -> Dict[str, Any]:
    progress_path = plan_dir / "progress.md"
    progress_markdown = _read_text(progress_path) if progress_path.exists() else ""
    combined = f"{task_plan_markdown}\n{progress_markdown}"
    artifact_path = plan_dir / "reconciliation.md"

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
    elif artifact_path.exists():
        artifact_status = _archive_readiness_status(_read_text(artifact_path))
        if artifact_status == "complete":
            status = "complete"
            reason = "reconciliation.md Archive Readiness is Ready"
            evidence = str(artifact_path)
        else:
            status = "open"
            reason = "reconciliation.md Archive Readiness is not ready"
            evidence = str(artifact_path)
    elif safe_to_archive:
        status = "open"
        reason = "archive-eligible task has no reconciliation signal"
        evidence = ""
    else:
        status = "unknown"
        reason = "no reconciliation signal recorded yet"
        evidence = ""

    execution_signals = _detect_execution_signals(plan_dir)
    if execution_signals["open_followups"] > 0:
        status = "open"
        reason = "execution receipts leave open followups"
        evidence = str(_execution_receipt_directory(plan_dir))

    return {
        "reconciliation_status": status,
        "reconciliation_ready": status in {"complete", "not_required", "waived"},
        "reconciliation_reason": reason,
        "reconciliation_artifact": str(artifact_path) if artifact_path.exists() else "",
        "reconciliation_evidence": evidence,
        "execution_receipt_count": execution_signals["receipt_count"],
        "execution_blocked_units": execution_signals["blocked_units"],
        "execution_failed_units": execution_signals["failed_units"],
        "execution_open_followups": execution_signals["open_followups"],
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
    lifecycle_archive_ready = lifecycle_status == "closed" and archive_eligible
    reconciliation = _detect_reconciliation(plan_dir, markdown, lifecycle_archive_ready)
    safe_to_archive = lifecycle_archive_ready and reconciliation["reconciliation_ready"]

    if not current_state:
        warnings.append("missing Current State lifecycle block")
    if looks_complete and not safe_to_archive:
        warnings.append("all phases look complete, but task is not explicitly closed and archive eligible")
    if lifecycle_status == "closed" and not archive_eligible:
        warnings.append("task is closed but Archive Eligible is not yes")
    if lifecycle_archive_ready and not reconciliation["reconciliation_ready"]:
        warnings.append("archive-eligible task has no reconciliation readiness signal")

    if safe_to_archive:
        reason = "task is explicitly closed, archive eligible, and reconciliation ready"
    elif lifecycle_archive_ready:
        reason = "task is closed and archive eligible but reconciliation is not ready"
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
        "lifecycle_archive_ready": lifecycle_archive_ready,
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
