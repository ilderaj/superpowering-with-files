# Claude Code Runtime Evidence Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not implement until the user explicitly approves this companion plan.

**Goal:** 为 Claude Code hooks 增加真实 runtime invocation evidence，并清理 `doctor` / `verify` / `adoption-status` 中容易误导的报告语义。

**Architecture:** 当前实现已经能证明 Claude Code settings hooks 存在、hook scripts 已 materialize、local hook payload 可被 Harness 直接执行；本计划只补上“Claude Code 运行时是否真的调用过这些 hooks”的证据层。做法是让 Harness-managed hook entrypoints 在真实被 Claude Code 调用时写入无敏感内容的 JSONL trace，`readHarnessHealth()` 只读解析该 trace，并把 evidence 合并到 health、doctor、verify 与 adoption receipt/status；无 trace 时继续保持 `runtime=not-measured`，不得把 config/payload 误报成 runtime invocation。

**Tech Stack:** Node.js ESM, Bash hook scripts, `node:test`, existing Harness installer commands.

---

## Companion Plan Metadata

- **Created:** 2026-05-28 10:02:21 UTC+8
- **Active task path:** `planning/active/sync-main-adopt-global-cleanup-review/`
- **Lifecycle state:** `active`
- **Review status:** waiting for user review; implementation not started
- **Sync-back status:** companion plan drafted; active planning files must stay authoritative for lifecycle/progress

## Current Ground Truth

已经完成且不应重复实现的内容：

- `harness/installer/lib/health.mjs` 已把 Claude Code 加入 local payload measurement：`MEASURED_HOOK_PAYLOAD_TARGETS` 包含 `claude-code`。
- Claude Code hook evidence 已拆成：`config=settings-hook-present`、`payload=local-payload-verified`、`runtime=not-measured`。
- `adopt-global` success receipt 已保留 `runtimeInvocationVerified: false`，避免把 `doctorPassed` 误解释为真实 Claude Code runtime invocation。
- 当前 global adopt 已生效到配置与本地 payload 层；仍未证明真实 Claude Code runtime invocation。

本计划只处理以下剩余问题：

1. 增加 runtime invocation trace，只有真实 hook entrypoint 被调用时才提升 runtime evidence。
2. 修正 `Hook payload target: copilot` 这类单数摘要在多 target measurement 下的歧义。
3. 增加 Claude Code settings resolution 报告，明确 workspace / workspace-local / user-global 哪些位置存在 hooks。
4. 保持 adoption semantics：没有 runtime trace 时仍然 `in_sync`，但输出 non-failing caveat；有 runtime trace 时移除该 caveat。
5. 防止本 companion plan 自身触发 companion-plan warning；历史 orphan companion warnings 另行清理，不与 runtime evidence 混为一谈。

## Non-goals

- 不改变默认 hooks policy；仍然只有用户显式选择 `--hooks=on` 才安装/合并 hooks。
- 不记录 user prompt、tool input、tool output、file paths from tool payloads，trace 只存 metadata。
- 不把 local payload execution 当作 runtime evidence。
- 不要求 `adopt-global` 主动触发 Claude Code hooks；它只能读取已有 runtime trace。
- 不清理所有历史 companion plans，除非用户另开 cleanup 任务。

## Runtime Trace Schema

Trace 文件建议路径：

```text
<repo-root>/.harness/runtime-hooks/claude-code.jsonl
```

单行 JSON schema：

```json
{
  "schemaVersion": 1,
  "source": "harness-runtime-hook",
  "target": "claude-code",
  "parentSkillName": "planning-with-files",
  "eventName": "UserPromptSubmit",
  "observedAt": "2026-05-28T02:02:21.000Z",
  "projectRoot": "/absolute/repo/root",
  "cwd": "/absolute/current/working/directory",
  "scriptName": "task-scoped-hook.sh",
  "scriptPath": "/absolute/path/to/materialized/hook/script"
}
```

Validation rules:

