# Companion Plan Sync Constraints Implementation Plan

> **Authoritative task memory:** `planning/active/companion-plan-sync-constraints/`
>
> **Active task path:** `planning/active/companion-plan-sync-constraints/`
>
> **Backlink:** see `planning/active/companion-plan-sync-constraints/task_plan.md`, `planning/active/companion-plan-sync-constraints/findings.md`, and `planning/active/companion-plan-sync-constraints/progress.md`
>
> **Lifecycle state:** active
>
> **Sync-back status:** executed on `2026-04-26`; lifecycle tests and full repo verification passed, branch integration pending.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hard lifecycle gate for companion-plan consistency so `close-task` and `archive-task` refuse unsynced companion state, while `archive-task` automatically relocates archived companion artifacts into the owning archive task directory.

**Architecture:** Keep `readHarnessHealth()` and `plan-locations.mjs` read-only. Add a shared Python companion-consistency checker in the planning-with-files script set, call it from `close-task.py` and `task-status.py`, and let `planning_paths.py archive-active` perform archive-time companion relocation plus reference rewriting after the lifecycle gate passes.

**Tech Stack:** Python 3 planning-with-files scripts, POSIX shell wrapper, Node.js `node:test` fixtures, existing Harness test helper utilities.

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `tests/helpers/planning-lifecycle-fixture.mjs` | helper utilities for creating planning tasks and running lifecycle scripts in fixtures | Create |
| `tests/core/companion-plan-lifecycle.test.mjs` | regression coverage for close/archive companion lifecycle behavior | Create |
| `harness/upstream/planning-with-files/scripts/companion_sync.py` | shared parser, validator, and metadata update helpers for companion lifecycle state | Create |
| `harness/upstream/planning-with-files/scripts/close-task.py` | enforce companion sync gate and write close-time companion metadata | Modify |
| `harness/upstream/planning-with-files/scripts/task-status.py` | expose companion sync state and optional `--require-companion-synced` gate | Modify |
| `harness/upstream/planning-with-files/scripts/planning_paths.py` | archive active task, relocate companion artifact, and rewrite archive references | Modify |
| `harness/upstream/planning-with-files/scripts/archive-task.sh` | invoke the stronger archive gate before migration | Modify |
| `harness/upstream/planning-with-files/SKILL.md` | document the new close/archive companion sync contract | Modify |
| `docs/maintenance.md` | document that archive now auto-migrates companion artifacts | Modify |

## Task 1: Add Lifecycle Script Test Harness

**Files:**
- Create: `tests/helpers/planning-lifecycle-fixture.mjs`
- Create: `tests/core/companion-plan-lifecycle.test.mjs`

- [ ] **Step 1: Create a helper for planning task fixtures and script execution**

```js
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { createHarnessFixture, removeHarnessFixture } from './harness-fixture.mjs';

const execFileAsync = promisify(execFile);

export async function createPlanningLifecycleFixture() {
  const root = await createHarnessFixture();
  return {
    root,
    cleanup: async () => removeHarnessFixture(root)
  };
}

export async function writeActiveTask(root, taskId, files) {
  const taskDir = path.join(root, 'planning/active', taskId);
  await mkdir(taskDir, { recursive: true });
  await writeFile(path.join(taskDir, 'task_plan.md'), files.taskPlan, 'utf8');
  await writeFile(path.join(taskDir, 'findings.md'), files.findings ?? '# Findings\n', 'utf8');
  await writeFile(path.join(taskDir, 'progress.md'), files.progress ?? '# Progress\n', 'utf8');
  return taskDir;
}

export async function writeCompanion(root, relativePath, markdown) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, markdown, 'utf8');
  return filePath;
}

export async function runPythonScript(root, relativeScript, args = []) {
  const scriptPath = path.join(root, relativeScript);
  const result = await execFileAsync('python3', [scriptPath, root, ...args], { cwd: root });
  return { stdout: result.stdout, stderr: result.stderr };
}

export async function runShellScript(root, relativeScript, args = []) {
  const scriptPath = path.join(root, relativeScript);
  await chmod(scriptPath, 0o755);
  const result = await execFileAsync('bash', [scriptPath, root, ...args], { cwd: root });
  return { stdout: result.stdout, stderr: result.stderr };
}
```

