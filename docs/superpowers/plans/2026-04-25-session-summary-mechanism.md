# Session Summary Mechanism Implementation Plan

> **Companion plan.** Authoritative task memory lives at
> [planning/active/session-summary-mechanism/](../../../planning/active/session-summary-mechanism/)
> (`task_plan.md`, `findings.md`, `progress.md`). This file holds the detailed
> implementation checklist that would be too verbose for `task_plan.md`.
> Per Harness AGENTS.md "Companion Plan Model": durable decisions and
> lifecycle status stay in the active task files; this file is a secondary
> artifact and may be moved/archived without losing task state.
>
> Sync-back status: phases 2-4 in `task_plan.md` reflect this checklist's
> coarse stages; durable decisions are mirrored into `findings.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 harness 在一轮 session 收尾时输出一个结构化、精炼的总结，数据源自 planning files（`task_plan.md` / `progress.md` / `findings.md`）和 hook lifecycle 信号，而非模型自由发挥。

**Architecture:** 新增一个纯函数渲染器 `session-summary.mjs`，复用现有 `planning-hot-context.mjs` 的 markdown 解析助手；通过 `task-scoped-hook.sh` 在 `session-start` 写入 `.session-start` sidecar、在 `stop / agent-stop / session-end` 读取并渲染总结；同时暴露 `harness summary` CLI 子命令做镜像，覆盖 hookMode=off 场景。

**Tech Stack:** Node.js (ESM, `node:fs/promises`), Bash (POSIX-compatible), node:test fixture 模式（沿用 `tests/hooks/task-scoped-hook.test.mjs`）。

---

## File Structure

| 路径 | 责任 | 类型 |
|------|------|------|
| `harness/core/hooks/planning-with-files/scripts/session-summary.mjs` | 纯函数：解析 planning files → 结构化对象 → 渲染文本；导出 `buildSessionSummary`、`extractPhases`、`formatDuration` | Create |
| `harness/core/hooks/planning-with-files/scripts/render-session-summary.mjs` | 薄 CLI 包装；接收路径与 sidecar epoch 参数 | Create |
| `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh` | 增加 `session-start` 写 sidecar；改写 `stop / agent-stop / session-end` 调用渲染器；读取并清理 sidecar | Modify |
| `harness/installer/lib/session-summary.mjs` | re-export shim（与 `planning-hot-context.mjs` 同模式） | Create |
| `harness/installer/commands/summary.mjs` | `harness summary` 命令实现 | Create |
| `harness/installer/commands/harness.mjs` | 注册新命令 | Modify |
| `tests/hooks/session-summary.test.mjs` | 渲染器单元测试 | Create |
| `tests/hooks/task-scoped-hook.test.mjs` | 增加 stop 事件 + sidecar 集成断言 | Modify |
| `tests/installer/summary-command.test.mjs` | CLI 子命令测试 | Create |
| `planning/active/session-summary-mechanism/task_plan.md` | 标记 phase 完成 | Modify |
| `planning/active/session-summary-mechanism/progress.md` | 持续记录 | Modify |

**输出契约（25 行典型，硬上限 160 行 / 12000 chars，对齐 `hookPayload.warn`）：**

```
[planning-with-files] SESSION SUMMARY
Task: <title> (<task-id>)
Status: <status>  Phases: 2/5  Duration: 47m

Conclusion:
- <progress.md 最后一条 bullet | task_plan.md Close Reason | "no conclusion recorded">

Checklist:
- [x] Phase 1: Requirements & Discovery
- [~] Phase 2: Planning & Structure
- [ ] Phase 3: Implementation

Key findings:
- <bullet> (≤3 条，每条 ≤180 字符)

Verification:
- Tests: 4/5 (or "none recorded")
- Errors logged: 1

Next:
- <第一个 pending phase 标题 | "—">

Sources: planning/active/<task-id>/{task_plan.md,progress.md,findings.md}
```

---

## Task 1: 渲染器骨架 + Phase 解析（TDD）

**Files:**
- Create: `harness/core/hooks/planning-with-files/scripts/session-summary.mjs`
- Test: `tests/hooks/session-summary.test.mjs`

- [ ] **Step 1: 写第一个失败测试 — phase 解析**

创建 `tests/hooks/session-summary.test.mjs`：

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { extractPhases } from '../../harness/core/hooks/planning-with-files/scripts/session-summary.mjs';

test('extractPhases parses ### Phase headings with **Status:** field', () => {
  const md = [
    '# Task',
    '## Phases',
    '### Phase 1: Discovery',
    '- [x] thing',
    '- **Status:** complete',
    '### Phase 2: Build',
    '- **Status:** in_progress',
    '### Phase 3: Ship',
    '- **Status:** pending'
  ].join('\n');

  const phases = extractPhases(md);
  assert.equal(phases.length, 3);
  assert.deepEqual(phases[0], { title: 'Phase 1: Discovery', status: 'complete' });
  assert.deepEqual(phases[1], { title: 'Phase 2: Build', status: 'in_progress' });
  assert.deepEqual(phases[2], { title: 'Phase 3: Ship', status: 'pending' });
});

test('extractPhases falls back to [complete]/[pending] inline markers', () => {
  const md = [
    '### Phase 1: A [complete]',
    '### Phase 2: B [pending]'
  ].join('\n');
  const phases = extractPhases(md);
  assert.equal(phases[0].status, 'complete');
  assert.equal(phases[1].status, 'pending');
});

test('extractPhases returns [] when no phases present', () => {
  assert.deepEqual(extractPhases('# Empty\n\nbody'), []);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test tests/hooks/session-summary.test.mjs
```