- `schemaVersion` must be `1`.
- `source` must be `harness-runtime-hook`.
- `target` must be `claude-code` for this plan.
- `parentSkillName` must match a projected Harness hook row.
- `eventName` must be one of that projection’s configured `eventNames`.
- `projectRoot` must equal the root passed to `readHarnessHealth(rootDir, homeDir)` after path normalization.
- `observedAt` must parse as a valid ISO timestamp.
- Unknown fields are ignored; invalid lines are reported as warnings, not health problems.

## File Structure

### Create

- `harness/core/hooks/shared/record-runtime-evidence.mjs`
  - Self-contained hook-side writer copied beside materialized hook scripts.
  - Appends safe metadata JSONL to `<projectRoot>/.harness/runtime-hooks/claude-code.jsonl`.
  - Must fail open: writer failure never blocks a hook.

- `harness/installer/lib/runtime-hook-evidence.mjs`
  - Installer-side reader/validator/summarizer.
  - Exports trace path resolution, line parsing, per-projection runtime evidence lookup, and `runtimeInvocationVerified` helper.

- `tests/installer/runtime-hook-evidence.test.mjs`
  - Focused unit tests for trace parsing, invalid-line handling, privacy boundary, and per-projection matching.

### Modify

- `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh`
  - Record runtime evidence once per actual invocation for Claude Code planning hooks.

- `harness/core/hooks/superpowers/scripts/session-start`
  - Record runtime evidence once per actual invocation for Claude Code SessionStart.

- `harness/core/hooks/safety/scripts/pretool-guard.sh`
  - Record runtime evidence once per actual invocation for Claude Code safety PreToolUse.

- `harness/core/hooks/safety/scripts/session-checkpoint.sh`
  - Record runtime evidence once per actual invocation for Claude Code safety SessionStart.

- `harness/installer/lib/hook-projection.mjs`
  - Copy `record-runtime-evidence.mjs` into each hook target root when hooks are projected.

- `harness/installer/lib/health.mjs`
  - Read runtime trace and attach runtime evidence to Claude Code hook rows.
  - Add Claude Code settings resolution detail.
  - Add multi-target hook payload summary fields while preserving old JSON fields for compatibility.

- `harness/installer/lib/hook-evidence-summary.mjs`
  - Include runtime trace status and metadata in summarized hook evidence.

- `harness/installer/commands/doctor.mjs`
  - Render plural payload targets / worst target explicitly.
  - Render Claude Code settings resolution.
  - Render runtime evidence metadata when present.

- `harness/installer/commands/verify.mjs`
  - Write the same evidence into markdown and JSON verification reports.

- `harness/installer/lib/adoption.mjs`
  - Compute non-failing caveat from live runtime evidence, not only the static receipt false value.

- `harness/installer/commands/adopt-global.mjs`
  - Store `runtimeInvocationVerified` based on summarized health evidence at adoption time.

- `tests/installer/health.test.mjs`
  - Add health-level runtime evidence and settings resolution assertions.

- `tests/installer/commands.test.mjs`
  - Add doctor/verify output assertions for plural payload summary and runtime evidence.

- `tests/installer/adoption.test.mjs`
  - Add receipt/status assertions for runtime verified vs not measured.

- `docs/install/claude-code.md`
  - Document evidence levels and the privacy boundary of runtime trace.

## Task 1: Add Runtime Trace Reader/Writer Tests First

**Files:**
- Create: `tests/installer/runtime-hook-evidence.test.mjs`
- Create later: `harness/installer/lib/runtime-hook-evidence.mjs`

- [ ] **Step 1: Write parser tests for valid Claude Code trace lines**

