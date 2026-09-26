#!/usr/bin/env python3
"""Reopen an exact archived or closed active planning task by stable identity."""
from pathlib import Path
import sys
# Installed plugin resources must not receive import caches.
sys.dont_write_bytecode = True

import planning_paths

if len(sys.argv) != 3:
    print("usage: reopen-task.py <project_path> <exact-archive-path-or-closed-active-path>", file=sys.stderr)
    raise SystemExit(1)
try:
    print(f"[planning-with-files] Reopened task at: {planning_paths.reopen_task(Path(sys.argv[1]).resolve(), sys.argv[2])}")
except Exception as error:
    print(f"[planning-with-files] Reopen rejected: {error}", file=sys.stderr)
    raise SystemExit(1)