Expected: FAIL with "Cannot find module .../session-summary.mjs"

- [ ] **Step 3: 写最小实现**

创建 `harness/core/hooks/planning-with-files/scripts/session-summary.mjs`：

```javascript
function normalizeText(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

const STATUS_VALUES = ['complete', 'in_progress', 'pending'];

export function extractPhases(markdown) {
  const text = normalizeText(markdown);
  const lines = text.split('\n');
  const phases = [];

  for (let i = 0; i < lines.length; i += 1) {
    const headingMatch = lines[i].match(/^###\s+(Phase[^[\n]*?)(?:\s*\[(complete|in_progress|pending)\])?\s*$/);
    if (!headingMatch) continue;

    const title = headingMatch[1].trim();
    let status = headingMatch[2] ?? null;

    for (let j = i + 1; j < lines.length; j += 1) {
      if (/^#{1,6}\s+/.test(lines[j])) break;
      const statusMatch = lines[j].match(/^\s*[-*]?\s*\*\*Status:\*\*\s*(\w+)/i);
      if (statusMatch && STATUS_VALUES.includes(statusMatch[1].toLowerCase())) {
        status = statusMatch[1].toLowerCase();
        break;
      }
    }

    phases.push({ title, status: status ?? 'pending' });
  }

  return phases;
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test tests/hooks/session-summary.test.mjs
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add harness/core/hooks/planning-with-files/scripts/session-summary.mjs tests/hooks/session-summary.test.mjs
git commit -m "feat(session-summary): add phase extraction"
```

---

## Task 2: Duration 格式化（TDD）

**Files:**
- Modify: `harness/core/hooks/planning-with-files/scripts/session-summary.mjs`
- Test: `tests/hooks/session-summary.test.mjs`

- [ ] **Step 1: 追加失败测试**

在 `tests/hooks/session-summary.test.mjs` 末尾追加：

```javascript
import { formatDuration } from '../../harness/core/hooks/planning-with-files/scripts/session-summary.mjs';

test('formatDuration returns "unavailable" when start missing', () => {
  assert.equal(formatDuration(null, Date.now()), 'unavailable');
  assert.equal(formatDuration(undefined, Date.now()), 'unavailable');
});

test('formatDuration returns Hh Mm format', () => {
  const start = 1_700_000_000_000;
  assert.equal(formatDuration(start, start + 47 * 60_000), '47m');
  assert.equal(formatDuration(start, start + (2 * 3600 + 5 * 60) * 1000), '2h 5m');
  assert.equal(formatDuration(start, start + 30_000), '<1m');
});

test('formatDuration handles negative/zero gracefully', () => {
  const now = Date.now();
  assert.equal(formatDuration(now + 1000, now), 'unavailable');
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test tests/hooks/session-summary.test.mjs
```

Expected: FAIL with "formatDuration is not a function"

- [ ] **Step 3: 实现并追加导出**

在 `session-summary.mjs` 末尾追加：

```javascript
export function formatDuration(startMs, endMs) {
  if (startMs == null || !Number.isFinite(Number(startMs))) return 'unavailable';
  const start = Number(startMs);
  const end = Number(endMs);
  if (!Number.isFinite(end) || end <= start) return 'unavailable';

  const totalMinutes = Math.floor((end - start) / 60_000);
  if (totalMinutes < 1) return '<1m';

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test tests/hooks/session-summary.test.mjs
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "feat(session-summary): add duration formatting"
```

---

## Task 3: 主渲染函数 `buildSessionSummary`（TDD）

**Files:**
- Modify: `harness/core/hooks/planning-with-files/scripts/session-summary.mjs`
- Test: `tests/hooks/session-summary.test.mjs`

- [ ] **Step 1: 追加 fixture-driven 失败测试**

在 `session-summary.test.mjs` 末尾追加：