```js
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createHarnessFixture, removeHarnessFixture } from './helpers/fixture.mjs';
import {
  readRuntimeHookEvidence,
  runtimeEvidenceLogPath,
  summarizeRuntimeEvidenceForProjection
} from '../../harness/installer/lib/runtime-hook-evidence.mjs';

test('readRuntimeHookEvidence reads valid Claude Code runtime trace lines', async () => {
  const root = await createHarnessFixture();
  try {
    const logPath = runtimeEvidenceLogPath(root, 'claude-code');
    await mkdir(path.dirname(logPath), { recursive: true });
    await writeFile(
      logPath,
      `${JSON.stringify({
        schemaVersion: 1,
        source: 'harness-runtime-hook',
        target: 'claude-code',
        parentSkillName: 'planning-with-files',
        eventName: 'UserPromptSubmit',
        observedAt: '2026-05-28T02:02:21.000Z',
        projectRoot: root,
        cwd: root,
        scriptName: 'task-scoped-hook.sh',
        scriptPath: path.join(root, '.claude/hooks/task-scoped-hook.sh')
      })}\n`
    );

    const evidence = await readRuntimeHookEvidence(root, 'claude-code');

    assert.equal(evidence.records.length, 1);
    assert.equal(evidence.records[0].parentSkillName, 'planning-with-files');
    assert.equal(evidence.records[0].eventName, 'UserPromptSubmit');
    assert.deepEqual(evidence.warnings, []);
  } finally {
    await removeHarnessFixture(root);
  }
});
```

Expected before implementation: test fails with missing export.

- [ ] **Step 2: Write invalid-line and privacy-boundary tests**

```js
test('readRuntimeHookEvidence ignores invalid lines and reports warnings', async () => {
  const root = await createHarnessFixture();
  try {
    const logPath = runtimeEvidenceLogPath(root, 'claude-code');
    await mkdir(path.dirname(logPath), { recursive: true });
    await writeFile(logPath, '{not-json}\n');

    const evidence = await readRuntimeHookEvidence(root, 'claude-code');

    assert.equal(evidence.records.length, 0);
    assert.equal(evidence.warnings.length, 1);
    assert.match(evidence.warnings[0], /invalid runtime hook evidence/i);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('summarizeRuntimeEvidenceForProjection rejects mismatched project roots and events', async () => {
  const root = await createHarnessFixture();
  try {
    const records = [
      {
        schemaVersion: 1,
        source: 'harness-runtime-hook',
        target: 'claude-code',
        parentSkillName: 'planning-with-files',
        eventName: 'Stop',
        observedAt: '2026-05-28T02:02:21.000Z',
        projectRoot: '/other/root',
        cwd: '/other/root',
        scriptName: 'task-scoped-hook.sh',
        scriptPath: '/other/root/.claude/hooks/task-scoped-hook.sh'
      }
    ];

    const summary = summarizeRuntimeEvidenceForProjection(
      { target: 'claude-code', parentSkillName: 'planning-with-files', eventNames: ['UserPromptSubmit'] },
      { records, warnings: [] },
      root
    );

    assert.equal(summary.runtimeEvidence, 'not-measured');
    assert.equal(summary.lastObservedAt, null);
  } finally {
    await removeHarnessFixture(root);
  }
});
```

Expected before implementation: test fails with missing export.

## Task 2: Implement Runtime Trace Writer and Reader

**Files:**
- Create: `harness/core/hooks/shared/record-runtime-evidence.mjs`
- Create: `harness/installer/lib/runtime-hook-evidence.mjs`

- [ ] **Step 1: Implement the hook-side writer**

`harness/core/hooks/shared/record-runtime-evidence.mjs` should be self-contained and accept only metadata arguments:

```js
#!/usr/bin/env node
import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? '' : process.argv[index + 1] ?? '';
}

function resolveProjectRoot() {
  return readArg('project-root') || process.env.HARNESS_PROJECT_ROOT || process.cwd();
}

const projectRoot = path.resolve(resolveProjectRoot());
const target = readArg('target') || 'claude-code';
const parentSkillName = readArg('parent-skill') || 'unknown';
const eventName = readArg('event') || 'unknown';
const scriptPath = readArg('script-path') || '';

if (target !== 'claude-code') {
  process.exit(0);
}

const record = {
  schemaVersion: 1,
  source: 'harness-runtime-hook',
  target,
  parentSkillName,
  eventName,
  observedAt: new Date().toISOString(),
  projectRoot,
  cwd: path.resolve(process.cwd()),
  scriptName: scriptPath ? path.basename(scriptPath) : 'unknown',
  scriptPath: scriptPath ? path.resolve(scriptPath) : ''
};

const logPath = path.join(projectRoot, '.harness/runtime-hooks/claude-code.jsonl');
await mkdir(path.dirname(logPath), { recursive: true });
await appendFile(logPath, `${JSON.stringify(record)}\n`, 'utf8');
```

