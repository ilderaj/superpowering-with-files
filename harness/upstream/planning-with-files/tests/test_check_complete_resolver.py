"""Tests for scripts/check-complete.sh resolver integration (v2.40).

Before v2.40, check-complete.sh defaulted to `./task_plan.md` when invoked
without arguments. Any caller running in pure-slug-mode (no root plan, only
`.planning/<slug>/task_plan.md` + `.active_plan`) would receive the
"No task_plan.md found" message even though an active plan existed.

The Stop hook in SKILL.md frontmatter passes the resolved plan path
explicitly, so this was silent: only user-driven invocations or third-party
tooling that called check-complete with no args hit the bug.

v2.40 wires check-complete.sh into the active-plan resolver when no explicit
path is passed, restoring slug-mode parity. The completion report must also
respect lifecycle gates from task_lifecycle.py before claiming archive-ready
completion.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
CHECK_COMPLETE = REPO_ROOT / "scripts" / "check-complete.sh"
CLOSE_TASK = REPO_ROOT / "scripts" / "close-task.py"


def have_bash() -> bool:
    return shutil.which("bash") is not None


PLAN_WITH_FIVE_PHASES = """# Task Plan: Smoke

## Phases

### Phase 1
- **Status:** in_progress

### Phase 2
- **Status:** pending

### Phase 3
- **Status:** pending

### Phase 4
- **Status:** pending

### Phase 5
- **Status:** pending
"""

PLAN_ALL_COMPLETE = """# Task Plan: Done

## Current State
Status: closed
Archive Eligible: yes
Close Reason: done
Reconcile: complete

## Phases

### Phase 1
- **Status:** complete

### Phase 2
- **Status:** complete
"""

PLAN_COMPLETE_BUT_ACTIVE = """# Task Plan: Nearly Done

## Current State
Status: active
Archive Eligible: no
Close Reason:
Reconcile: open

## Phases

### Phase 1
- **Status:** complete

### Phase 2
- **Status:** complete
"""

PLAN_ACTIVE_DIR_INCOMPLETE = """# Task Plan: Scoped

## Current State
Status: active
Archive Eligible: no
Close Reason:
Reconcile: open

## Phases

### Phase 1
- **Status:** in_progress
"""

RECONCILIATION_NOT_READY = """# Reconciliation: demo