```javascript
import { buildSessionSummary } from '../../harness/core/hooks/planning-with-files/scripts/session-summary.mjs';

async function makeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'session-summary-'));
  const taskDir = path.join(root, 'planning/active/demo-task');
  await mkdir(taskDir, { recursive: true });
  await writeFile(path.join(taskDir, 'task_plan.md'), [
    '# Demo Task',
    '## Goal',
    'Build the thing.',
    '## Current State',
    'Status: active',
    'Archive Eligible: no',
    'Close Reason:',
    '## Phases',
    '### Phase 1: Discovery',
    '- **Status:** complete',
    '### Phase 2: Build',
    '- **Status:** in_progress',
    '### Phase 3: Ship',
    '- **Status:** pending'
  ].join('\n'));
  await writeFile(path.join(taskDir, 'findings.md'), [
    '# Findings',
    '- First insight that matters.',
    '- Second insight.',
    '- Third insight.',
    '- Fourth (should be dropped).'
  ].join('\n'));
  await writeFile(path.join(taskDir, 'progress.md'), [
    '# Progress',
    '## Session: 2026-04-25',
    '- Did A.',
    '- Did B.',
    '- Did C (latest).'
  ].join('\n'));
  return { root, taskDir };
}

test('buildSessionSummary renders contract sections', async () => {
  const { root, taskDir } = await makeFixture();
  try {
    const start = 1_700_000_000_000;
    const out = await buildSessionSummary({
      taskPlanPath: path.join(taskDir, 'task_plan.md'),
      findingsPath: path.join(taskDir, 'findings.md'),
      progressPath: path.join(taskDir, 'progress.md'),
      sessionStartEpoch: start,
      now: start + 47 * 60_000
    });

    assert.match(out, /\[planning-with-files\] SESSION SUMMARY/);
    assert.match(out, /Task: Demo Task \(demo-task\)/);
    assert.match(out, /Status: active\s+Phases: 1\/3\s+Duration: 47m/);
    assert.match(out, /Conclusion:\n- Did C \(latest\)\./);
    assert.match(out, /- \[x\] Phase 1: Discovery/);
    assert.match(out, /- \[~\] Phase 2: Build/);
    assert.match(out, /- \[ \] Phase 3: Ship/);
    assert.match(out, /Key findings:\n- First insight that matters\.\n- Second insight\.\n- Third insight\./);
    assert.doesNotMatch(out, /Fourth/);
    assert.match(out, /Next:\n- Phase 3: Ship/);
    assert.match(out, /Sources: planning\/active\/demo-task/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildSessionSummary falls back when sidecar missing', async () => {
  const { root, taskDir } = await makeFixture();
  try {
    const out = await buildSessionSummary({
      taskPlanPath: path.join(taskDir, 'task_plan.md'),
      findingsPath: path.join(taskDir, 'findings.md'),
      progressPath: path.join(taskDir, 'progress.md'),
      sessionStartEpoch: null,
      now: Date.now()
    });
    assert.match(out, /Duration: unavailable/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildSessionSummary respects hookPayload budget', async () => {
  const { root, taskDir } = await makeFixture();
  try {
    const out = await buildSessionSummary({
      taskPlanPath: path.join(taskDir, 'task_plan.md'),
      findingsPath: path.join(taskDir, 'findings.md'),
      progressPath: path.join(taskDir, 'progress.md'),
      sessionStartEpoch: null,
      now: Date.now()
    });
    assert.ok(out.length <= 12000, `length ${out.length} exceeds 12000`);
    assert.ok(out.split('\n').length <= 160, `lines exceed 160`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildSessionSummary uses Close Reason when status is closed', async () => {
  const { root, taskDir } = await makeFixture();
  try {
    await writeFile(path.join(taskDir, 'task_plan.md'), [
      '# Demo Task',
      '## Current State',
      'Status: closed',
      'Archive Eligible: yes',
      'Close Reason: Verified and merged.',
      '## Phases',
      '### Phase 1: Discovery',
      '- **Status:** complete'
    ].join('\n'));
    const out = await buildSessionSummary({
      taskPlanPath: path.join(taskDir, 'task_plan.md'),
      findingsPath: path.join(taskDir, 'findings.md'),
      progressPath: path.join(taskDir, 'progress.md'),
      sessionStartEpoch: null,
      now: Date.now()
    });
    assert.match(out, /Conclusion:\n- Verified and merged\./);
    assert.match(out, /Next:\n- —/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test tests/hooks/session-summary.test.mjs
```

Expected: FAIL — `buildSessionSummary is not a function`

- [ ] **Step 3: 实现 `buildSessionSummary` 并追加内部助手**

在 `session-summary.mjs` 顶部追加：