Implementation notes:
- Do not read stdin.
- Do not write prompt/tool payloads.
- Do not throw through shell hooks; shell callers must redirect failures and continue.

- [ ] **Step 2: Implement installer-side reader and matcher**

`harness/installer/lib/runtime-hook-evidence.mjs` should export:

```js
export function runtimeEvidenceLogPath(rootDir, target = 'claude-code') { ... }
export async function readRuntimeHookEvidence(rootDir, target = 'claude-code') { ... }
export function summarizeRuntimeEvidenceForProjection(projection, evidence, rootDir) { ... }
export function runtimeInvocationVerifiedFromHookEvidence(hookEvidence, target = 'claude-code') { ... }
```

Expected behavior:
- Missing log file returns `{ records: [], warnings: [] }`.
- Malformed JSON line produces warning and is skipped.
- Valid but mismatched root/target/skill/event is skipped for the current projection.
- Matching record returns:

```js
{
  runtimeEvidence: 'runtime-invocation-verified',
  lastObservedAt: '2026-05-28T02:02:21.000Z',
  observedEvents: ['UserPromptSubmit']
}
```

- No matching record returns:

```js
{
  runtimeEvidence: 'not-measured',
  lastObservedAt: null,
  observedEvents: []
}
```

## Task 3: Wire Trace Writer Into Claude Code Hook Entrypoints

**Files:**
- Modify: `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh`
- Modify: `harness/core/hooks/superpowers/scripts/session-start`
- Modify: `harness/core/hooks/safety/scripts/pretool-guard.sh`
- Modify: `harness/core/hooks/safety/scripts/session-checkpoint.sh`
- Modify: `harness/installer/lib/hook-projection.mjs`

- [ ] **Step 1: Add a shared Bash helper pattern to each shell hook**

Use this pattern near the top of each hook script after `target`, `event`, `root`, and `script_dir` are known:

```bash
record_runtime_evidence() {
  if [ "${target:-}" != "claude-code" ]; then
    return 0
  fi

  local recorder="$script_dir/record-runtime-evidence.mjs"
  if [ ! -f "$recorder" ]; then
    return 0
  fi

  node "$recorder" \
    --target "$target" \
    --parent-skill "planning-with-files" \
    --event "$(canonical_hook_event_name "${event:-UserPromptSubmit}")" \
    --project-root "$root" \
    --script-path "${BASH_SOURCE[0]}" >/dev/null 2>&1 || true
}
```

Per-file details:
- In `task-scoped-hook.sh`, `parent-skill` is `planning-with-files`, and event comes from the existing `$event` after canonicalization.
- In `session-start`, `parent-skill` is `superpowers`, and event is `SessionStart`.
- In `pretool-guard.sh`, `parent-skill` is `safety`, and event is `PreToolUse`.
- In `session-checkpoint.sh`, `parent-skill` is `safety`, and event is `SessionStart`.

Call `record_runtime_evidence` once per invocation before any early `exit 0` paths that represent successful hook execution. Do not call it for unsupported targets.

- [ ] **Step 2: Copy the shared recorder into hook target roots**

Modify `harness/installer/lib/hook-projection.mjs`:

```js
const RUNTIME_EVIDENCE_SCRIPT = 'harness/core/hooks/shared/record-runtime-evidence.mjs';

function runtimeEvidenceScript(rootDir) {
  return path.join(rootDir, RUNTIME_EVIDENCE_SCRIPT);
}
```

