# Copilot Usage Optimization Implementation Plan

> **Active task path:** `planning/active/copilot-usage-billing-impact-analysis/`
> **Lifecycle state:** `closed`
> **Sync-back status:** implementation merged into local `dev`, projections synced, final verification rerun, and published to `origin/dev` on 2026-04-29.

- Active task path: `planning/active/copilot-usage-billing-impact-analysis/`
- Lifecycle state: `closed`
- Sync-back status: implementation merged into local `dev`, projections synced, final verification rerun, and published to `origin/dev` on 2026-04-29.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不削弱 Harness 核心约束效果的前提下，继续压缩 Copilot 的 input、cached token 与可控 output 成本，并把这些优化固化成可观测、可回归、可治理的默认行为。

**Architecture:** 后续实现继续沿用“target-aware slimming + event-aware payload selection + budget-gated verification”的路线。所有默认行为只在 Copilot 目标上收紧，persisted state 与其他 adapter 的语义保持稳定；planning 与 adoption 侧新增的都是更小、更稳定的摘要与重叠治理，而不是删掉高价值能力。

**Tech Stack:** Node.js ESM modules, Node builtin test runner, shell hook scripts, JSON policy/skill profiles, Markdown planning artifacts, Harness `install` / `sync` / `verify` / `doctor` / `adopt-global` commands.

---

## Scope And Outcome

本计划覆盖 5 个后续优化面：

1. Copilot 成本账本可观测性补齐到 hooks / overlap / target 维度
2. Copilot 默认 skill profile 分层与 target-aware 默认值
3. planning 恢复模型从“每次 user prompt 都发 hot context”演进到“brief + changed-hot + session summary”
4. user-global / workspace 双安装的重叠税检测与 adoption 治理
5. 预算门禁与 usage regression 套件，防止后续规则膨胀回退

低优先级可选项：

6. Copilot 输出侧的简洁化提示收紧，但只作为 opt-in 或最后阶段执行

## Success Criteria

- Copilot 默认安装不再隐式投影 `full` skills profile。
- Copilot planning hook 在“无 planning 变化的重复 user prompt”场景下不再重复发送完整 hot context。
- `verify` 和 `doctor` 能清楚区分 entry、hook、planning、skill profile、scope overlap 五类 usage 成本面。
- user-global 与 workspace 同时启用 Copilot 时，health / adoption-status / doctor 至少会给出明确警告，且能指出推荐收敛方式。
- 新增预算与 regression tests 后，后续扩规则不能悄悄把 Copilot usage 税抬回去。

## Non-Goals

- 不重写 planner、skills index、projection system 的整体架构。
- 不改变 Codex / Cursor / Claude Code 的默认 profile 除非测试证明必须同步。
- 不尝试在本阶段“控制模型实际输出长度”，只控制 Harness 可直接影响的 prompt surface 和 guidance。
- 不追求把所有 input 压到最小值；保留复杂任务所需的 planning、verification、risk safety 基础能力。

## File Map

### Cost Ledger / Verification

- Modify: `harness/installer/lib/health.mjs`
- Modify: `harness/installer/commands/verify.mjs`
- Modify: `harness/installer/commands/doctor.mjs`
- Test: `tests/installer/health.test.mjs`
- Test: `tests/installer/commands.test.mjs`
- Create: `tests/installer/copilot-usage-budget.test.mjs`

### Copilot Skill Profiles And Defaults

- Modify: `harness/core/skills/profiles.json`
- Modify: `harness/installer/lib/skill-projection.mjs`
- Modify: `harness/installer/commands/install.mjs`
- Modify: `harness/installer/lib/adoption.mjs`
- Test: `tests/installer/commands.test.mjs`
- Test: `tests/installer/adoption.test.mjs`

### Planning Recovery Model V2