```javascript
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_BULLETS = 3;
const MAX_LINE_LENGTH = 180;

function compact(text, limit = MAX_LINE_LENGTH) {
  const v = normalizeText(text).replace(/\s+/g, ' ').trim();
  return v.length <= limit ? v : `${v.slice(0, limit - 1).trimEnd()}…`;
}

async function readOptional(p) {
  if (!p) return '';
  try { return await readFile(p, 'utf8'); } catch { return ''; }
}

function firstHeading(md) {
  const m = normalizeText(md).match(/^#\s+(.+)$/m);
  return m ? compact(m[1]) : '';
}

function sectionBody(md, names) {
  const lines = normalizeText(md).split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const h = lines[i].match(/^#{1,6}\s+(.+)$/)?.[1]?.trim();
    if (!h || !names.includes(h)) continue;
    const body = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      if (/^#{1,6}\s+/.test(lines[j])) break;
      body.push(lines[j]);
    }
    return body.join('\n');
  }
  return '';
}

function parseField(section, name) {
  const m = section.match(new RegExp(`^\\s*(?:[-*]\\s*)?${name}\\s*:\\s*(.*)$`, 'im'));
  return m ? m[1].trim() : '';
}

function lastBullets(md, n) {
  const out = [];
  for (const line of normalizeText(md).split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (/^Status:|^Archive Eligible:|^Close Reason:/i.test(t)) continue;
    const m = t.match(/^[-*+]\s+(.+)$/) || t.match(/^\d+\.\s+(.+)$/);
    if (m) out.push(compact(m[1]));
  }
  return out.slice(-n);
}

function firstBullets(md, n) {
  const all = lastBullets(md, Number.MAX_SAFE_INTEGER);
  return all.slice(0, n);
}

function checklistMarker(status) {
  if (status === 'complete') return 'x';
  if (status === 'in_progress') return '~';
  return ' ';
}

function countTestRows(progressMd) {
  const text = normalizeText(progressMd);
  const tableMatch = text.match(/##\s+Test Results\s*\n([\s\S]*?)(?=\n##\s+|$)/i);
  if (!tableMatch) return { pass: 0, total: 0 };
  let pass = 0, total = 0;
  for (const line of tableMatch[1].split('\n')) {
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 5) continue;
    if (/^Test$/i.test(cells[0]) || /^-+$/.test(cells[0])) continue;
    total += 1;
    if (/✓|pass|ok/i.test(cells[4])) pass += 1;
  }
  return { pass, total };
}

function countErrorRows(progressMd) {
  const text = normalizeText(progressMd);
  const m = text.match(/##\s+Error Log\s*\n([\s\S]*?)(?=\n##\s+|$)/i);
  if (!m) return 0;
  let n = 0;
  for (const line of m[1].split('\n')) {
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 4) continue;
    if (/^Timestamp$/i.test(cells[0]) || /^-+$/.test(cells[0])) continue;
    if (cells.every((c) => !c)) continue;
    n += 1;
  }
  return n;
}

export async function buildSessionSummary({
  taskPlanPath,
  findingsPath,
  progressPath,
  sessionStartEpoch,
  now = Date.now()
}) {
  const [plan, findings, progress] = await Promise.all([
    readOptional(taskPlanPath),
    readOptional(findingsPath),
    readOptional(progressPath)
  ]);

  const taskId = taskPlanPath ? path.basename(path.dirname(taskPlanPath)) : 'unknown';
  const title = firstHeading(plan) || taskId;
  const stateBody = sectionBody(plan, ['Current State', '当前状态']);
  const status = parseField(stateBody, 'Status') || 'unknown';
  const closeReason = parseField(stateBody, 'Close Reason');
  const phases = extractPhases(plan);
  const completed = phases.filter((p) => p.status === 'complete').length;
  const duration = formatDuration(sessionStartEpoch, now);

  const isClosed = /^closed$/i.test(status);
  const conclusion = isClosed && closeReason
    ? compact(closeReason)
    : (lastBullets(progress, 1)[0] || 'no conclusion recorded');

  const findingsBullets = firstBullets(findings, MAX_BULLETS);
  const tests = countTestRows(progress);
  const errors = countErrorRows(progress);
  const nextPhase = phases.find((p) => p.status === 'pending')?.title || '—';

  const checklistLines = phases.length === 0
    ? ['- (no phases recorded)']
    : phases.map((p) => `- [${checklistMarker(p.status)}] ${p.title}`);

  const lines = [
    '[planning-with-files] SESSION SUMMARY',
    `Task: ${title} (${taskId})`,
    `Status: ${status}  Phases: ${completed}/${phases.length}  Duration: ${duration}`,
    '',
    'Conclusion:',
    `- ${conclusion}`,
    '',
    'Checklist:',
    ...checklistLines,
    '',
    'Key findings:',
    ...(findingsBullets.length ? findingsBullets.map((b) => `- ${b}`) : ['- (none recorded)']),
    '',
    'Verification:',
    `- Tests: ${tests.total > 0 ? `${tests.pass}/${tests.total}` : 'none recorded'}`,
    `- Errors logged: ${errors}`,
    '',
    'Next:',
    `- ${nextPhase}`,
    '',
    `Sources: planning/active/${taskId}/{task_plan.md,progress.md,findings.md}`
  ];

  return lines.join('\n');
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test tests/hooks/session-summary.test.mjs
```

Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "feat(session-summary): add buildSessionSummary renderer"
```

---

## Task 4: CLI Render Wrapper

**Files:**
- Create: `harness/core/hooks/planning-with-files/scripts/render-session-summary.mjs`

- [ ] **Step 1: 创建文件**

```javascript
#!/usr/bin/env node
import { buildSessionSummary } from './session-summary.mjs';