## Archive Readiness
- Not ready — follow-up evidence is still pending.
"""


@unittest.skipUnless(have_bash(), "bash not available on this platform")
class CheckCompleteResolverTests(unittest.TestCase):
    def run_check(
        self,
        cwd: Path,
        plan_id: str | None = None,
        arg: str | None = None,
        env_extra: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        env.pop("PLAN_ID", None)
        env.pop("PLANNING_TASK_ID", None)
        env.pop("CODEX_THREAD_ID", None)
        env.pop("CLAUDE_SESSION_ID", None)
        if plan_id is not None:
            env["PLAN_ID"] = plan_id
        if env_extra:
            env.update(env_extra)
        cmd = ["bash", str(CHECK_COMPLETE)]
        if arg is not None:
            cmd.append(arg)
        return subprocess.run(
            cmd,
            cwd=str(cwd),
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )

    def run_close(self, cwd: Path, task_id: str, reason: str = "done") -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        env.pop("PLAN_ID", None)
        env.pop("PLANNING_TASK_ID", None)
        env.pop("CODEX_THREAD_ID", None)
        env.pop("CLAUDE_SESSION_ID", None)
        return subprocess.run(
            [sys.executable, str(CLOSE_TASK), str(cwd), task_id, "--reason", reason],
            cwd=str(cwd),
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )

    def test_explicit_path_arg_still_works(self) -> None:
        # Backward compat: passing the plan-file path directly bypasses the
        # resolver and operates on that file. The Stop hook in SKILL.md does
        # this; the contract must not change.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "task_plan.md").write_text(PLAN_WITH_FIVE_PHASES, encoding="utf-8")
            result = self.run_check(root, arg="task_plan.md")
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertIn("phases=0/5", result.stdout)

    def test_no_args_resolves_slug_plan_via_active_pointer(self) -> None:
        # Regression for v2.40: with only .planning/<slug>/task_plan.md and an
        # .active_plan pointer, no-args invocation must resolve the slug plan
        # instead of falling back to "no task_plan.md".
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            plan_dir = root / ".planning" / "2026-05-21-smoke"
            plan_dir.mkdir(parents=True)
            (plan_dir / "task_plan.md").write_text(PLAN_WITH_FIVE_PHASES, encoding="utf-8")
            (root / ".planning" / ".active_plan").write_text("2026-05-21-smoke\n", encoding="utf-8")
            result = self.run_check(root)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertIn("phases=0/5", result.stdout)
            self.assertNotIn("No task_plan.md found", result.stdout)

    def test_no_args_resolves_via_plan_id_env(self) -> None:
        # PLAN_ID env takes precedence over .active_plan in the resolver. The
        # check-complete script should honor that exact chain.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            alpha = root / ".planning" / "alpha"
            beta = root / ".planning" / "beta"
            alpha.mkdir(parents=True)
            beta.mkdir(parents=True)
            (alpha / "task_plan.md").write_text(PLAN_ALL_COMPLETE, encoding="utf-8")
            (beta / "task_plan.md").write_text(PLAN_WITH_FIVE_PHASES, encoding="utf-8")
            (root / ".planning" / ".active_plan").write_text("beta\n", encoding="utf-8")
            # PLAN_ID env should override .active_plan, pointing at alpha (all complete).
            result = self.run_check(root, plan_id="alpha")
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertIn("ALL PHASES COMPLETE", result.stdout)

    def test_slug_mode_open_receipts_keep_task_active(self) -> None:
        # Execution receipts live under the repo root even for .planning/<slug>
        # tasks. Open followups there must keep the task out of archive-ready.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            plan_dir = root / ".planning" / "demo"
            plan_dir.mkdir(parents=True)
            (plan_dir / "task_plan.md").write_text(PLAN_ALL_COMPLETE, encoding="utf-8")
            (root / ".planning" / ".active_plan").write_text("demo\n", encoding="utf-8")

            receipt_dir = root / ".harness" / "execution" / "receipts" / "demo"
            receipt_dir.mkdir(parents=True)
            (receipt_dir / "receipt.json").write_text(
                json.dumps(
                    {
                        "unitId": "unit-01",
                        "resultStatus": "success",
                        "followups": [{"type": "integration", "status": "open", "target": "progress.md"}],
                    }
                ),
                encoding="utf-8",
            )

            result = self.run_check(root)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertNotIn("ALL PHASES COMPLETE", result.stdout)
            self.assertIn("safe_to_archive=no", result.stdout)
            self.assertIn("reconciliation=open", result.stdout)

    def test_no_args_legacy_root_plan_still_works(self) -> None:
        # Backward compat: when no slug-mode plans exist but a root-level
        # task_plan.md does, the resolver returns empty and we fall back to the
        # legacy root path. v1.x users keep working.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "task_plan.md").write_text(PLAN_WITH_FIVE_PHASES, encoding="utf-8")
            result = self.run_check(root)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertIn("phases=0/5", result.stdout)

    def test_no_args_no_plan_anywhere_clean_message(self) -> None:
        # If no plan exists in either location, the script must say so and exit
        # 0 (Stop hook contract).
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = self.run_check(root)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertIn("No task_plan.md found", result.stdout)

    def test_no_args_resolves_single_active_task_dir(self) -> None:
        # planning/active/<task-id>/ is the canonical active-task layout. If
        # exactly one active task exists and no explicit env selector is set,
        # no-args invocation should still find that task.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            plan_dir = root / "planning" / "active" / "demo"
            plan_dir.mkdir(parents=True)
            (plan_dir / "task_plan.md").write_text(PLAN_ACTIVE_DIR_INCOMPLETE, encoding="utf-8")
            result = self.run_check(root)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertIn("status=active", result.stdout)
            self.assertIn("phases=0/1", result.stdout)
            self.assertNotIn("No task_plan.md found", result.stdout)

    def test_no_args_prefers_single_active_task_dir_over_mismatched_thread_env(self) -> None:
        # Codex and Claude often set session/thread identifiers that do not
        # match the task slug. Those implicit selectors must not hide the only
        # existing active task directory from status checks.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            plan_dir = root / "planning" / "active" / "demo"
            plan_dir.mkdir(parents=True)
            (plan_dir / "task_plan.md").write_text(PLAN_ACTIVE_DIR_INCOMPLETE, encoding="utf-8")
            result = self.run_check(root, env_extra={"CODEX_THREAD_ID": "thread-without-plan"})
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertIn("status=active", result.stdout)
            self.assertIn("phases=0/1", result.stdout)
            self.assertNotIn("No task_plan.md found", result.stdout)

    def test_no_args_prefers_active_task_dir_over_legacy_slug_dir(self) -> None:
        # When both layouts exist during migration, planning/active is the
        # authoritative active-task root and must win over legacy .planning.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            legacy_dir = root / ".planning" / "legacy"
            active_dir = root / "planning" / "active" / "current"
            legacy_dir.mkdir(parents=True)
            active_dir.mkdir(parents=True)
            (root / ".planning" / ".active_plan").write_text("legacy\n", encoding="utf-8")
            (legacy_dir / "task_plan.md").write_text(PLAN_ACTIVE_DIR_INCOMPLETE, encoding="utf-8")
            (active_dir / "task_plan.md").write_text(PLAN_ALL_COMPLETE, encoding="utf-8")

            result = self.run_check(root)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertIn("ALL PHASES COMPLETE", result.stdout)
            self.assertNotIn("Task legacy", result.stdout)

    def test_all_complete_but_not_closed_stays_active(self) -> None:
        # Regression for the lifecycle gate: all phases complete is not enough
        # to claim completion when Current State / Archive Eligible / Reconcile
        # still keep the task active.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "task_plan.md").write_text(PLAN_COMPLETE_BUT_ACTIVE, encoding="utf-8")
            result = self.run_check(root)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertNotIn("ALL PHASES COMPLETE", result.stdout)
            self.assertIn("safe_to_archive=no", result.stdout)
            self.assertIn("Leave this task in planning/active", result.stdout)

    def test_close_task_adds_default_reconciliation_ready_signal(self) -> None:
        # The official close-task flow should remain archivable without asking
        # the user to manually add a separate reconciliation marker.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            plan_dir = root / "planning" / "active" / "demo"
            plan_dir.mkdir(parents=True)
            task_plan = plan_dir / "task_plan.md"
            task_plan.write_text(PLAN_COMPLETE_BUT_ACTIVE, encoding="utf-8")

            close_result = self.run_close(root, "demo")
            self.assertEqual(0, close_result.returncode, close_result.stderr)

            updated = task_plan.read_text(encoding="utf-8")
            self.assertIn("Status: closed", updated)
            self.assertIn("Archive Eligible: yes", updated)
            self.assertIn("Reconcile: complete", updated)

            result = self.run_check(root)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertIn("ALL PHASES COMPLETE", result.stdout)

    def test_close_task_keeps_explicit_not_ready_reconciliation_open(self) -> None:
        # If a task already has an explicit reconciliation artifact that says
        # archive readiness is not ready, close-task must not silently mark it
        # complete just to satisfy the default path.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            plan_dir = root / "planning" / "active" / "demo"
            plan_dir.mkdir(parents=True)
            task_plan = plan_dir / "task_plan.md"
            task_plan.write_text(PLAN_COMPLETE_BUT_ACTIVE, encoding="utf-8")
            (plan_dir / "reconciliation.md").write_text(RECONCILIATION_NOT_READY, encoding="utf-8")

            close_result = self.run_close(root, "demo")
            self.assertEqual(0, close_result.returncode, close_result.stderr)

            updated = task_plan.read_text(encoding="utf-8")
            self.assertIn("Status: closed", updated)
            self.assertIn("Archive Eligible: yes", updated)
            self.assertIn("Reconcile: open", updated)

            result = self.run_check(root)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertNotIn("ALL PHASES COMPLETE", result.stdout)
            self.assertIn("safe_to_archive=no", result.stdout)


if __name__ == "__main__":
    unittest.main()