Append `runtimeEvidenceScript(rootDir)` to:
- `taskScopedPlanningProjection().scriptSourcePaths`
- `configuredHookProjection().scriptSourcePaths`
- `safetyHookProjection().scriptSourcePaths`

Expected: after `sync`, `.claude/hooks/record-runtime-evidence.mjs` exists alongside hook entrypoints.

## Task 4: Integrate Runtime Evidence and Settings Resolution Into Health

**Files:**
- Modify: `harness/installer/lib/health.mjs`
- Modify: `harness/installer/lib/hook-evidence-summary.mjs`
- Create or fold into health: `harness/installer/lib/claude-settings-resolution.mjs`
- Modify: `tests/installer/health.test.mjs`

- [ ] **Step 1: Add health test for runtime-verified Claude Code hook rows**

Add a test near existing Claude Code health tests:

```js
test('readHarnessHealth upgrades Claude Code runtime evidence when a runtime trace exists', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        'claude-code': { enabled: true, paths: [path.join(root, 'CLAUDE.md')] }
      },
      upstream: {}
    });

    await mkdir(path.join(root, 'planning/active/compact-task'), { recursive: true });
    await writeFile(path.join(root, 'planning/active/compact-task/task_plan.md'), '# Compact Task\n\n## Current State\nStatus: active\nArchive Eligible: no\n');
    await writeFile(path.join(root, 'planning/active/compact-task/findings.md'), '# Findings\n');
    await writeFile(path.join(root, 'planning/active/compact-task/progress.md'), '# Progress\n');

    await withCwd(root, () => sync([]));
    await mkdir(path.join(root, '.harness/runtime-hooks'), { recursive: true });
    await writeFile(
      path.join(root, '.harness/runtime-hooks/claude-code.jsonl'),
      `${JSON.stringify({
        schemaVersion: 1,
        source: 'harness-runtime-hook',
        target: 'claude-code',
        parentSkillName: 'planning-with-files',
        eventName: 'UserPromptSubmit',
        observedAt: '2026-05-28T02:02:21.000Z',
        projectRoot: root,
        cwd: root,
        scriptName: 'task-scoped-hook.sh',
        scriptPath: path.join(root, '.claude/hooks/task-scoped-hook.sh')
      })}\n`
    );

    const health = await readHarnessHealth(root, '/home/user');
    const planning = health.targets['claude-code'].hooks.find(
      (hook) => hook.parentSkillName === 'planning-with-files'
    );

    assert.equal(planning.runtimeEvidence, 'runtime-invocation-verified');
    assert.equal(planning.runtime.lastObservedAt, '2026-05-28T02:02:21.000Z');
    assert.deepEqual(planning.runtime.observedEvents, ['UserPromptSubmit']);
  } finally {
    await removeHarnessFixture(root);
  }
});
```

- [ ] **Step 2: Attach runtime evidence in `inspectHook()`**

In `readHarnessHealth()`, read runtime evidence once per target before hook inspection:

```js
const runtimeEvidenceByTarget = {
  'claude-code': await readRuntimeHookEvidence(rootDir, 'claude-code')
};
```

When `inspectHook(projection)` returns an ok Claude Code hook row, merge:

```js
const runtime = summarizeRuntimeEvidenceForProjection(
  projection,
  runtimeEvidenceByTarget[projection.target] ?? { records: [], warnings: [] },
  rootDir
);

return {
  ...projection,
  ...hookEvidence(projection),
  runtimeEvidence: runtime.runtimeEvidence,
  runtime,
  status: 'ok'
};
```

Keep `runtimeEvidence: 'not-measured'` when no matching trace exists.

- [ ] **Step 3: Add settings resolution summary**

Add health context shape:

```js
health.targets['claude-code'].settings = {
  resolution: [
    {
      scope: 'workspace',
      path: '<rootDir>/.claude/settings.json',
      exists: true,
      hookEvents: ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'],
      harnessManagedEntries: 4
    },
    {
      scope: 'workspace-local',
      path: '<rootDir>/.claude/settings.local.json',
      exists: false,
      hookEvents: [],
      harnessManagedEntries: 0
    },
    {
      scope: 'user-global',
      path: '<homeDir>/.claude/settings.json',
      exists: true,
      hookEvents: ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'],
      harnessManagedEntries: 5
    }
  ]
};
```

Do not claim exact Claude Code precedence unless Harness has a source-backed resolver. Label this section as “settings locations inspected,” not “effective runtime settings.”

- [ ] **Step 4: Update hook evidence summary**

Extend `summarizeHookEvidence(health)` rows to preserve metadata:

```js
summary[row.target][row.parentSkillName] = {
  config: row.config,
  payload: row.payload,
  runtime: row.runtime,
  lastObservedAt: row.lastObservedAt ?? null,
  observedEvents: row.observedEvents ?? []
};
```

Expected for no trace: runtime remains `not-measured`, metadata is empty/null.

## Task 5: Fix Multi-target Hook Payload Reporting

**Files:**
- Modify: `harness/installer/lib/health.mjs`
- Modify: `harness/installer/commands/doctor.mjs`
- Modify: `harness/installer/commands/verify.mjs`
- Modify: `tests/installer/commands.test.mjs`
- Modify: `tests/installer/copilot-usage-budget.test.mjs`

- [ ] **Step 1: Add backward-compatible summary fields**

Keep existing fields for compatibility:

```js
health.context.summary.hooks.target
health.context.summary.hooks.verdict
health.context.summary.hooks.accounting
```

Add explicit multi-target fields:

```js
health.context.summary.hooks.targets = ['claude-code', 'copilot'];
health.context.summary.hooks.worstTarget = 'copilot';
health.context.summary.hooks.worstEventName = 'userPromptSubmit';
```

`target` can remain an alias for `worstTarget` until a schema version bump.

- [ ] **Step 2: Change doctor output labels**

Replace single-target wording:

```text
Hook payload target: copilot
```

with:

```text
Hook payload targets: claude-code, copilot
Hook payload worst target: copilot
Hook payload accounting: worst-event
```

- [ ] **Step 3: Change verify markdown labels**

Render the same plural labels in `latest.md`, and keep JSON fields under `health.context.summary.hooks`.

- [ ] **Step 4: Update tests that currently assert `.target` only**

Existing tests can keep asserting `target === 'copilot'` for compatibility, but add assertions for:

```js
assert.deepEqual(report.health.context.summary.hooks.targets.sort(), ['claude-code', 'copilot']);
assert.equal(report.health.context.summary.hooks.worstTarget, 'copilot');
```

## Task 6: Update Doctor, Verify, and Adoption Semantics

**Files:**
- Modify: `harness/installer/commands/doctor.mjs`
- Modify: `harness/installer/commands/verify.mjs`
- Modify: `harness/installer/lib/adoption.mjs`
- Modify: `harness/installer/commands/adopt-global.mjs`
- Modify: `tests/installer/commands.test.mjs`
- Modify: `tests/installer/adoption.test.mjs`

- [ ] **Step 1: Render runtime evidence without overclaiming**

Doctor hook evidence should become:

```text
- claude-code / planning-with-files: config=settings-hook-present, payload=local-payload-verified, runtime=runtime-invocation-verified, lastObservedAt=2026-05-28T02:02:21.000Z, events=UserPromptSubmit
```

When absent, keep current wording:

```text
- claude-code / planning-with-files: config=settings-hook-present, payload=local-payload-verified, runtime=not-measured
```

- [ ] **Step 2: Render Claude Code settings locations**

Doctor should add a section:

```text
Claude Code settings locations:
- workspace: <root>/.claude/settings.json hooks=missing harnessEntries=0
- workspace-local: <root>/.claude/settings.local.json hooks=none harnessEntries=0
- user-global: <home>/.claude/settings.json hooks=SessionStart,UserPromptSubmit,PreToolUse,PostToolUse,Stop harnessEntries=5
```