const [taskPlanPath, findingsPath, progressPath, sidecarEpoch] = process.argv.slice(2);
const sessionStartEpoch = sidecarEpoch && /^\d+$/.test(sidecarEpoch)
  ? Number(sidecarEpoch)
  : null;

const out = await buildSessionSummary({
  taskPlanPath,
  findingsPath,
  progressPath,
  sessionStartEpoch,
  now: Date.now()
});

process.stdout.write(out);
```

- [ ] **Step 2: 手动跑一次烟测**

```bash
node harness/core/hooks/planning-with-files/scripts/render-session-summary.mjs \
  planning/active/session-summary-mechanism/task_plan.md \
  planning/active/session-summary-mechanism/findings.md \
  planning/active/session-summary-mechanism/progress.md \
  ""
```

Expected: 输出符合契约的 SESSION SUMMARY 文本，`Duration: unavailable`。

- [ ] **Step 3: Commit**

```bash
git add harness/core/hooks/planning-with-files/scripts/render-session-summary.mjs
git commit -m "feat(session-summary): add render-session-summary CLI shim"
```

---

## Task 5: Hook 集成 — `session-start` 写 sidecar

**Files:**
- Modify: `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh`

- [ ] **Step 1: 找到 `case "$event" in` 块**

读取 [task-scoped-hook.sh](harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh#L96-L120) 第 96-120 行，确认 `session-start)` 分支当前只调 `render_hot_context`。

- [ ] **Step 2: 在 session-start 分支前增加 sidecar 写入**

替换：

```bash
case "$event" in
  session-start)
    context="$(render_hot_context)"
    emit_context "$context" "SessionStart"
    ;;
```

为：

```bash
write_session_sidecar() {
  printf '%s\n' "$(date +%s)000" > "$task_dir/.session-start" 2>/dev/null || true
}

read_session_sidecar() {
  if [ -f "$task_dir/.session-start" ]; then
    head -n 1 "$task_dir/.session-start" | tr -d '[:space:]'
  fi
}

clear_session_sidecar() {
  rm -f "$task_dir/.session-start" 2>/dev/null || true
}

case "$event" in
  session-start)
    write_session_sidecar
    context="$(render_hot_context)"
    emit_context "$context" "SessionStart"
    ;;
```

- [ ] **Step 3: 单独跑现有 hook 测试确认未回归**

```bash
node --test tests/hooks/task-scoped-hook.test.mjs
```

Expected: PASS（现有断言不依赖 sidecar，新增写入不影响 SessionStart 输出形状）。

- [ ] **Step 4: Commit**

```bash
git add harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh
git commit -m "feat(hook): write .session-start sidecar on session-start"
```

---

## Task 6: Hook 集成 — `stop / agent-stop / session-end` 渲染 summary

**Files:**
- Modify: `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh`

- [ ] **Step 1: 替换 stop 分支**

替换：

```bash
  stop)
    emit_context "[planning-with-files] Before stopping, update $progress and confirm $plan lifecycle state." "Stop"
    ;;
  agent-stop|session-end)
    emit_context "[planning-with-files] Before stopping, update $progress and confirm $plan lifecycle state." "$event"
    ;;
```

为：

```bash
  stop|agent-stop|session-end)
    sidecar_epoch="$(read_session_sidecar || true)"
    summary_helper="$script_dir/render-session-summary.mjs"
    summary="$(node "$summary_helper" "$plan" "$findings" "$progress" "${sidecar_epoch:-}")"
    clear_session_sidecar
    case "$event" in
      stop) hook_event_name="Stop" ;;
      agent-stop) hook_event_name="agent-stop" ;;
      session-end) hook_event_name="session-end" ;;
    esac
    emit_context "$summary" "$hook_event_name"
    ;;