- Modify: `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh`
- Modify: `harness/core/hooks/planning-with-files/scripts/planning-hot-context.mjs`
- Modify: `harness/core/hooks/planning-with-files/scripts/session-summary.mjs`
- Create: `harness/core/hooks/planning-with-files/scripts/planning-brief-context.mjs`
- Create: `harness/core/hooks/planning-with-files/scripts/render-brief-context.mjs`
- Test: `tests/hooks/task-scoped-hook.test.mjs`
- Test: `tests/hooks/hook-budget.test.mjs`
- Test: `tests/hooks/session-summary.test.mjs`

### Overlap / Adoption Governance

- Modify: `harness/installer/lib/adoption.mjs`
- Modify: `harness/installer/lib/health.mjs`
- Modify: `harness/installer/commands/doctor.mjs`
- Modify: `harness/installer/commands/verify.mjs`
- Test: `tests/installer/adoption.test.mjs`
- Test: `tests/installer/health.test.mjs`
- Test: `tests/installer/commands.test.mjs`

### Optional Output Guidance

- Modify: `harness/core/policy/platform-overrides/copilot.md`
- Modify: `harness/core/policy/entry-profiles.json`
- Test: `tests/installer/policy-render.test.mjs`

## Delivery Order

1. Task 1: 补齐 cost ledger 和 measurement fidelity
2. Task 2: 落地 Copilot 默认 skill profile 分层
3. Task 3: 实现 planning recovery model v2
4. Task 4: 做 scope overlap / adoption 治理
5. Task 5: 增加预算门禁与 regression suite
6. Task 6: 仅在前 5 步稳定后再考虑 output guidance

---

### Task 1: Expand Copilot Cost Ledger Fidelity

**Files:**
- Modify: `harness/installer/lib/health.mjs`
- Modify: `harness/installer/commands/verify.mjs`
- Modify: `harness/installer/commands/doctor.mjs`
- Test: `tests/installer/health.test.mjs`
- Test: `tests/installer/commands.test.mjs`
- Create: `tests/installer/copilot-usage-budget.test.mjs`

- [ ] **Step 1: Write the failing tests for Copilot hook measurement parity**

```js
test('readHarnessHealth measures Copilot hook payloads and reports worst hook target', async () => {
  assert.equal(health.context.summary.hooks.target, 'copilot');
  assert.ok(health.context.summary.hooks.approxTokens > 0);
  assert.match(health.context.hooks[0].target, /copilot/);
});

test('verify renders overlap and per-target hook ledger rows when Copilot is enabled', async () => {
  assert.match(stdout, /Hook payload verdict:/);
  assert.match(stdout, /Hook payload target: copilot/);
  assert.match(stdout, /Scope overlap verdict:/);
});
```

- [ ] **Step 2: Run the targeted installer tests and confirm they fail for the missing Copilot ledger fields**

Run: `node --test tests/installer/health.test.mjs tests/installer/commands.test.mjs tests/installer/copilot-usage-budget.test.mjs`

Expected: FAIL in the new Copilot hook / overlap assertions because `health.mjs` still only measures the old surface.

- [ ] **Step 3: Extend `readHarnessHealth()` to measure Copilot hook payloads and annotate hook categories**

Implementation notes:

```js
const MEASURED_HOOK_PAYLOAD_TARGETS = new Set(['codex', 'copilot']);

function classifyHookPayload({ parentSkillName, eventName }) {
  if (parentSkillName === 'superpowers') return 'bootstrap';
  if (eventName === 'SessionStart') return 'planning-brief';
  if (eventName === 'UserPromptSubmit') return 'planning-hot';
  if (eventName === 'Stop') return 'session-summary';
  return 'other';
}
```

Requirements:
- keep existing codex measurement behavior intact
- add Copilot payload measurement without broadening to unsupported adapters
- surface both worst target and per-target rows in the report payload

- [ ] **Step 4: Update `verify` and `doctor` output so operators can see where Copilot credits are being spent**

Implementation notes:

```md
Hook payload detail:
- copilot / planning-hot / ok / 220 tokens
- copilot / planning-brief / ok / 46 tokens

Scope overlap verdict: warning
Scope overlap detail: Copilot is projected in both user-global and workspace scopes.
```

