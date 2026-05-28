# Codex Harness Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Harness materially better for Codex by closing the gap between documented support, projected configuration, local payload validation, and real runtime evidence, while tightening Codex-specific profile and documentation guidance.

**Architecture:** Build on the existing adapter -> projection -> health/doctor pipeline instead of inventing a Codex-only subsystem. Reuse the current verified-event allowlist, add a missing runtime-evidence layer, and make measurement/reporting more honest when multiple active tasks prevent meaningful planning-hook validation.

**Tech Stack:** Node.js ESM, shell hook scripts, `node:test`, Markdown docs, Codex CLI feature inspection

---

## Active Task Linkage

- **Active task path:** `planning/active/codex-harness-capability-audit-20260528/`
- **Lifecycle state:** `active`
- **Sync-back status:** `synced through 2026-05-28 11:55:18 UTC+8`

## Why This Plan Exists

当前审计已经证明：

1. 仓库**确实支持 Codex projection**，不是空口宣称。
2. 但 Codex 支持的证据层现在还停留在：
   - `AGENTS.md` / skill roots / hooks.json 能生成；
   - hook 脚本能本地执行；
   - 部分 focused tests 能通过。
3. 还没有把下面几件事闭环：
   - 文档对当前 Codex hooks 能力的表述已经落后；
   - runtime hook evidence 模块有测试引用但当前缺文件；
   - multiple active tasks 时，planning hook 的 health 只能退化成 “not measured”；
   - user-global Codex 的 profile guidance 还不够清晰，也没有 runtime/weight 相关的告警或推荐动作。

## Scope Guardrails

- 不重写 Codex adapter 架构。
- 不撤销现有 verified-event allowlist。
- 不引入第二套 planning system。
- 不把本计划扩展成所有平台统一重构；优先改善 Codex，但允许复用已有 Claude Code 运行时证据工作残留。

## File Structure

### Core implementation files

- Create: `harness/installer/lib/runtime-hook-evidence.mjs`
  - 负责读取、归一化、过滤、汇总 Harness-managed hook 的运行时 evidence。
- Modify: `harness/installer/lib/health.mjs`
  - 把 Codex runtime evidence、multiple-active-task measurement skip reason、Codex profile advisory 纳入 health 输出。
- Modify: `harness/installer/lib/hook-evidence-summary.mjs`
  - 输出更细的 evidence 三层信息：config / payload / runtime。
- Modify: `harness/installer/commands/doctor.mjs`
  - 把新的 Codex evidence 与 advisory 呈现给用户。
- Modify: `harness/installer/commands/verify.mjs`
  - 在 verification report 中保留相同事实层次。

### Hook runtime files

- Modify: `harness/core/hooks/superpowers/scripts/session-start`
  - Codex target 运行时落 trace。
- Modify: `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh`
  - Codex target 运行时落 trace；multiple active tasks 时输出 canonical event 且落明确信号。
- Modify: `harness/core/hooks/safety/scripts/pretool-guard.sh`
  - Codex safety `PreToolUse` 运行时落 trace。
- Modify: `harness/core/hooks/safety/scripts/session-checkpoint.sh`
  - Codex safety `SessionStart` 运行时落 trace。

### Tests

- Modify: `tests/installer/runtime-hook-evidence.test.mjs`
  - 让现有失败测试转绿，并扩展到 Codex。
- Modify: `tests/installer/health.test.mjs`
  - 新增 Codex runtime evidence、multiple-active-task diagnostics、profile advisory 覆盖。
- Modify: `tests/installer/commands.test.mjs`
  - 校验 `doctor` / `verify` 输出新的 evidence/advisory 文案。
- Modify: `tests/adapters/sync-hooks.test.mjs`
  - 保证 Codex projected hooks 仍维持 allowlist 行为。
- Modify: `tests/hooks/task-scoped-hook.test.mjs`
  - 校验 Codex trace 记录与 multiple-active-task fallback 行为。

### Documentation

- Modify: `docs/install/codex.md`
- Modify: `docs/install/platform-support.md`
- Modify: `docs/compatibility/hooks.md`
- Modify: `docs/architecture.md`
- Modify: `docs/install/adoption-starter-kit.md`
- Modify: `docs/maintenance.md`

---

### Task 1: Refresh Codex Facts And Documentation Truthfulness

**Files:**
- Modify: `docs/install/codex.md`
- Modify: `docs/install/platform-support.md`
- Modify: `docs/compatibility/hooks.md`
- Modify: `docs/architecture.md`
- Modify: `docs/install/adoption-starter-kit.md`
- Modify: `docs/maintenance.md`