```

- [ ] **Step 2: 手动验证脚本**

```bash
HARNESS_PROJECT_ROOT="$(pwd)" \
bash harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh codex stop \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["hookSpecificOutput"]["additionalContext"])'
```

Expected: 输出 SESSION SUMMARY 块，且 `.session-start` 已被删除：

```bash
test ! -f planning/active/session-summary-mechanism/.session-start && echo "sidecar cleared"
```

- [ ] **Step 3: Commit**

```bash
git add harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh
git commit -m "feat(hook): emit structured session summary on stop events"
```

---

## Task 7: Hook 集成测试

**Files:**
- Modify: `tests/hooks/task-scoped-hook.test.mjs`

- [ ] **Step 1: 在文件末尾追加测试**

```javascript
test('task-scoped-hook emits SESSION SUMMARY on stop with duration sidecar', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'harness-hook-stop-'));
  try {
    const taskRoot = path.join(fixtureRoot, 'planning/active/stop-task');
    await mkdir(taskRoot, { recursive: true });
    await writeFile(path.join(taskRoot, 'task_plan.md'), [
      '# Stop Task',
      '## Current State',
      'Status: active',
      'Archive Eligible: no',
      '## Phases',
      '### Phase 1: A',
      '- **Status:** complete',
      '### Phase 2: B',
      '- **Status:** in_progress'
    ].join('\n'));
    await writeFile(path.join(taskRoot, 'findings.md'), '- finding one\n');
    await writeFile(path.join(taskRoot, 'progress.md'), '- did the thing\n');

    const sidecarEpoch = Date.now() - 5 * 60_000;
    await writeFile(path.join(taskRoot, '.session-start'), `${sidecarEpoch}\n`);

    const scriptPath = path.join(
      process.cwd(),
      'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh'
    );
    const { stdout } = await execFileAsync('bash', [scriptPath, 'codex', 'stop'], {
      cwd: fixtureRoot
    });

    const payload = JSON.parse(stdout);
    assert.equal(payload.hookSpecificOutput.hookEventName, 'Stop');
    assert.match(payload.hookSpecificOutput.additionalContext, /SESSION SUMMARY/);
    assert.match(payload.hookSpecificOutput.additionalContext, /Phases: 1\/2/);
    assert.match(payload.hookSpecificOutput.additionalContext, /Duration: \d+m/);
    assert.match(payload.hookSpecificOutput.additionalContext, /- \[x\] Phase 1: A/);
    assert.match(payload.hookSpecificOutput.additionalContext, /- \[~\] Phase 2: B/);

    const sidecarStillThere = await readFile(path.join(taskRoot, '.session-start'), 'utf8').then(() => true).catch(() => false);
    assert.equal(sidecarStillThere, false, 'sidecar should be cleared after stop');
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('task-scoped-hook stop event renders Duration: unavailable when sidecar absent', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'harness-hook-stop-no-sidecar-'));
  try {
    const taskRoot = path.join(fixtureRoot, 'planning/active/stop-task-2');
    await mkdir(taskRoot, { recursive: true });
    await writeFile(path.join(taskRoot, 'task_plan.md'), [
      '# T',
      '## Current State',
      'Status: active',
      '## Phases',
      '### Phase 1: A',
      '- **Status:** pending'
    ].join('\n'));
    await writeFile(path.join(taskRoot, 'findings.md'), '');
    await writeFile(path.join(taskRoot, 'progress.md'), '');

    const scriptPath = path.join(
      process.cwd(),
      'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh'
    );
    const { stdout } = await execFileAsync('bash', [scriptPath, 'codex', 'stop'], {
      cwd: fixtureRoot
    });
    const payload = JSON.parse(stdout);
    assert.match(payload.hookSpecificOutput.additionalContext, /Duration: unavailable/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('task-scoped-hook stop event yields {} when no active task', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'harness-hook-no-task-'));
  try {
    const scriptPath = path.join(
      process.cwd(),
      'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh'
    );
    const { stdout } = await execFileAsync('bash', [scriptPath, 'codex', 'stop'], {
      cwd: fixtureRoot
    });
    assert.equal(stdout.trim(), '{}');
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
```

注意：第一个 test 顶部需要 `import { readFile } from 'node:fs/promises';` —— 检查文件已有 import 行，未导入则补齐。

- [ ] **Step 2: 跑测试**

```bash
node --test tests/hooks/task-scoped-hook.test.mjs
```

Expected: PASS（含原有用例 + 3 个新用例）。

- [ ] **Step 3: Commit**

```bash
git add -u
git commit -m "test(hook): cover stop event session summary rendering"
```

---

## Task 8: Installer 库 re-export

**Files:**
- Create: `harness/installer/lib/session-summary.mjs`

- [ ] **Step 1: 创建 shim**

```javascript
export { buildSessionSummary, extractPhases, formatDuration } from '../../core/hooks/planning-with-files/scripts/session-summary.mjs';
```

- [ ] **Step 2: Commit**

```bash
git add harness/installer/lib/session-summary.mjs
git commit -m "feat(installer): expose session-summary library shim"
```

---

## Task 9: `harness summary` CLI 子命令（TDD）

**Files:**
- Create: `harness/installer/commands/summary.mjs`
- Create: `tests/installer/summary-command.test.mjs`
- Modify: `harness/installer/commands/harness.mjs`

- [ ] **Step 1: 失败测试**

创建 `tests/installer/summary-command.test.mjs`：

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('harness summary prints SESSION SUMMARY for the single active task', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-summary-'));
  try {
    const taskDir = path.join(root, 'planning/active/cli-task');
    await mkdir(taskDir, { recursive: true });
    await writeFile(path.join(taskDir, 'task_plan.md'), [
      '# CLI Task',
      '## Current State',
      'Status: active',
      '## Phases',
      '### Phase 1: A',
      '- **Status:** complete'
    ].join('\n'));
    await writeFile(path.join(taskDir, 'findings.md'), '');
    await writeFile(path.join(taskDir, 'progress.md'), '');

    const cli = path.join(process.cwd(), 'scripts/harness');
    const { stdout } = await execFileAsync(cli, ['summary'], { cwd: root });
    assert.match(stdout, /SESSION SUMMARY/);
    assert.match(stdout, /Task: CLI Task \(cli-task\)/);
    assert.match(stdout, /Phases: 1\/1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('harness summary exits 1 with message when no active task', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-summary-empty-'));
  try {
    const cli = path.join(process.cwd(), 'scripts/harness');
    await assert.rejects(execFileAsync(cli, ['summary'], { cwd: root }), (err) => {
      assert.equal(err.code, 1);
      assert.match(err.stderr, /no active task/i);
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('harness summary --task <id> targets a specific task', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-summary-multi-'));
  try {
    for (const id of ['t1', 't2']) {
      const dir = path.join(root, 'planning/active', id);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'task_plan.md'), [
        `# ${id}`,
        '## Current State',
        'Status: active',
        '## Phases',
        '### Phase 1: X',
        '- **Status:** pending'
      ].join('\n'));
      await writeFile(path.join(dir, 'findings.md'), '');
      await writeFile(path.join(dir, 'progress.md'), '');
    }
    const cli = path.join(process.cwd(), 'scripts/harness');
    const { stdout } = await execFileAsync(cli, ['summary', '--task', 't2'], { cwd: root });
    assert.match(stdout, /Task: t2 \(t2\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test tests/installer/summary-command.test.mjs
```

Expected: FAIL — `Unknown command: summary`

- [ ] **Step 3: 实现命令**

创建 `harness/installer/commands/summary.mjs`：

```javascript
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { buildSessionSummary } from '../lib/session-summary.mjs';

function parseArgs(args) {
  const out = { task: null };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--task' && args[i + 1]) {
      out.task = args[i + 1];
      i += 1;
    }
  }
  return out;
}