- [ ] **Step 5: Run the targeted installer suite again and make the new Copilot ledger assertions pass**

Run: `node --test tests/installer/health.test.mjs tests/installer/commands.test.mjs tests/installer/copilot-usage-budget.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add harness/installer/lib/health.mjs harness/installer/commands/verify.mjs harness/installer/commands/doctor.mjs tests/installer/health.test.mjs tests/installer/commands.test.mjs tests/installer/copilot-usage-budget.test.mjs
git commit -m "test: add copilot usage ledger coverage"
```

### Task 2: Introduce A Lean Default Copilot Skills Profile

**Files:**
- Modify: `harness/core/skills/profiles.json`
- Modify: `harness/installer/lib/skill-projection.mjs`
- Modify: `harness/installer/commands/install.mjs`
- Modify: `harness/installer/lib/adoption.mjs`
- Test: `tests/installer/commands.test.mjs`
- Test: `tests/installer/adoption.test.mjs`

- [ ] **Step 1: Write the failing tests for a target-aware Copilot default skills profile**

```js
test('install defaults Copilot-only installs to copilot-default skills profile', async () => {
  assert.equal(state.skillProfile, 'copilot-default');
});

test('adopt-global preserves explicit skills profile overrides but defaults Copilot bootstrap to copilot-default', async () => {
  assert.equal(receipt.skillProfile, 'copilot-default');
});
```

- [ ] **Step 2: Run the install/adoption tests and confirm the default still resolves to `full`**

Run: `node --test tests/installer/commands.test.mjs tests/installer/adoption.test.mjs`

Expected: FAIL because `install.mjs` and `adoption.mjs` currently fall back to `skillProfiles.defaultProfile` for every target.

- [ ] **Step 3: Add a new profile entry and keep the capability floor explicit**

Profile shape:

```json
"copilot-default": [
  "planning-with-files",
  "risk-assessment-before-destructive-changes",
  "superpowers:using-superpowers",
  "superpowers:writing-plans",
  "superpowers:executing-plans",
  "superpowers:verification-before-completion"
]
```

Rules:
- keep `full` unchanged for explicit heavy installs
- keep `minimal-global` unchanged for existing callers
- do not silently remap non-Copilot targets

- [ ] **Step 4: Implement target-aware default selection in `install` and `adopt-global`**

Implementation notes:

```js
function defaultSkillProfileForTargets(targets, requestedSkillProfile) {
  if (requestedSkillProfile) return requestedSkillProfile;
  return targets.length === 1 && targets[0] === 'copilot' ? 'copilot-default' : skillProfiles.defaultProfile;
}
```

Requirements:
- explicit `--skills-profile=...` must always win
- persisted state should record the actual resolved profile name
- user-global `adopt-global` should preserve existing explicit state unless bootstrapping or force mode changes it

- [ ] **Step 5: Re-run install/adoption tests and verify Copilot-only defaults changed while explicit profiles stayed stable**

Run: `node --test tests/installer/commands.test.mjs tests/installer/adoption.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add harness/core/skills/profiles.json harness/installer/lib/skill-projection.mjs harness/installer/commands/install.mjs harness/installer/lib/adoption.mjs tests/installer/commands.test.mjs tests/installer/adoption.test.mjs
git commit -m "feat: add lean default copilot skill profile"
```

### Task 3: Rework Planning Recovery Into Brief + Changed-Hot + Summary

**Files:**
- Modify: `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh`
- Modify: `harness/core/hooks/planning-with-files/scripts/planning-hot-context.mjs`
- Modify: `harness/core/hooks/planning-with-files/scripts/session-summary.mjs`
- Create: `harness/core/hooks/planning-with-files/scripts/planning-brief-context.mjs`
- Create: `harness/core/hooks/planning-with-files/scripts/render-brief-context.mjs`
- Test: `tests/hooks/task-scoped-hook.test.mjs`
- Test: `tests/hooks/hook-budget.test.mjs`
- Test: `tests/hooks/session-summary.test.mjs`