This section is diagnostic; missing workspace hooks must not be a problem when state scope is `user-global` and user-global settings satisfy the expected projections.

- [ ] **Step 3: Compute receipt runtime flag from health evidence**

In `adopt-global.mjs`, replace hard-coded false:

```js
runtimeInvocationVerified: false
```

with:

```js
runtimeInvocationVerified: runtimeInvocationVerifiedFromHookEvidence(
  summarizeHookEvidence(health),
  'claude-code'
)
```

Expected behavior:
- No trace: receipt remains `false`.
- Trace for every enabled Claude Code hook parent skill: receipt becomes `true`.

- [ ] **Step 4: Make adoption-status caveat live-evidence aware**

In `computeAdoptionStatus()`, use current health evidence:

```js
const currentRuntimeInvocationVerified = runtimeInvocationVerifiedFromHookEvidence(
  summarizeHookEvidence(health),
  'claude-code'
);
```

Only add the existing caveat when current runtime evidence is still not measured:

```text
Claude Code runtime hook invocation is not measured; local settings and payload checks passed only.
```

If current evidence is verified but the old receipt snapshot is false, add at most an informational reason:

```text
Claude Code runtime hook invocation has been observed after adoption; rerun adopt-global to refresh the receipt snapshot.
```

Do not downgrade `status` for either case.

- [ ] **Step 5: Update adoption tests**

Add two cases:

1. No trace keeps current behavior: `runtimeInvocationVerified === false` and caveat exists.
2. Trace exists before `adopt-global`: receipt stores `runtimeInvocationVerified === true`, hookEvidence runtime is `runtime-invocation-verified`, and `adoption-status` omits the not-measured caveat.

## Task 7: Keep Companion-plan Hygiene Separate

**Files:**
- Modify only if user approves cleanup: existing orphan or stale files under `docs/superpowers/plans/` and their corresponding `planning/active/**` records.
- No code changes required for the core runtime evidence feature.

- [ ] **Step 1: Do not mix old companion-plan warnings into Claude Code evidence verdicts**

Current `doctor --check-only` can pass while showing pre-existing companion-plan warnings. Keep these warnings under planning hygiene sections; do not make them part of Claude Code hook evidence.

- [ ] **Step 2: Ensure this new companion plan is warning-free**

This file already includes:

```text
Active task path: planning/active/sync-main-adopt-global-cleanup-review/
```

The active task files must include:

```text
Companion plan: docs/superpowers/plans/2026-05-28-claude-code-runtime-evidence.md
Companion summary: Claude Code runtime invocation trace/evidence follow-up plan.
Sync-back status: companion plan drafted for review; implementation not started.
```

- [ ] **Step 3: If user wants historical warning cleanup, create a separate task**

Separate cleanup should inventory each warning, classify as orphan vs missing back-reference, then update or archive the relevant task records. It should not be required to ship runtime evidence.

## Task 8: Verification Commands for the Implementer

Run these after implementation, not during plan review:

```bash
node --test tests/installer/runtime-hook-evidence.test.mjs
node --test tests/installer/health.test.mjs
node --test tests/installer/commands.test.mjs
node --test tests/installer/adoption.test.mjs
node --test tests/installer/copilot-usage-budget.test.mjs
npm test
./scripts/harness sync --dry-run
./scripts/harness doctor --check-only
./scripts/harness verify --output=.harness/verification/claude-code-runtime-evidence
```

Expected outcomes:

- Tests pass.
- `sync --dry-run` shows no unexpected user-global writes.
- Without a runtime trace, `doctor` reports `runtime=not-measured` and `adoption-status` keeps the existing non-failing caveat.
- After a real Claude Code hook invocation writes trace, `doctor` reports `runtime=runtime-invocation-verified` with timestamp/events.
- `verify` JSON includes runtime metadata without prompt/tool payload content.

## Execution Gate

This companion plan is ready for review only. Do not modify implementation files until the user explicitly approves execution.
