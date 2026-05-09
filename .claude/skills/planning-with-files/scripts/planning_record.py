#!/usr/bin/env python3
"""Render and append timestamped planning record blocks."""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from planning_paths import active_dir

UTC8 = timezone(timedelta(hours=8))
FILE_MAP = {
    "task_plan": "task_plan.md",
    "findings": "findings.md",
    "progress": "progress.md",
}


def utc8_timestamp() -> str:
    return datetime.now(timezone.utc).astimezone(UTC8).strftime("%Y-%m-%d %H:%M:%S UTC+8")


def heading_for(kind: str, timestamp: Optional[str] = None) -> str:
    if kind not in FILE_MAP:
        raise KeyError(kind)

    value = timestamp or utc8_timestamp()
    if kind == "progress":
        return f"## Session: {value}"
    if kind == "findings":
        return f"## Findings Record: {value}"
    return f"## Plan Record: {value}"


def render_block(kind: str, title: Optional[str] = None) -> str:
    lines = [heading_for(kind), ""]

    if title:
        lines.extend([f"### {title}", ""])

    if kind == "progress":
        lines.extend(
            [
                "- Actions taken:",
                "  -",
                "- Files created/modified:",
                "  -",
            ]
        )
    else:
        lines.append("- ")

    return "\n".join(lines).rstrip() + "\n"


def append_record(project_path: Path, task_id: Optional[str], kind: str, title: Optional[str]) -> Path:
    plan_dir = active_dir(project_path, task_id)
    file_name = FILE_MAP.get(kind)
    if file_name is None:
        raise KeyError(kind)

    target = plan_dir / file_name
    if not target.exists():
        raise FileNotFoundError(f"planning file does not exist: {target}")

    original = target.read_text(encoding="utf-8")
    prefix = original
    if prefix and not prefix.endswith("\n"):
        prefix += "\n"
    if prefix and not prefix.endswith("\n\n"):
        prefix += "\n"

    target.write_text(prefix + render_block(kind, title), encoding="utf-8")
    return target


def usage() -> str:
    return (
        "usage: planning_record.py <command> [args]\n"
        "commands:\n"
        "  timestamp\n"
        "  heading <task_plan|findings|progress>\n"
        "  block <task_plan|findings|progress> [title]\n"
        "  append <project_path> <task_id> <task_plan|findings|progress> [title]\n"
    )


def main() -> int:
    if len(sys.argv) < 2:
        print(usage(), file=sys.stderr)
        return 1

    command = sys.argv[1]

    try:
        if command == "timestamp":
            print(utc8_timestamp())
            return 0

        if command == "heading":
            if len(sys.argv) < 3:
                raise ValueError("heading requires a file kind")
            print(heading_for(sys.argv[2]))
            return 0

        if command == "block":
            if len(sys.argv) < 3:
                raise ValueError("block requires a file kind")
            title = sys.argv[3] if len(sys.argv) >= 4 else None
            sys.stdout.write(render_block(sys.argv[2], title))
            return 0

        if command == "append":
            if len(sys.argv) < 5:
                raise ValueError("append requires project_path, task_id, and file kind")
            project_path = Path(sys.argv[2]).resolve()
            raw_task_id = sys.argv[3]
            task_id = None if raw_task_id in {"", "-"} else raw_task_id
            kind = sys.argv[4]
            title = sys.argv[5] if len(sys.argv) >= 6 else None
            print(append_record(project_path, task_id, kind, title))
            return 0

        raise ValueError(f"unknown command: {command}")
    except KeyError as error:
        print(
            f"unknown file kind: {error.args[0]} (expected one of: {', '.join(FILE_MAP)})",
            file=sys.stderr,
        )
        return 1
    except (FileNotFoundError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