- [ ] **Step 1: Write failing hook tests for unchanged prompt reuse and planning brief payloads**

```js
test('copilot user-prompt-submit emits full hot context only on first prompt after session start', async () => {
  assert.match(firstPrompt.additionalContext, /HOT CONTEXT/);
  assert.doesNotMatch(secondPrompt.additionalContext, /HOT CONTEXT/);
  assert.match(secondPrompt.additionalContext, /No planning changes since last hot context emission/);
});

test('copilot user-prompt-submit refreshes hot context after task_plan changes', async () => {
  assert.match(updatedPrompt.additionalContext, /HOT CONTEXT/);
  assert.match(updatedPrompt.additionalContext, /Updated next step/);
});
```

- [ ] **Step 2: Run the hook tests to prove current behavior still repeats full hot context on every prompt**

Run: `node --test tests/hooks/task-scoped-hook.test.mjs tests/hooks/hook-budget.test.mjs tests/hooks/session-summary.test.mjs`

Expected: FAIL in the new repeated-prompt assertions.

- [ ] **Step 3: Add a brief context builder and a stable planning fingerprint**

Implementation notes:

```js
export async function buildPlanningBriefContext({ taskPlanPath, findingsPath, progressPath }) {
  return [
    '[planning-with-files] BRIEF CONTEXT',
    `Task: ${taskTitle}`,
    `Phase: ${currentPhase}`,
    `Next: ${nextIncompleteStep}`,
    `Last failure: ${latestOpenError}`
  ].join('\n');
}

export function planningFingerprint(text) {
  return createHash('sha256').update(text).digest('hex');
}
```

Requirements:
- the brief context must stay under the current hook budget with large planning files
- the fingerprint must be stable for identical planning content
- no absolute home paths in emitted payloads

- [ ] **Step 4: Update `task-scoped-hook.sh` to emit event-aware payloads with change detection**

Behavior contract:
- `session-start`: compact startup cue only
- `pre-tool-use`: compact reminder only
- `user-prompt-submit`: full hot context only on first prompt or when planning fingerprint changed
- `stop` / `agent-stop` / `session-end`: keep session summary behavior

State contract:

```bash
write_last_hot_context_fingerprint "$task_dir" "$fingerprint"
if [ "$fingerprint" = "$previous_fingerprint" ]; then
  context="$(render_brief_context)"
else
  context="$(render_hot_context)"
fi
```

- [ ] **Step 5: Re-run the hook suite and verify the repeated-prompt tax collapses while summary/stop still pass**

Run: `node --test tests/hooks/task-scoped-hook.test.mjs tests/hooks/hook-budget.test.mjs tests/hooks/session-summary.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh harness/core/hooks/planning-with-files/scripts/planning-hot-context.mjs harness/core/hooks/planning-with-files/scripts/session-summary.mjs harness/core/hooks/planning-with-files/scripts/planning-brief-context.mjs harness/core/hooks/planning-with-files/scripts/render-brief-context.mjs tests/hooks/task-scoped-hook.test.mjs tests/hooks/hook-budget.test.mjs tests/hooks/session-summary.test.mjs
git commit -m "feat: reduce repeated planning hot context for copilot"
```

### Task 4: Detect And Govern User-Global / Workspace Overlap Tax

**Files:**
- Modify: `harness/installer/lib/adoption.mjs`
- Modify: `harness/installer/lib/health.mjs`
- Modify: `harness/installer/commands/doctor.mjs`
- Modify: `harness/installer/commands/verify.mjs`
- Test: `tests/installer/adoption.test.mjs`
- Test: `tests/installer/health.test.mjs`
- Test: `tests/installer/commands.test.mjs`

- [ ] **Step 1: Write failing tests for Copilot overlap warnings and adoption-status reasons**