- [ ] **Step 2: Add the first failing tests for close-task companion behavior**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import {
  createPlanningLifecycleFixture,
  runPythonScript,
  writeActiveTask,
  writeCompanion
} from '../helpers/planning-lifecycle-fixture.mjs';

test('close-task succeeds for tasks without a companion plan', async () => {
  const fixture = await createPlanningLifecycleFixture();
  try {
    await writeActiveTask(fixture.root, 'task-a', {
      taskPlan: '# Task\n\n## Current State\nStatus: active\nArchive Eligible: no\nClose Reason:\n'
    });

    const { stdout } = await runPythonScript(
      fixture.root,
      'harness/upstream/planning-with-files/scripts/close-task.py',
      ['task-a', '--reason', 'done']
    );

    assert.match(stdout, /Closed task and marked archive eligible/);
  } finally {
    await fixture.cleanup();
  }
});

test('close-task blocks when declared companion metadata is incomplete', async () => {
  const fixture = await createPlanningLifecycleFixture();
  try {
    await writeActiveTask(fixture.root, 'task-a', {
      taskPlan: '# Task\n\n## Current State\nStatus: active\nArchive Eligible: no\nClose Reason:\n\n## Companion Plan\n- Companion plan: `docs/superpowers/plans/task-a.md`\n- Sync-back status: drafted\n'
    });
    await writeCompanion(
      fixture.root,
      'docs/superpowers/plans/task-a.md',
      '# Companion\n\n- Lifecycle state: active\n- Sync-back status: drafted\n'
    );

    await assert.rejects(
      () => runPythonScript(fixture.root, 'harness/upstream/planning-with-files/scripts/close-task.py', ['task-a']),
      /Active task path/
    );
  } finally {
    await fixture.cleanup();
  }
});
```

- [ ] **Step 3: Run the new close-task test slice to verify it fails for the new behavior**

Run: `node --test tests/core/companion-plan-lifecycle.test.mjs`

Expected: FAIL because `close-task.py` does not currently validate companion metadata.

- [ ] **Step 4: Commit the test harness and failing close tests**

```bash
git add tests/helpers/planning-lifecycle-fixture.mjs tests/core/companion-plan-lifecycle.test.mjs
git commit -m "test: cover companion lifecycle close flow"
```

## Task 2: Implement Shared Companion Consistency Checker And Close Sync

**Files:**
- Create: `harness/upstream/planning-with-files/scripts/companion_sync.py`
- Modify: `harness/upstream/planning-with-files/scripts/close-task.py`

- [ ] **Step 1: Add a shared checker that parses active and companion metadata**

```python
#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def parse_field(markdown: str, labels: list[str]) -> str | None:
    for label in labels:
        match = re.search(rf"^\s*(?:[-*]\s*)?{re.escape(label)}\s*:\s*(.*?)\s*$", markdown, re.MULTILINE | re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None


def inspect_companion_sync(project_path: Path, task_id: str) -> dict:
    task_plan = project_path / 'planning' / 'active' / task_id / 'task_plan.md'
    task_text = read_text(task_plan)
    companion_path = parse_field(task_text, ['Companion plan', 'Companion plan path'])
    if not companion_path:
        return {'has_companion': False, 'ok': True, 'reasons': []}

    companion_file = project_path / companion_path
    reasons: list[str] = []
    if not companion_file.exists():
        reasons.append(f'Companion plan does not exist: {companion_path}')
        return {'has_companion': True, 'ok': False, 'reasons': reasons, 'companion_path': companion_path}

    companion_text = read_text(companion_file)
    if not parse_field(task_text, ['Companion summary']):
        reasons.append('Active task is missing Companion summary')
    if not parse_field(task_text, ['Sync-back status']):
        reasons.append('Active task is missing Sync-back status')
    if not parse_field(companion_text, ['Active task path']):
        reasons.append('Companion plan is missing Active task path')
    if not parse_field(companion_text, ['Lifecycle state']):
        reasons.append('Companion plan is missing Lifecycle state')
    if not parse_field(companion_text, ['Sync-back status']):
        reasons.append('Companion plan is missing Sync-back status')

    return {
        'has_companion': True,
        'ok': len(reasons) == 0,
        'reasons': reasons,
        'companion_path': companion_path,
        'companion_file': str(companion_file),
      'companion_lifecycle_state': parse_field(companion_text, ['Lifecycle state']),
    }


def replace_field(markdown: str, label: str, value: str) -> str:
    pattern = re.compile(rf"^(\s*(?:[-*]\s*)?{re.escape(label)}\s*:\s*).*$", re.MULTILINE | re.IGNORECASE)
    replacement = f"- {label}: {value}"
    if pattern.search(markdown):
        return pattern.sub(replacement, markdown, count=1)
    return markdown.rstrip() + f"\n{replacement}\n"


def sync_close_state(project_path: Path, task_id: str, closed_at: str, reason: str) -> None:
    task_plan = project_path / 'planning' / 'active' / task_id / 'task_plan.md'
    task_text = read_text(task_plan)
    companion_path = parse_field(task_text, ['Companion plan', 'Companion plan path'])
    if not companion_path:
        return
    companion_file = project_path / companion_path
    companion_text = read_text(companion_file)
    companion_text = replace_field(companion_text, 'Lifecycle state', 'closed')
    companion_text = replace_field(companion_text, 'Sync-back status', f'closed at {closed_at}: {reason}')
    companion_file.write_text(companion_text, encoding='utf-8')

    task_text = replace_field(task_text, 'Sync-back status', f'closed at {closed_at}: {reason}')
    task_plan.write_text(task_text, encoding='utf-8')
```

- [ ] **Step 2: Integrate the checker into `close-task.py` and sync close-time metadata on success**

```python
from companion_sync import inspect_companion_sync, sync_close_state


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_path", nargs="?", default=".")
    parser.add_argument("task_id", nargs="?", default=None)
    parser.add_argument("--reason", default="Task completed and verified.")
    args = parser.parse_args()

    project_path = Path(args.project_path).resolve()
    plan_dir = planning_paths.active_dir(project_path, args.task_id)
    task_id = plan_dir.name
    task_plan = plan_dir / 'task_plan.md'

    sync_status = inspect_companion_sync(project_path, task_id)
    if sync_status['has_companion'] and not sync_status['ok']:
        for reason in sync_status['reasons']:
            print(f"[planning-with-files] Companion sync error: {reason}")
        return 2

    closed_at = datetime.now().isoformat(timespec="seconds")
    updated = update_current_state(read_text(task_plan), args.reason, closed_at)
    task_plan.write_text(updated, encoding="utf-8")
    if sync_status['has_companion']:
        sync_close_state(project_path, task_id, closed_at, args.reason)
    print(f"[planning-with-files] Closed task and marked archive eligible: {plan_dir}")
    return 0
```

- [ ] **Step 3: Extend the test slice so successful close rewrites companion metadata**

```js
test('close-task synchronizes companion lifecycle metadata on success', async () => {
  const fixture = await createPlanningLifecycleFixture();
  try {
    await writeActiveTask(fixture.root, 'task-a', {
      taskPlan: '# Task\n\n## Current State\nStatus: active\nArchive Eligible: no\nClose Reason:\n\n## Companion Plan\n- Companion plan: `docs/superpowers/plans/task-a.md`\n- Companion summary: lifecycle notes\n- Sync-back status: active draft\n'
    });
    const companionPath = await writeCompanion(
      fixture.root,
      'docs/superpowers/plans/task-a.md',
      '# Companion\n\n- Active task path: `planning/active/task-a/`\n- Lifecycle state: active\n- Sync-back status: active draft\n'
    );

    await runPythonScript(fixture.root, 'harness/upstream/planning-with-files/scripts/close-task.py', ['task-a']);
    const companion = await readFile(companionPath, 'utf8');
    assert.match(companion, /Lifecycle state: closed/);
    assert.match(companion, /Sync-back status:/);
  } finally {
    await fixture.cleanup();
  }
});
```

- [ ] **Step 4: Run the close-task slice and verify it passes**

Run: `node --test tests/core/companion-plan-lifecycle.test.mjs`

Expected: PASS for the close-task scenarios.

- [ ] **Step 5: Commit the close-flow implementation**

```bash
git add tests/core/companion-plan-lifecycle.test.mjs harness/upstream/planning-with-files/scripts/companion_sync.py harness/upstream/planning-with-files/scripts/close-task.py
git commit -m "feat: gate close-task on companion sync"
```

## Task 3: Add Failing Archive Blocking And Auto-Migration Tests

**Files:**
- Modify: `tests/core/companion-plan-lifecycle.test.mjs`

- [ ] **Step 1: Add a failing archive blocking test for unsynced companion state**

```js
test('archive-task blocks when companion lifecycle metadata is unsynced', async () => {
  const fixture = await createPlanningLifecycleFixture();
  try {
    await writeActiveTask(fixture.root, 'task-a', {
      taskPlan: '# Task\n\n## Current State\nStatus: closed\nArchive Eligible: yes\nClose Reason: done\n\n## Companion Plan\n- Companion plan: `docs/superpowers/plans/task-a.md`\n- Companion summary: lifecycle notes\n- Sync-back status: closed in active task\n'
    });
    await writeCompanion(
      fixture.root,
      'docs/superpowers/plans/task-a.md',
      '# Companion\n\n- Active task path: `planning/active/task-a/`\n- Lifecycle state: active\n- Sync-back status: stale active state\n'
    );

    await assert.rejects(
      () => runShellScript(fixture.root, 'harness/upstream/planning-with-files/scripts/archive-task.sh', ['task-a']),
      /companion lifecycle not yet `closed`|Companion sync error/
    );
  } finally {
    await fixture.cleanup();
  }
});
```

- [ ] **Step 2: Add a failing archive migration test that expects archive-local relocation**

```js
test('archive-task relocates the companion artifact into the archive directory', async () => {
  const fixture = await createPlanningLifecycleFixture();
  try {
    await writeActiveTask(fixture.root, 'task-a', {
      taskPlan: '# Task\n\n## Current State\nStatus: closed\nArchive Eligible: yes\nClose Reason: done\n\n## Companion Plan\n- Companion plan: `docs/superpowers/plans/task-a.md`\n- Companion summary: lifecycle notes\n- Sync-back status: closed\n'
    });
    await writeCompanion(
      fixture.root,
      'docs/superpowers/plans/task-a.md',
      '# Companion\n\n- Active task path: `planning/active/task-a/`\n- Lifecycle state: closed\n- Sync-back status: closed\n'
    );

    const { stdout } = await runShellScript(
      fixture.root,
      'harness/upstream/planning-with-files/scripts/archive-task.sh',
      ['task-a']
    );

    assert.match(stdout, /Archived active planning files to:/);
    const archiveRoot = path.join(fixture.root, 'planning/archive');
    const entries = await readdir(archiveRoot);
    assert.equal(entries.length, 1);
    const companion = await readFile(path.join(archiveRoot, entries[0], 'companion_plan.md'), 'utf8');
    assert.match(companion, /Lifecycle state: archived/);
    assert.match(companion, /Active task path: `planning\/archive\//);
  } finally {
    await fixture.cleanup();
  }
});
```

- [ ] **Step 3: Run the archive slice to verify the new expectations fail**

Run: `node --test tests/core/companion-plan-lifecycle.test.mjs`

Expected: FAIL because archive does not yet validate companion lifecycle or relocate companion artifacts.

- [ ] **Step 4: Commit the failing archive tests**

```bash
git add tests/core/companion-plan-lifecycle.test.mjs
git commit -m "test: cover companion archive lifecycle"
```

## Task 4: Implement Archive Gate, Auto-Migration, And Status Exposure

**Files:**
- Modify: `harness/upstream/planning-with-files/scripts/task-status.py`
- Modify: `harness/upstream/planning-with-files/scripts/planning_paths.py`
- Modify: `harness/upstream/planning-with-files/scripts/archive-task.sh`
- Modify: `harness/upstream/planning-with-files/scripts/companion_sync.py`

- [ ] **Step 1: Extend `task-status.py` with companion sync status and a blocking flag**

```python
from companion_sync import inspect_companion_sync


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_path", nargs="?", default=".")
    parser.add_argument("task_id", nargs="?", default=None)
    parser.add_argument("--json", action="store_true", help="emit JSON")
    parser.add_argument("--require-safe-to-archive", action="store_true")
    parser.add_argument(
        "--require-companion-synced",
        action="store_true",
        help="exit non-zero unless companion metadata is synchronized for lifecycle transitions",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    project_path = Path(args.project_path).resolve()
    plan_dir = planning_paths.active_dir(project_path, args.task_id)
    status = inspect_plan_dir(plan_dir)
    sync_status = inspect_companion_sync(project_path, plan_dir.name)
    status["companion_sync"] = sync_status

    if args.json:
        print(json.dumps(status, ensure_ascii=False, indent=2))
    else:
        print(format_summary(status))

    if args.require_safe_to_archive and not status["safe_to_archive"]:
        return 2
    if args.require_companion_synced and sync_status["has_companion"] and not sync_status["ok"]:
        return 3
    return 0
```

- [ ] **Step 2: Add archive-time relocation helpers to `planning_paths.py`**

```python
from companion_sync import parse_field, rewrite_archive_task_references, rewrite_companion_for_archive


def archive_companion_artifact(project_path: Path, archive_dir: Path) -> None:
    task_plan = archive_dir / 'task_plan.md'
    task_text = task_plan.read_text(encoding='utf-8')
    companion_path = parse_field(task_text, ['Companion plan', 'Companion plan path'])
    if not companion_path:
        return

    companion_source = project_path / companion_path
    companion_target = archive_dir / 'companion_plan.md'
    shutil.move(str(companion_source), str(companion_target))
    rewrite_archive_task_references(archive_dir, companion_target)
    rewrite_companion_for_archive(companion_target, archive_dir)


def archive_active_task(project_path: Path, task_id: Optional[str] = None) -> Path:
    source_dir = active_dir(project_path, task_id)
    status = inspect_plan_dir(source_dir)
    if not status['safe_to_archive']:
        raise RuntimeError(
            'active planning directory is not safe to archive: '
            f"{source_dir} ({status['reason']})"
        )

    timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    archive_dir = project_path / ARCHIVE_ROOT / f"{timestamp}-{source_dir.name}"
    archive_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source_dir), str(archive_dir))
    archive_companion_artifact(project_path, archive_dir)
    return archive_dir
```

- [ ] **Step 3: Make `archive-task.sh` require companion sync before calling archive-active**

```bash
"$PYTHON_BIN" "$SCRIPT_DIR/task-status.py" "$PROJECT_PATH" "$TASK_ID" --require-safe-to-archive --require-companion-synced
ARCHIVE_DIR="$($PYTHON_BIN "$SCRIPT_DIR/planning_paths.py" archive-active "$PROJECT_PATH" "$TASK_ID")"
echo "[planning-with-files] Archived active planning files to: $ARCHIVE_DIR"
```

- [ ] **Step 4: Teach `companion_sync.py` how to validate closed/archive lifecycle expectations and rewrite archive metadata**

```python
def require_lifecycle(sync_status: dict, expected_state: str) -> dict:
    reasons = list(sync_status['reasons'])
    if sync_status.get('has_companion') and sync_status.get('ok'):
        lifecycle_state = sync_status.get('companion_lifecycle_state')
        if lifecycle_state != expected_state:
            reasons.append(f'Companion lifecycle not yet `{expected_state}`')
    return {**sync_status, 'ok': len(reasons) == 0, 'reasons': reasons}


def rewrite_companion_for_archive(companion_path: Path, archive_dir: Path) -> None:
    text = read_text(companion_path)
    archive_relative = archive_dir.relative_to(archive_dir.parents[2]).as_posix()
    text = replace_field(text, 'Active task path', f'`{archive_relative}/`')
    text = replace_field(text, 'Lifecycle state', 'archived')
    text = replace_field(text, 'Sync-back status', 'archived during archive-task')
    companion_path.write_text(text, encoding='utf-8')
```

- [ ] **Step 5: Run the lifecycle test slice and verify the archive scenarios pass**

Run: `node --test tests/core/companion-plan-lifecycle.test.mjs`

Expected: PASS for close blocking, close sync, archive blocking, and archive relocation.

- [ ] **Step 6: Commit the archive implementation**

```bash
git add tests/core/companion-plan-lifecycle.test.mjs harness/upstream/planning-with-files/scripts/task-status.py harness/upstream/planning-with-files/scripts/planning_paths.py harness/upstream/planning-with-files/scripts/archive-task.sh harness/upstream/planning-with-files/scripts/companion_sync.py
git commit -m "feat: archive companion artifacts with lifecycle guards"
```

## Task 5: Document The New Lifecycle Contract

**Files:**
- Modify: `harness/upstream/planning-with-files/SKILL.md`
- Modify: `docs/maintenance.md`

- [ ] **Step 1: Update the planning-with-files skill guidance for close/archive companion synchronization**

```md
Recommended close flow:

1. Verify the task is complete.
2. Update `task_plan.md`, `findings.md`, and `progress.md` with durable conclusions.
3. If a companion plan exists, ensure the active task records `Companion plan`, `Companion summary`, and `Sync-back status`, and ensure the companion plan records `Active task path`, `Lifecycle state`, and `Sync-back status`.
4. Run `scripts/close-task.sh "$(pwd)" "<task-id>" "Task completed and verified."`.
5. Run `scripts/archive-task.sh "$(pwd)" "<task-id>"` only after the close step; archive will relocate the companion artifact automatically.
```

- [ ] **Step 2: Update maintenance docs with the archive auto-migration behavior**

```md
When a deep-reasoning task has a companion artifact, `archive-task` no longer leaves it under `docs/superpowers/plans/`. The archive flow validates companion lifecycle metadata first, then relocates the companion artifact into the archived task directory as `companion_plan.md`.
```

- [ ] **Step 3: Run the focused verification plus full repo verify**

Run: `node --test tests/core/companion-plan-lifecycle.test.mjs && npm run verify`

Expected: PASS.

- [ ] **Step 4: Commit the docs update**

```bash
git add harness/upstream/planning-with-files/SKILL.md docs/maintenance.md
git commit -m "docs: describe companion lifecycle guards"
```

## Task 6: Final Review And Task Sync-Back

**Files:**
- Modify: `planning/active/companion-plan-sync-constraints/task_plan.md`
- Modify: `planning/active/companion-plan-sync-constraints/findings.md`
- Modify: `planning/active/companion-plan-sync-constraints/progress.md`

- [ ] **Step 1: Update authoritative planning files with implementation results**

```md
## Current State
Status: closed
Archive Eligible: yes
Close Reason: Companion lifecycle guards and archive auto-migration were implemented and verified.
```

- [ ] **Step 2: Record verification evidence and final companion plan sync-back status**

```md
- Companion plan: `docs/superpowers/plans/2026-04-26-companion-plan-sync-constraints.md`
- Companion summary: hard-block close/archive lifecycle guard with archive-time companion relocation
- Sync-back status: executed on 2026-04-26 with lifecycle tests and full verify passing
```

- [ ] **Step 3: Commit the planning closeout**

```bash
git add planning/active/companion-plan-sync-constraints
git commit -m "docs: close companion sync constraints task"
```

## Self-Review Checklist

- Spec coverage: the plan covers the close gate, archive gate, archive auto-migration, warning-only health preservation, docs updates, and authoritative planning sync-back.
- Placeholder scan: no `TBD`, `TODO`, `FIXME`, or vague “handle later” steps remain.
- Type consistency: `Companion plan`, `Companion summary`, `Sync-back status`, `Active task path`, and `Lifecycle state` are used consistently across tests, implementation, and docs.