- [ ] **Step 1: Replace stale `codex_hooks` wording with version-agnostic feature detection guidance**

Use this replacement pattern in the Codex docs:

```md
Codex hooks must be supported by the installed Codex build.

Check the active CLI first:

```bash
codex features list | rg '^hooks\\s'
```

Expected on current builds: a row where `hooks` is enabled.

If your Codex version still uses an older hook gate name or config shape, follow the upstream Codex docs for that build rather than assuming Harness can enable it for you.
```
```

- [ ] **Step 2: Make the Codex support matrix explicit about support layers**

Update the compatibility wording so Codex is described in layers:

```md
- Projection support: verified
- Local hook payload validation: verified for supported projected scripts
- Runtime invocation evidence: measured only when Harness-managed Codex hooks actually run and leave trace evidence
```

- [ ] **Step 3: Fix the incomplete story around Codex safety hooks**

Adjust the docs so they no longer imply Codex only supports planning + superpowers hooks. Add a short Codex safety note:

```md
When the `safety` profile is active, Harness can also project Codex `SessionStart` and `PreToolUse` safety hooks. These remain repository-owned policy checks and do not replace host-platform approvals.
```

- [ ] **Step 4: Verify the doc set no longer contains stale hard-coded `codex_hooks = true` instructions**

Run:

```bash
rg -n "codex_hooks = true|codex_hooks" docs harness | sed -n '1,120p'
```

Expected:

- remaining hits, if any, are historical specs or changelog-style evidence documents only
- install/current-architecture docs no longer instruct users to set `codex_hooks = true` as the primary path

- [ ] **Step 5: Commit the Codex doc refresh**

```bash
git add docs/install/codex.md docs/install/platform-support.md docs/compatibility/hooks.md docs/architecture.md docs/install/adoption-starter-kit.md docs/maintenance.md
git commit -m "docs: refresh codex support guidance"
```

---

### Task 2: Land The Missing Runtime Hook Evidence Module And Wire It To Codex

**Files:**
- Create: `harness/installer/lib/runtime-hook-evidence.mjs`
- Modify: `harness/installer/lib/health.mjs`
- Modify: `harness/installer/lib/hook-evidence-summary.mjs`
- Modify: `harness/installer/commands/doctor.mjs`
- Modify: `harness/installer/commands/verify.mjs`
- Test: `tests/installer/runtime-hook-evidence.test.mjs`
- Test: `tests/installer/health.test.mjs`
- Test: `tests/installer/commands.test.mjs`

- [ ] **Step 1: Run the currently failing runtime-evidence test to capture the baseline defect**

Run:

```bash
node --test tests/installer/runtime-hook-evidence.test.mjs
```

Expected:

```text
ERR_MODULE_NOT_FOUND
Cannot find module '.../harness/installer/lib/runtime-hook-evidence.mjs'
```

- [ ] **Step 2: Create `runtime-hook-evidence.mjs` with the three functions already referenced by tests**

Implement the file with these exports:

```js
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export function runtimeEvidenceLogPath(rootDir, target) {
  return path.join(rootDir, '.harness', 'runtime-hook-evidence', `${target}.jsonl`);
}

export async function readRuntimeHookEvidence(rootDir, target) {
  const logPath = runtimeEvidenceLogPath(rootDir, target);
  const text = await readFile(logPath, 'utf8').catch(() => '');
  const records = [];
  const warnings = [];

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row?.schemaVersion === 1 && row?.source === 'harness-runtime-hook' && row?.target === target) {
        records.push(row);
      } else {
        warnings.push(`Ignored unsupported runtime hook evidence row ${index + 1} in ${logPath}`);
      }
    } catch {
      warnings.push(`Ignored invalid runtime hook evidence row ${index + 1} in ${logPath}`);
    }
  }

  return { logPath, records, warnings };
}