```js
test('readHarnessHealth warns when Copilot is active in both workspace and user-global scopes', async () => {
  assert.ok(health.context.warnings.some((warning) => /scope overlap copilot/i.test(warning)));
});

test('adoption-status reports overlap when workspace Copilot projection shadows the global install', async () => {
  assert.equal(status.status, 'needs_apply');
  assert.ok(status.reasons.some((reason) => /workspace copilot projection overlaps user-global/i.test(reason)));
});
```

- [ ] **Step 2: Run the installer/adoption tests and verify there is no overlap governance yet**

Run: `node --test tests/installer/health.test.mjs tests/installer/commands.test.mjs tests/installer/adoption.test.mjs`

Expected: FAIL in the new overlap assertions.

- [ ] **Step 3: Implement overlap detection in `health` and surface operator-friendly guidance**

Detection contract:

```js
{
  target: 'copilot',
  scopes: ['user-global', 'workspace'],
  verdict: 'warning',
  message: 'Copilot is projected in both workspace and user-global scopes; this can duplicate startup and hook context.'
}
```

Requirements:
- warn, do not hard-fail, when the overlap is recoverable
- include a recommended action: keep workspace-only for repo-specific safety installs, or keep user-global-only for shared global usage

- [ ] **Step 4: Make `verify`, `doctor`, and `adoption-status` echo the overlap tax clearly**

Output contract:

```md
Scope overlap verdict: warning
Scope overlap detail: copilot -> workspace + user-global
Recommended action: choose one canonical scope for Copilot unless the workspace install is intentionally overriding safety policy.
```

- [ ] **Step 5: Re-run the adoption/health suite and verify overlap is visible but not promoted to a hard failure**

Run: `node --test tests/installer/health.test.mjs tests/installer/commands.test.mjs tests/installer/adoption.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add harness/installer/lib/adoption.mjs harness/installer/lib/health.mjs harness/installer/commands/doctor.mjs harness/installer/commands/verify.mjs tests/installer/adoption.test.mjs tests/installer/health.test.mjs tests/installer/commands.test.mjs
git commit -m "feat: surface copilot scope overlap tax"
```

### Task 5: Add Copilot Usage Budget Gates And Regression Fixtures

**Files:**
- Modify: `harness/core/context-budgets.json`
- Modify: `harness/installer/lib/health.mjs`
- Modify: `harness/installer/commands/verify.mjs`
- Modify: `harness/installer/commands/doctor.mjs`
- Create: `tests/installer/copilot-usage-budget.test.mjs`
- Test: `tests/hooks/hook-budget.test.mjs`
- Test: `tests/installer/health.test.mjs`

- [ ] **Step 1: Write failing tests for Copilot-specific budget thresholds and regression alerts**

```js
test('copilot hook payload budget fails when planning-hot exceeds the copilot threshold', async () => {
  assert.equal(report.health.context.summary.hooks.verdict, 'problem');
});

test('doctor reports the copilot overlap tax only once', async () => {
  assert.equal(matches.length, 1);
});
```

- [ ] **Step 2: Run the budget-focused suite and confirm current schema cannot express Copilot-specific thresholds**

Run: `node --test tests/installer/copilot-usage-budget.test.mjs tests/hooks/hook-budget.test.mjs tests/installer/health.test.mjs`

Expected: FAIL because the existing budgets are only global per cost surface.

- [ ] **Step 3: Extend the budget schema with optional target-specific overrides while keeping backward compatibility**

Schema shape:

```json
"hookPayload": {
  "warn": { "chars": 3000, "lines": 60, "tokens": 3000 },
  "problem": { "chars": 4500, "lines": 90, "tokens": 4500 },
  "targets": {
    "copilot": {
      "warn": { "chars": 1200, "lines": 24, "tokens": 300 },
      "problem": { "chars": 2000, "lines": 40, "tokens": 500 }
    }
  }
}
```

Requirements:
- missing target override falls back to the current global thresholds
- malformed target overrides must degrade gracefully and still report a problem

- [ ] **Step 4: Feed the target-specific thresholds into `health`, `verify`, and `doctor`**

Implementation notes:

