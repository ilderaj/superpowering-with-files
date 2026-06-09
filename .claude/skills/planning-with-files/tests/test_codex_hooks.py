import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
CODEX_ROOT = REPO_ROOT / ".codex"
HOOKS_JSON = CODEX_ROOT / "hooks.json"
HOOKS_DIR = CODEX_ROOT / "hooks"
CODEX_SKILL = CODEX_ROOT / "skills" / "planning-with-files" / "SKILL.md"


def extract_stop_hook_command() -> str:
    text = CODEX_SKILL.read_text(encoding="utf-8")
    match = re.search(r'Stop:\n(?:.*?\n)*?\s*command: "((?:[^"\\]|\\.)*)"', text)
    assert match, "Stop hook command not found in Codex SKILL.md"
    return match.group(1).replace('\\"', '"').replace("\\\\", "\\")


class CodexHooksTests(unittest.TestCase):
    def run_python_hook(self, script_name: str, payload: dict, cwd: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(HOOKS_DIR / script_name)],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            cwd=str(cwd),
            check=False,
        )

    def run_shell_hook(self, script_name: str, cwd: Path, env: dict | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["sh", str(HOOKS_DIR / script_name)],
            text=True,
            capture_output=True,
            cwd=str(cwd),
            env=env,
            check=False,
        )

    def run_skill_stop_command(self, cwd: Path, env: dict) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["sh", "-c", extract_stop_hook_command()],
            text=True,
            capture_output=True,
            cwd=str(cwd),
            env=env,
            check=False,
        )

    def test_hooks_json_declares_all_expected_codex_events(self) -> None:
        self.assertTrue(HOOKS_JSON.exists(), ".codex/hooks.json is missing")

        payload = json.loads(HOOKS_JSON.read_text(encoding="utf-8"))
        self.assertEqual(
            {
                "SessionStart",
                "UserPromptSubmit",
                "PreToolUse",
                "PermissionRequest",
                "PostToolUse",
                "Stop",
            },
            set(payload["hooks"]),
        )

    def test_permission_request_adapter_emits_plan_reminder(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            root.joinpath("task_plan.md").write_text(
                "# Task Plan\n### Phase 1\n- **Status:** in_progress\n",
                encoding="utf-8",
            )

            result = self.run_python_hook(
                "permission_request.py",
                {"cwd": str(root), "tool_name": "Bash"},
                root,
            )

        self.assertEqual(0, result.returncode, result.stderr)
        payload = json.loads(result.stdout)
        self.assertIn("systemMessage", payload)
        self.assertIn("Active plan", payload["systemMessage"])

    def test_permission_request_silent_without_plan(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            result = self.run_python_hook(
                "permission_request.py",
                {"cwd": str(root), "tool_name": "Bash"},
                root,
            )

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("", result.stdout.strip())

    def test_permission_request_uses_active_plan_resolution(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            plan_root = root / ".planning"
            active_dir = plan_root / "isolated-task"
            active_dir.mkdir(parents=True)
            active_dir.joinpath("task_plan.md").write_text(
                "# Task Plan\n### Phase 1\n- **Status:** in_progress\n",
                encoding="utf-8",
            )
            plan_root.joinpath(".active_plan").write_text("isolated-task\n", encoding="utf-8")

            result = self.run_python_hook(
                "permission_request.py",
                {"cwd": str(root), "tool_name": "Bash"},
                root,
            )

        self.assertEqual(0, result.returncode, result.stderr)
        payload = json.loads(result.stdout)
        self.assertIn("systemMessage", payload)
        self.assertIn("Active plan", payload["systemMessage"])

    def test_session_start_reuses_plan_context(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir, tempfile.TemporaryDirectory() as home:
            root = Path(tmpdir)
            root.joinpath("task_plan.md").write_text(
                "# Task Plan\n\n## Goal\nShip Codex hooks\n",
                encoding="utf-8",
            )
            root.joinpath("progress.md").write_text(
                "# Progress\n\nFinished adapter draft.\n",
                encoding="utf-8",
            )
            root.joinpath("findings.md").write_text(
                "# Findings\n\n- reuse cursor hooks\n",
                encoding="utf-8",
            )

            env = os.environ.copy()
            env["HOME"] = home
            result = self.run_shell_hook("session-start.sh", root, env=env)

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("ACTIVE PLAN", result.stdout)
        self.assertIn("Ship Codex hooks", result.stdout)
        self.assertIn("Finished adapter draft", result.stdout)

    def test_pre_tool_use_adapter_emits_system_message(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            root.joinpath("task_plan.md").write_text(
                textwrap.dedent(
                    """\
                    # Task Plan
                    ### Phase 1: Discovery
                    - **Status:** complete
                    """
                ),
                encoding="utf-8",
            )

            result = self.run_python_hook(
                "pre_tool_use.py",
                {"cwd": str(root), "tool_input": {"command": "pwd"}},
                root,
            )

        self.assertEqual(0, result.returncode, result.stderr)
        payload = json.loads(result.stdout)
        self.assertIn("systemMessage", payload)
        self.assertIn("# Task Plan", payload["systemMessage"])

    def test_post_tool_use_adapter_emits_progress_reminder(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            root.joinpath("task_plan.md").write_text("# Task Plan\n", encoding="utf-8")

            result = self.run_python_hook(
                "post_tool_use.py",
                {"cwd": str(root), "tool_response": "ok"},
                root,
            )

        self.assertEqual(0, result.returncode, result.stderr)
        payload = json.loads(result.stdout)
        self.assertIn("progress.md", payload["systemMessage"])

    def test_stop_adapter_blocks_once_then_allows_reentry(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            root.joinpath("task_plan.md").write_text(
                textwrap.dedent(
                    """\
                    ### Phase 1: Discovery
                    - **Status:** complete

                    ### Phase 2: Implementation
                    - **Status:** pending
                    """
                ),
                encoding="utf-8",
            )

            first = self.run_python_hook(
                "stop.py",
                {"cwd": str(root), "stop_hook_active": False},
                root,
            )
            second = self.run_python_hook(
                "stop.py",
                {"cwd": str(root), "stop_hook_active": True},
                root,
            )

        self.assertEqual(0, first.returncode, first.stderr)
        self.assertEqual(0, second.returncode, second.stderr)

        first_payload = json.loads(first.stdout)
        second_payload = json.loads(second.stdout)

        self.assertEqual("block", first_payload["decision"])
        self.assertIn("Task incomplete", first_payload["reason"])
        self.assertIn("Task incomplete", second_payload["systemMessage"])

    def test_skill_stop_hook_falls_back_to_codex_skill_install(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir, tempfile.TemporaryDirectory() as home:
            root = Path(tmpdir)
            script_dir = Path(home) / ".codex" / "skills" / "planning-with-files" / "scripts"
            script_dir.mkdir(parents=True)
            marker = "[planning-with-files] CODEX skill stop marker"
            script_dir.joinpath("check-complete.sh").write_text(
                f"#!/bin/sh\necho '{{\"followup_message\": \"{marker}\"}}'\n",
                encoding="utf-8",
            )

            env = os.environ.copy()
            env["HOME"] = home
            env.pop("CLAUDE_SKILL_DIR", None)
            env.pop("CODEX_SKILL_DIR", None)

            result = self.run_skill_stop_command(root, env)

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn(marker, result.stdout)


if __name__ == "__main__":
    unittest.main()