async function listActiveTasks(root) {
  const activeRoot = path.join(root, 'planning/active');
  let entries;
  try {
    entries = await readdir(activeRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const tasks = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const planPath = path.join(activeRoot, entry.name, 'task_plan.md');
    try {
      const text = await readFile(planPath, 'utf8');
      if (/^Status:\s*active\s*$/m.test(text)) {
        tasks.push({ id: entry.name, dir: path.join(activeRoot, entry.name) });
      }
    } catch {}
  }
  return tasks;
}

async function readSidecar(taskDir) {
  try {
    const text = await readFile(path.join(taskDir, '.session-start'), 'utf8');
    const epoch = Number(text.trim());
    return Number.isFinite(epoch) ? epoch : null;
  } catch {
    return null;
  }
}

export async function summary(args) {
  const { task } = parseArgs(args);
  const root = process.cwd();

  let target;
  if (task) {
    const dir = path.join(root, 'planning/active', task);
    try {
      const s = await stat(dir);
      if (!s.isDirectory()) throw new Error('not a directory');
    } catch {
      console.error(`task not found: ${task}`);
      process.exit(1);
    }
    target = { id: task, dir };
  } else {
    const tasks = await listActiveTasks(root);
    if (tasks.length === 0) {
      console.error('no active task in planning/active');
      process.exit(1);
    }
    if (tasks.length > 1) {
      console.error(`multiple active tasks; pass --task <id>. found: ${tasks.map((t) => t.id).join(', ')}`);
      process.exit(1);
    }
    target = tasks[0];
  }

  const sessionStartEpoch = await readSidecar(target.dir);
  const out = await buildSessionSummary({
    taskPlanPath: path.join(target.dir, 'task_plan.md'),
    findingsPath: path.join(target.dir, 'findings.md'),
    progressPath: path.join(target.dir, 'progress.md'),
    sessionStartEpoch,
    now: Date.now()
  });
  process.stdout.write(`${out}\n`);
}
```

- [ ] **Step 4: 注册命令**

在 `harness/installer/commands/harness.mjs` 第 14 行后追加：

```javascript
import { summary } from './summary.mjs';
```

在 `commands` 对象内追加：

```javascript
  summary,
```

在 `usage()` 字符串数组中追加一行：

```javascript
    '  summary  Print structured session summary for the active task',
```

- [ ] **Step 5: 跑测试确认通过**

```bash
node --test tests/installer/summary-command.test.mjs
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add harness/installer/commands/summary.mjs harness/installer/commands/harness.mjs tests/installer/summary-command.test.mjs
git commit -m "feat(cli): add 'harness summary' command"
```

---

## Task 10: 文档与发现同步

**Files:**
- Modify: `docs/architecture.md` 或 `docs/install/copilot.md` 中合适位置（先确认）
- Modify: `planning/active/session-summary-mechanism/progress.md`
- Modify: `planning/active/session-summary-mechanism/task_plan.md`

- [ ] **Step 1: 确认文档落点**

```bash
grep -l "session-start\|hot context\|Stop hook\|stop event" docs/ -r
```

将选定文件名记下；若 `docs/architecture.md` 存在 hook 相关章节，则在该章节末尾追加。

- [ ] **Step 2: 在选定文档末尾追加段落**

```markdown
### Session-end summary

Stop / agent-stop / session-end hooks emit a structured session summary built
from `planning/active/<task-id>/{task_plan.md,progress.md,findings.md}` and a
`.session-start` sidecar written at session start. Run `./scripts/harness
summary` to reproduce the output without hooks. Output is bounded by
`harness/core/context-budgets.json::hookPayload.warn`.
```

- [ ] **Step 3: 更新 task_plan.md / progress.md**

把 `Phase 2/3/4` 标记为 `complete`；progress.md 追加新 Session 段记录关键决策、文件清单、测试结果。

- [ ] **Step 4: 全量测试**

```bash
npm test
```

Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add docs/ planning/active/session-summary-mechanism/
git commit -m "docs: document session summary hook + CLI"
```

---

## Task 11: 终结化

- [ ] **Step 1: 验证四个 adapter 的 payload 形状**

```bash
for target in codex copilot cursor claude-code; do
  echo "=== $target ==="
  HARNESS_PROJECT_ROOT="$(pwd)" \
    bash harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh "$target" stop \
    | python3 -m json.tool
done
```

Expected：每个 adapter 输出按 `emit_context()` 既定形状（codex/copilot/claude-code → `hookSpecificOutput.additionalContext`，cursor → `additional_context`）。

- [ ] **Step 2: 输出尺寸校验**

```bash
HARNESS_PROJECT_ROOT="$(pwd)" \
  bash harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh codex stop \
  | wc -c -l
```

Expected：< 12000 chars，< 160 行。

- [ ] **Step 3: 关闭任务**

更新 `task_plan.md`：

```markdown
## Current State
Status: closed
Archive Eligible: yes
Close Reason: Session summary hook + CLI delivered, tests green, payload within budget.
```

- [ ] **Step 4: Commit**

```bash
git add planning/active/session-summary-mechanism/task_plan.md
git commit -m "chore: close session-summary-mechanism task"
```

---

## Self-Review

**Spec coverage：**
- 简短结论 → Conclusion 段（progress 末尾 bullet 或 Close Reason）✅
- 本轮耗时 → Duration（sidecar）✅
- checklist → Checklist 段（phase × status）✅
- 关键发现 → Key findings（findings.md top 3）✅
- 验证/风险 → Verification（tests + errors 计数）✅
- 下一步 → Next（first pending phase）✅
- 复用 planning files → 输入全部来自 task_plan/progress/findings ✅
- 不新增 durable state → 只有 ephemeral `.session-start` sidecar ✅
- 真实 duration → SessionStart hook 写 epoch ✅
- 真实 checklist → phase 解析 ✅
- 精炼硬约束 → `compact()` 截断 + budget 测试 ✅
- 多 adapter 兼容 → 复用 `emit_context()` ✅
- hookMode=off 兼容 → `harness summary` CLI ✅

**Placeholder scan：** 所有代码块都是完整可粘贴；无 TBD / TODO / 省略号。

**Type/命名一致性：**
- `extractPhases / formatDuration / buildSessionSummary` 三处一致使用
- `sessionStartEpoch`（Number | null）贯穿 CLI、库、hook
- sidecar 文件名 `.session-start` 在 hook 写入、CLI 读取、测试断言中一致
- adapter payload 形状直接走现有 `emit_context()`，不引入新 JSON 结构

---

## Execution Handoff

Plan complete and saved to [docs/superpowers/plans/2026-04-25-session-summary-mechanism.md](../../../docs/superpowers/plans/2026-04-25-session-summary-mechanism.md). Authoritative task memory at [planning/active/session-summary-mechanism/](../../../planning/active/session-summary-mechanism/). Two execution options:

1. **Subagent-Driven (recommended)** — 每个 Task 派发一个独立 subagent，任务间评审，迭代快。
2. **Inline Execution** — 在当前会话内按 Task 顺序执行，每 2-3 个 Task 设置一个 checkpoint 让你审查。

选哪个？