export function summarizeRuntimeEvidenceForProjection(projection, evidence, rootDir) {
  const matched = (evidence.records ?? []).filter(
    (row) =>
      row.target === projection.target &&
      row.parentSkillName === projection.parentSkillName &&
      (projection.eventNames ?? []).includes(row.eventName) &&
      row.projectRoot === rootDir
  );

  return matched.length === 0
    ? { runtimeEvidence: 'not-measured', lastObservedAt: null, observedEvents: [] }
    : {
        runtimeEvidence: 'runtime-invocation-verified',
        lastObservedAt: matched.map((row) => row.observedAt).sort().at(-1) ?? null,
        observedEvents: [...new Set(matched.map((row) => row.eventName))].sort()
      };
}
```

- [ ] **Step 3: Re-run the focused test and extend it with Codex coverage**

Add a Codex-targeted assertion to `tests/installer/runtime-hook-evidence.test.mjs`:

```js
test('summarizeRuntimeEvidenceForProjection upgrades Codex runtime evidence when matching trace exists', async () => {
  const root = await createHarnessFixture();
  try {
    const summary = summarizeRuntimeEvidenceForProjection(
      { target: 'codex', parentSkillName: 'superpowers', eventNames: ['SessionStart'] },
      {
        records: [
          {
            schemaVersion: 1,
            source: 'harness-runtime-hook',
            target: 'codex',
            parentSkillName: 'superpowers',
            eventName: 'SessionStart',
            observedAt: '2026-05-28T03:00:00.000Z',
            projectRoot: root,
            cwd: root,
            scriptName: 'session-start',
            scriptPath: path.join(root, '.codex/hooks/session-start')
          }
        ],
        warnings: []
      },
      root
    );

    assert.equal(summary.runtimeEvidence, 'runtime-invocation-verified');
    assert.deepEqual(summary.observedEvents, ['SessionStart']);
  } finally {
    await removeHarnessFixture(root);
  }
});
```

Run:

```bash
node --test tests/installer/runtime-hook-evidence.test.mjs
```

Expected: PASS

- [ ] **Step 4: Merge runtime evidence into health and doctor output**

Patch `health.mjs` so `inspectHook()` or the post-hook aggregation path applies runtime summaries:

```js
const runtimeEvidenceByTarget = new Map();

for (const target of Object.keys(targets)) {
  runtimeEvidenceByTarget.set(target, await readRuntimeHookEvidence(rootDir, target));
}

// later, after inspectHook(projection)
const runtimeSummary = summarizeRuntimeEvidenceForProjection(
  projection,
  runtimeEvidenceByTarget.get(projection.target) ?? { records: [], warnings: [] },
  rootDir
);

return { ...projection, ...hookEvidence(projection), ...runtimeSummary, status: 'ok' };
```

And ensure `doctor` keeps printing:

```text
- codex / superpowers: config=verified, payload=local-payload-verified, runtime=runtime-invocation-verified
```

- [ ] **Step 5: Add command-level regression tests for the new evidence row**

Add a command assertion in `tests/installer/commands.test.mjs`:

```js
assert.match(stdout, /codex \/ superpowers: config=verified, payload=local-payload-verified, runtime=runtime-invocation-verified/);
```

Run:

```bash
node --test tests/installer/runtime-hook-evidence.test.mjs tests/installer/health.test.mjs tests/installer/commands.test.mjs
```

Expected: PASS

- [ ] **Step 6: Commit the runtime evidence plumbing**

```bash
git add harness/installer/lib/runtime-hook-evidence.mjs harness/installer/lib/health.mjs harness/installer/lib/hook-evidence-summary.mjs harness/installer/commands/doctor.mjs harness/installer/commands/verify.mjs tests/installer/runtime-hook-evidence.test.mjs tests/installer/health.test.mjs tests/installer/commands.test.mjs
git commit -m "feat: add codex runtime hook evidence"
```

---

### Task 3: Record Real Codex Hook Invocation And Improve Multi-Active-Task Diagnostics

**Files:**
- Modify: `harness/core/hooks/superpowers/scripts/session-start`
- Modify: `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh`
- Modify: `harness/core/hooks/safety/scripts/pretool-guard.sh`
- Modify: `harness/core/hooks/safety/scripts/session-checkpoint.sh`
- Modify: `harness/installer/lib/health.mjs`
- Test: `tests/hooks/task-scoped-hook.test.mjs`
- Test: `tests/hooks/pretool-guard.test.mjs`
- Test: `tests/installer/health.test.mjs`

- [ ] **Step 1: Add a shared shell helper inside each relevant script to append JSONL runtime evidence**

Use a helper block like this:

```bash
runtime_evidence_log_path() {
  printf '%s/.harness/runtime-hook-evidence/%s.jsonl' "$root" "$target"
}

record_runtime_evidence() {
  mkdir -p "$(dirname "$(runtime_evidence_log_path)")"
  node -e '
const fs = require("node:fs");
const path = process.argv[1];
const row = {
  schemaVersion: 1,
  source: "harness-runtime-hook",
  target: process.argv[2],
  parentSkillName: process.argv[3],
  eventName: process.argv[4],
  observedAt: new Date().toISOString(),
  projectRoot: process.argv[5],
  cwd: process.cwd(),
  scriptName: process.argv[6],
  scriptPath: process.argv[7]
};
fs.appendFileSync(path, JSON.stringify(row) + "\\n");
' "$(runtime_evidence_log_path)" "$target" "$parent_skill" "$hook_event" "$root" "$script_name" "$script_path"
}
```

- [ ] **Step 2: Record Codex runtime evidence only on real hook execution paths**

In `session-start`:

```bash
if [ "$target" = "codex" ]; then
  parent_skill="superpowers"
  hook_event="SessionStart"
  script_name="session-start"
  script_path="$0"
  record_runtime_evidence