```js
const effectiveBudget = selectBudgetForTarget(budgets.budgets.hookPayload, target);
const evaluation = evaluateBudget(measurement, effectiveBudget);
```

- [ ] **Step 5: Run the budget suite plus a focused live verify and confirm the new gates are stable**

Run:
- `node --test tests/installer/copilot-usage-budget.test.mjs tests/hooks/hook-budget.test.mjs tests/installer/health.test.mjs`
- `node harness/installer/commands/harness.mjs verify --output=.harness/verification-ledger`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add harness/core/context-budgets.json harness/installer/lib/health.mjs harness/installer/commands/verify.mjs harness/installer/commands/doctor.mjs tests/installer/copilot-usage-budget.test.mjs tests/hooks/hook-budget.test.mjs tests/installer/health.test.mjs
git commit -m "test: add copilot usage budget gates"
```

### Task 6: Optional Copilot Output Guidance Tightening

**Files:**
- Modify: `harness/core/policy/platform-overrides/copilot.md`
- Modify: `harness/core/policy/entry-profiles.json`
- Test: `tests/installer/policy-render.test.mjs`

This task is intentionally last. The expected ROI is lower than the input / cached-token tasks above because Copilot’s system/developer prompts already bias output shape.

- [ ] **Step 1: Write a failing render test for an opt-in concise Copilot output hint**

```js
test('renderEntry can include concise copilot output guidance without affecting other targets', async () => {
  assert.match(entry, /Prefer terse progress updates and concise finals unless the user asks for depth/);
});
```

- [ ] **Step 2: Run the render tests and verify the guidance line does not exist yet**

Run: `node --test tests/installer/policy-render.test.mjs`

Expected: FAIL

- [ ] **Step 3: Add an opt-in Copilot-specific profile or override line instead of changing global policy semantics**

Implementation notes:

```md
When verbosity is not explicitly requested, prefer terse progress updates and concise final summaries.
```

Requirements:
- do not apply this to non-Copilot targets
- keep it opt-in if empirical testing shows meaningful behavior change risk

- [ ] **Step 4: Re-run the render tests and keep this task gated behind review**

Run: `node --test tests/installer/policy-render.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add harness/core/policy/platform-overrides/copilot.md harness/core/policy/entry-profiles.json tests/installer/policy-render.test.mjs
git commit -m "docs: add optional copilot concise output guidance"
```

## End-To-End Verification Order

After Tasks 1-5, run this exact sequence before reporting completion:

1. `node --test tests/installer/health.test.mjs tests/installer/commands.test.mjs tests/installer/adoption.test.mjs`
2. `node --test tests/hooks/task-scoped-hook.test.mjs tests/hooks/hook-budget.test.mjs tests/hooks/session-summary.test.mjs`
3. `node --test tests/installer/policy-render.test.mjs tests/installer/copilot-usage-budget.test.mjs`
4. `node harness/installer/commands/harness.mjs verify --output=.harness/verification-ledger`
5. `./scripts/harness doctor --check-only`

Expected final state:

- `verify` still reports `Context entry verdict: ok`
- `verify` reports Copilot hook / overlap detail explicitly
- `doctor --check-only` stays green for canonical single-scope installs
- repeated Copilot prompt flows no longer emit full planning hot context unless the planning fingerprint changed

## Review Checklist

Review this plan against the following before execution:

1. Are we comfortable making `copilot-default` the implicit skill profile for Copilot-only installs?
2. Should overlap governance stay `warning`, or should some workspace + user-global combinations escalate to `problem`?
3. Do we want the planning fingerprint sidecar written into the task directory, or into a hidden `.harness` runtime directory?
4. Is Task 6 worth doing at all, or should output tuning stay out of scope until we have stronger evidence that output tokens are a meaningful cost driver here?

## Recommended Execution Split

- Batch A: Task 1 + Task 2
- Batch B: Task 3
- Batch C: Task 4 + Task 5
- Batch D: Task 6 only if requested after reviewing the first three batches