fi
```

In `task-scoped-hook.sh`, record before emitting context:

```bash
if [ "$target" = "codex" ]; then
  parent_skill="planning-with-files"
  hook_event="$(canonical_hook_event_name "${event:-UserPromptSubmit}")"
  script_name="task-scoped-hook.sh"
  script_path="$0"
  record_runtime_evidence
fi
```

- [ ] **Step 3: Make multiple-active-task measurement failure explicit in health**

Patch `findSingleActiveTaskDir()` callers so `health.context.hooks` reports a reason instead of silent non-measurement:

```js
if (projection.parentSkillName === 'planning-with-files' && !activeTaskDir) {
  measurements.push({
    target: projection.target,
    parentSkillName: projection.parentSkillName,
    eventName: selectHookPayloadEventName(projection),
    category: 'planning-hot',
    runtimePath,
    measurement: null,
    evaluation: null,
    status: 'warning',
    message: 'Planning hook payload measurement skipped because the repository does not have exactly one active task.'
  });
  continue;
}
```

- [ ] **Step 4: Add focused tests for Codex trace rows and honest skip reporting**

Add to `tests/hooks/task-scoped-hook.test.mjs`:

```js
assert.equal(payload.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
const tracePath = path.join(fixtureRoot, '.harness/runtime-hook-evidence/codex.jsonl');
const traceText = await readFile(tracePath, 'utf8');
assert.match(traceText, /"target":"codex"/);
assert.match(traceText, /"parentSkillName":"planning-with-files"/);
assert.match(traceText, /"eventName":"UserPromptSubmit"/);
```

Add to `tests/installer/health.test.mjs`:

```js
assert.equal(planningPayload.status, 'warning');
assert.match(
  planningPayload.message,
  /does not have exactly one active task/
);
```

- [ ] **Step 5: Run focused hook and health verification**

Run:

```bash
node --test tests/hooks/task-scoped-hook.test.mjs tests/hooks/pretool-guard.test.mjs tests/installer/health.test.mjs
```

Expected: PASS

- [ ] **Step 6: Commit the Codex runtime trace and diagnostics work**

```bash
git add harness/core/hooks/superpowers/scripts/session-start harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh harness/core/hooks/safety/scripts/pretool-guard.sh harness/core/hooks/safety/scripts/session-checkpoint.sh harness/installer/lib/health.mjs tests/hooks/task-scoped-hook.test.mjs tests/hooks/pretool-guard.test.mjs tests/installer/health.test.mjs
git commit -m "feat: trace codex hook runtime evidence"
```

---

### Task 4: Tighten Codex Profile Guidance And User-Global Advisories

**Files:**
- Modify: `harness/installer/lib/health.mjs`
- Modify: `harness/installer/commands/doctor.mjs`
- Modify: `docs/install/codex.md`
- Modify: `docs/install/adoption-starter-kit.md`
- Test: `tests/installer/health.test.mjs`
- Test: `tests/installer/commands.test.mjs`

- [ ] **Step 1: Add a Codex user-global advisory when `skillProfile=full`**

Add a warning in `health.mjs` after state/context ledger construction:

```js
if (
  state.scope === 'user-global' &&
  state.skillProfile === 'full' &&
  state.targets?.codex?.enabled
) {
  warnings.push(
    'Codex user-global install is using the full skill profile. Prefer minimal-global unless this repository intentionally needs the broader skill surface.'
  );
}
```

- [ ] **Step 2: Surface the advisory without failing doctor**

Ensure `doctor --check-only` prints the warning but still passes:

```text
Codex user-global install is using the full skill profile. Prefer minimal-global unless this repository intentionally needs the broader skill surface.
Harness check passed.
```

- [ ] **Step 3: Update the adoption docs so Codex App usage is explicit**

Insert language like:

```md
For Codex App and Codex CLI user-global installs, start with `minimal-global`.
Use `--skills-profile=full` only when a specific repository depends on the broader projected skill surface and you have verified the added context cost is acceptable.
```

- [ ] **Step 4: Add focused tests for the new advisory**

Add to `tests/installer/health.test.mjs`:

```js
assert.ok(
  health.warnings.some((warning) =>
    warning.includes('Codex user-global install is using the full skill profile')
  )
);
```

Add to `tests/installer/commands.test.mjs`:

```js
assert.match(stdout, /Codex user-global install is using the full skill profile/);
assert.match(stdout, /Harness check passed\./);
```

- [ ] **Step 5: Run focused profile/advisory checks**

Run:

```bash
node --test tests/installer/health.test.mjs tests/installer/commands.test.mjs tests/adapters/skill-profile.test.mjs
```

Expected: PASS

- [ ] **Step 6: Commit the Codex profile guidance update**

```bash
git add harness/installer/lib/health.mjs harness/installer/commands/doctor.mjs docs/install/codex.md docs/install/adoption-starter-kit.md tests/installer/health.test.mjs tests/installer/commands.test.mjs
git commit -m "chore: tighten codex profile guidance"
```

---

### Task 5: Run End-To-End Verification And Capture Codex Evidence

**Files:**
- Modify: `planning/active/codex-harness-capability-audit-20260528/task_plan.md`
- Modify: `planning/active/codex-harness-capability-audit-20260528/findings.md`
- Modify: `planning/active/codex-harness-capability-audit-20260528/progress.md`
- Modify: `docs/install/codex.md` (if verification wording needs final correction)

- [ ] **Step 1: Run the focused repository verification for the Codex hardening slice**

Run:

```bash
node --test tests/installer/runtime-hook-evidence.test.mjs
node --test tests/hooks/superpowers-codex-hook.test.mjs tests/hooks/task-scoped-hook.test.mjs tests/hooks/pretool-guard.test.mjs
node --test tests/adapters/sync-hooks.test.mjs tests/adapters/skill-profile.test.mjs
node --test tests/installer/health.test.mjs tests/installer/commands.test.mjs
```

Expected: all PASS

- [ ] **Step 2: Run operator-level verification commands**

Run:

```bash
./scripts/harness doctor --check-only
./scripts/harness verify
codex features list | rg '^hooks\\s'
```

Expected:

- `doctor` reports no problems
- `verify` prints a verification report with hook payload and hook evidence sections
- `codex features list` confirms hooks support is enabled on the active build

- [ ] **Step 3: Perform a live Codex smoke test with exactly one active task**

Use a clean fixture repo or a temporary branch with exactly one active task and then run:

```bash
bash ~/.codex/hooks/session-start
bash ~/.codex/hooks/task-scoped-hook.sh codex session-start
bash ~/.codex/hooks/task-scoped-hook.sh codex user-prompt-submit
./scripts/harness doctor --check-only
```

Expected:

- projected hook scripts emit valid Codex JSON payloads
- `.harness/runtime-hook-evidence/codex.jsonl` exists
- `doctor` shows `runtime=runtime-invocation-verified` for the exercised Codex hooks

- [ ] **Step 4: Sync durable conclusions back into active planning**

Update:

```md
Companion plan: docs/superpowers/plans/2026-05-28-codex-harness-hardening-plan.md
Companion summary: Hardens Codex support via runtime evidence, honest health reporting, profile guidance, and doc refresh.
Sync-back status: execution complete / verification recorded
```

- [ ] **Step 5: Commit the verification evidence and planning sync-back**

```bash
git add planning/active/codex-harness-capability-audit-20260528/task_plan.md planning/active/codex-harness-capability-audit-20260528/findings.md planning/active/codex-harness-capability-audit-20260528/progress.md
git commit -m "docs: record codex hardening verification evidence"
```

---

## Self-Review

### Spec coverage

- 更深入验证：覆盖了 runtime evidence、focused tests、operator verification、live smoke test。
- 修正：覆盖了 stale Codex hook 文档、缺失的 runtime module、multiple-active-task honesty gap。
- 优化：覆盖了 user-global Codex profile guidance 与 doctor advisory。
- 文档更新：覆盖了 install / architecture / compatibility / adoption / maintenance。

### Placeholder scan

- 没有 `TBD` / `TODO` / “implement later”。
- 所有任务都给出了明确文件、命令、预期结果。
- 所有代码任务都给出了具体实现片段，而不是抽象描述。

### Type consistency

- runtime evidence status 使用统一枚举：
  - `not-measured`
  - `runtime-invocation-verified`
- payload evidence 使用统一枚举：
  - `not-measured`
  - `local-payload-verified`
  - `local-payload-problem`
- Codex planning allowlist 继续使用：
  - `SessionStart`
  - `UserPromptSubmit`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-28-codex-harness-hardening-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
