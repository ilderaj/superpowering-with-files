# Claude Code Harness Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Claude Code 适配从“有投射/有配置文件”升级为“能清晰区分投射支持、settings 配置存在、hook payload 可本地验证、真实 runtime invocation 未被证明”的可验证状态，避免 `doctorPassed` / `hookMode:on` 给出过度乐观结论。

**Architecture:** 不改变 Claude Code hooks 的默认策略：仍然只在用户显式选择 `--hooks=on` 时安装/合并 hooks。优化集中在 health / doctor / verify / adoption 的证据语义、Claude Code hook payload 本地测量、报告输出和回归测试。实现上把 “settings hook config exists” 与 “local hook payload script works” 与 “Claude Code runtime actually invoked it” 分层表达。

**Tech Stack:** Node.js ESM, `node:test`, Harness installer commands, Claude Code settings hooks, planning-with-files hook scripts.

---

## Companion Plan Metadata

- **Active task path:** `planning/active/cc-harness-analysis/`
- **Lifecycle state:** active
- **Sync-back status:** synced summary to active task files on `2026-05-27 17:58:28 UTC+8`
- **Review status:** waiting for user review; do not execute implementation until approved

---

## 0. 关键结论与优化方向

当前项目对 Claude Code 的支持是“源码层面真实存在”的：

- 有 `claude-code` adapter。
- 有 `CLAUDE.md` projection。
- 有 `.claude/skills` projection。
- 有 Claude Code hooks config source。
- `sync` 能把 hooks 合并进 `.claude/settings.json` 或 `~/.claude/settings.json`。
- 测试已覆盖部分 Claude Code projection / sync / script-level behavior。

但当前缺陷是证据链表达不准确：

1. `hookMode:on` 和 adoption receipt 的 `doctorPassed:true` 容易被误解为 “Claude Code hooks 已在当前 CC runtime 中实际生效”。
2. `health.mjs` 只测量 `codex` / `copilot` hook payload，不测 `claude-code`：
   ```js
   const MEASURED_HOOK_PAYLOAD_TARGETS = new Set(['codex', 'copilot']);
   ```
3. `HOOK_EVIDENCE_BY_TARGET` 却把 `claude-code` 标为 `verified`，语义偏乐观。
4. 当前真实用户环境中 `.claude/settings.local.json` 和 `~/.claude/settings.json` 都没有 `hooks` 字段，但 `.harness/state.json` / adoption receipt 曾声明 `hookMode:on` / success，造成“已启用”的错觉。
5. `.harness/projections.json` 里的 hook target path 可能来自临时 home，容易让用户误判当前真实 home 是否已配置。

---

## 1. 文件职责规划

### 修改文件

- `harness/installer/lib/health.mjs`
  - 增加 Claude Code hook payload 本地测量。
  - 调整 evidence semantics，避免把 config-level 检查等同于 runtime invocation。
  - 在 health report 中明确区分：
    - hook config status
    - hook script status
    - local payload status
    - runtime invocation evidence

- `harness/installer/commands/doctor.mjs`
  - 在 doctor 输出中更清楚展示 Claude Code hook 证据等级。
  - 对 `hookMode:on` 但 Claude Code settings hooks 缺失或 payload 未测量的情况给出可操作 warning/problem。

- `harness/installer/commands/verify.mjs`
  - 保留现有 JSON report 格式兼容性。
  - 增加 Claude Code verification details，供 adoption receipt 和人工排查使用。

- `harness/installer/lib/adoption.mjs`
  - 避免 `doctorPassed:true` 被解释成 runtime invocation proof。
  - 在 receipt/status 中增加更细的 verification summary。
  - 对 repo HEAD 变化、state/receipt mismatch 之外，补充 hook evidence mismatch reason。

- `harness/installer/commands/adopt-global.mjs`
  - 使用增强后的 health / verify 信息写 receipt。
  - 失败时输出更明确的 Claude Code action hints。

- `docs/install/claude-code.md`
  - 明确说明：
    - Claude Code hooks 默认不安装。
    - hook scripts 存在不代表 Claude Code 会调用。
    - 必须有 settings `hooks` 配置。
    - `doctorPassed` 代表 Harness health checks 通过，不代表人工 runtime invocation 已证明。
    - 如何做 manual hook test。

- `README.md`
  - 在 Claude Code 支持矩阵里增加证据等级说明。

### 修改测试

- `tests/installer/health.test.mjs`
  - 增加 Claude Code hook payload measurement 测试。
  - 增加 “state says hookMode:on but settings hooks missing” 的问题/警告测试。
  - 增加 evidence semantics 回归测试。

- `tests/commands/doctor.test.mjs` 或现有 installer command test file
  - 如果当前没有 doctor command test 文件，则优先放入现有 installer test 结构；不要为了一个小断言创建过度复杂的新 harness。
  - 覆盖 doctor 输出中的 Claude Code evidence section。

- `tests/commands/verify.test.mjs` 或现有 verify test file
  - 覆盖 verify report 中新增 Claude Code verification details。

- `tests/adapters/sync-hooks.test.mjs`
  - 现有测试已覆盖 merge/remove；只补充必要断言，避免重复大测试。

---

## 2. Implementation Tasks

### Task 1: 定义 Claude Code hook evidence 分层模型

**Files:**

- Modify: `harness/installer/lib/health.mjs`
- Test: `tests/installer/health.test.mjs`

**目标：** 把当前单一 `evidenceLevel: 'verified'` 改成更精确的分层结果，避免 “config exists” 被误读成 “runtime invoked”。

建议语义：

```js
{
  evidenceLevel: 'config-verified',
  configEvidence: 'settings-hook-present',
  payloadEvidence: 'local-payload-verified',
  runtimeEvidence: 'not-measured'
}
```

其中：

- `config-verified`: settings 中存在 Harness-managed hooks marker、required events、scripts。
- `local-payload-verified`: 本地执行 projected hook script 能返回合法 payload。
- `runtime-verified`: 只有将来真的有 Claude Code runtime invocation proof 才使用；本轮不伪造。
- `not-measured`: 明确表示未证明。

- [ ] **Step 1: 写 failing test，验证 Claude Code 不再被笼统标记为 runtime verified**

  在 `tests/installer/health.test.mjs` 增加测试：

  ```js
  test('readHarnessHealth reports Claude Code hook evidence without claiming runtime invocation', async () => {
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

      await withCwd(root, () => sync([]));
      const health = await readHarnessHealth(root, '/home/user');
      const planning = health.targets['claude-code'].hooks.find(
        (hook) => hook.parentSkillName === 'planning-with-files'
      );

      assert.equal(planning.status, 'ok');
      assert.equal(planning.evidenceLevel, 'config-verified');
      assert.equal(planning.configEvidence, 'settings-hook-present');
      assert.equal(planning.runtimeEvidence, 'not-measured');
    } finally {
      await removeHarnessFixture(root);
    }
  });
  ```

- [ ] **Step 2: 运行单测，确认失败**

  Run:

  ```bash
  node --test tests/installer/health.test.mjs
  ```

  Expected: FAIL，因为当前 `claude-code` 仍可能被 `HOOK_EVIDENCE_BY_TARGET` 标为笼统 `verified`，且没有 `runtimeEvidence` 字段。

- [ ] **Step 3: 修改 `health.mjs` 的 evidence mapping**

  将 Claude Code 的 evidence 定义从笼统 verified 改成 config-level verified。例如：

  ```js
  const HOOK_EVIDENCE_BY_TARGET = {
    codex: { evidenceLevel: 'verified' },
    copilot: { evidenceLevel: 'verified' },
    cursor: { evidenceLevel: 'verified' },
    'claude-code': {
      evidenceLevel: 'config-verified',
      configEvidence: 'settings-hook-present',
      runtimeEvidence: 'not-measured'
    }
  };
  ```

  说明：这里不否认 Claude Code projection 支持，只是不把它说成 runtime invocation 已被证明。

- [ ] **Step 4: 运行测试确认通过**

  Run:

  ```bash
  node --test tests/installer/health.test.mjs
  ```

  Expected: PASS。

---

### Task 2: 将 Claude Code 加入本地 hook payload measurement

**Files:**

- Modify: `harness/installer/lib/health.mjs`
- Test: `tests/installer/health.test.mjs`

**目标：** 让 health 能本地执行 Claude Code 的 projected hook script，至少证明 hook script 能输出符合 Claude Code hook payload 约定的 JSON。

当前代码已有可复用路径：

```js
const MEASURED_HOOK_PAYLOAD_TARGETS = new Set(['codex', 'copilot']);
```

应改为：

```js
const MEASURED_HOOK_PAYLOAD_TARGETS = new Set(['codex', 'copilot', 'claude-code']);
```

- [ ] **Step 1: 写 failing test，验证 Claude Code payload 被测量**

  在 `tests/installer/health.test.mjs` 增加：

  ```js
  test('readHarnessHealth measures Claude Code local hook payloads after sync', async () => {
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

      await withCwd(root, () => sync([]));
      const health = await readHarnessHealth(root, '/home/user');

      const measured = health.context.hooks.find(
        (hook) =>
          hook.target === 'claude-code' &&
          hook.parentSkillName === 'planning-with-files' &&
          hook.status === 'ok'
      );

      assert.ok(measured);
      assert.equal(measured.category, 'hook-payload');
      assert.ok(measured.measurement.approxTokens >= 0);
    } finally {
      await removeHarnessFixture(root);
    }
  });
  ```

- [ ] **Step 2: 运行测试，确认失败**

  Run:

  ```bash
  node --test tests/installer/health.test.mjs
  ```

  Expected: FAIL，因为当前 `MEASURED_HOOK_PAYLOAD_TARGETS` 不包含 `claude-code`。

- [ ] **Step 3: 修改 measurement allowlist**

  在 `harness/installer/lib/health.mjs` 修改：

  ```js
  const MEASURED_HOOK_PAYLOAD_TARGETS = new Set(['codex', 'copilot', 'claude-code']);
  ```

- [ ] **Step 4: 确保 `selectHookPayloadRequests()` 对 Claude Code 使用正确参数**

  当前非 Copilot planning hook 路径已经会生成：

  ```js
  {
    eventName,
    args: [projection.target, toHookPayloadEventArg(eventName)]
  }
  ```

  对 Claude Code 来说应产生类似：

  ```js
  ['claude-code', 'user-prompt-submit']
  ```

  如果测试发现事件名不匹配，最小修复是只调整 `toHookPayloadEventArg()` / event selection，不要改 hook script 协议。

- [ ] **Step 5: 运行测试确认通过**

  Run:

  ```bash
  node --test tests/installer/health.test.mjs
  ```

  Expected: PASS，且 `health.context.hooks` 包含 `claude-code` 的 local payload measurement。

---

### Task 3: 在 health problems/warnings 中暴露 Claude Code settings mismatch

**Files:**

- Modify: `harness/installer/lib/health.mjs`
- Test: `tests/installer/health.test.mjs`

**目标：** 当 state 声明 `hookMode:on` 且 target 包含 `claude-code`，但实际 target settings 缺少 Harness-managed hooks 时，health 必须清楚报告，而不是只给出泛泛 missing。

- [ ] **Step 1: 写 failing test，覆盖 settings 缺失场景**

  ```js
  test('readHarnessHealth reports Claude Code hookMode on with missing settings hooks', async () => {
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

      const health = await readHarnessHealth(root, '/home/user');
      const planning = health.targets['claude-code'].hooks.find(
        (hook) => hook.parentSkillName === 'planning-with-files'
      );

      assert.equal(planning.status, 'missing');
      assert.match(planning.message, /Hook config is missing/);
      assert.ok(
        health.problems.some((problem) =>
          problem.includes('claude-code') && problem.includes('.claude/settings.json')
        )
      );
    } finally {
      await removeHarnessFixture(root);
    }
  });
  ```

- [ ] **Step 2: 运行测试，确认当前 problem message 不够明确**

  Run:

  ```bash
  node --test tests/installer/health.test.mjs
  ```

  Expected: FAIL 或 message 不包含 enough actionable path。

- [ ] **Step 3: 优化 health problem 文案**

  在收集 hook health problems 的位置加入 target/path 信息：

  ```js
  `${projection.target}: ${projection.message} Expected Harness-managed hook settings at ${projection.configTarget}.`
  ```

  对 Claude Code 特别重要，因为正确位置是：

  - workspace: `.claude/settings.json`
  - user-global: `~/.claude/settings.json`

  不是 `.claude/hooks.json`。

- [ ] **Step 4: 运行测试确认通过**

  Run:

  ```bash
  node --test tests/installer/health.test.mjs
  ```

  Expected: PASS。

---

### Task 4: 改进 doctor 输出，避免 `Harness installation is healthy` 误导

**Files:**

- Modify: `harness/installer/commands/doctor.mjs`
- Test: existing doctor command test file, or add focused test under installer command tests

**目标：** doctor 仍然可以在没有 problems 时通过，但输出必须显示 Claude Code hook evidence 层级，让用户知道“本地 payload verified”与“runtime invocation not measured”的区别。

建议 doctor 输出增加类似：

```text
Hook evidence:
- claude-code / planning-with-files: config=config-verified, payload=local-payload-verified, runtime=not-measured
```

- [ ] **Step 1: 写 doctor output test**

  如果已有 command-output helper，使用现有 helper；否则添加最小测试捕获 stdout。

  Expected assertions:

  ```js
  assert.match(stdout, /Hook evidence:/);
  assert.match(stdout, /claude-code/);
  assert.match(stdout, /runtime=not-measured/);
  ```

- [ ] **Step 2: 运行 doctor 测试，确认失败**

  Run:

  ```bash
  node --test tests/installer/health.test.mjs
  ```

  或实际存在的 doctor command test path。

- [ ] **Step 3: 在 `doctor.mjs` 增加 render function**

  增加一个小函数，例如：

  ```js
  function renderHookEvidenceSection(health) {
    const lines = ['Hook evidence:'];

    for (const [target, targetHealth] of Object.entries(health.targets ?? {})) {
      for (const hook of targetHealth.hooks ?? []) {
        lines.push(
          `- ${target} / ${hook.parentSkillName}: config=${hook.configEvidence ?? hook.evidenceLevel ?? 'unknown'}, payload=${hook.payloadEvidence ?? 'not-measured'}, runtime=${hook.runtimeEvidence ?? 'not-measured'}`
        );
      }
    }

    return `${lines.join('\n')}\n`;
  }
  ```

- [ ] **Step 4: 在 doctor 成功和失败路径都输出 evidence**

  在现有：

  ```js
  console.log(renderHookPayloadSection(health));
  console.log(renderBudgetLedgerSection(health));
  ```

  附近加入：

  ```js
  console.log(renderHookEvidenceSection(health));
  ```

- [ ] **Step 5: 运行测试确认通过**

  Run:

  ```bash
  node --test tests/installer/health.test.mjs
  ```

  Expected: PASS。

---

### Task 5: 改进 verify report，使 adoption 可以引用更细证据

**Files:**

- Modify: `harness/installer/commands/verify.mjs`
- Test: existing verify command test file, or add focused verify test

**目标：** verify report 不只是 dump `health`，还要有稳定 summary，便于 receipt/status 使用，不用调用方理解整个 health schema。

建议新增：

```js
verification: {
  hookEvidence: {
    'claude-code': {
      'planning-with-files': {
        config: 'settings-hook-present',
        payload: 'local-payload-verified',
        runtime: 'not-measured'
      }
    }
  }
}
```

- [ ] **Step 1: 写 verify JSON report test**

  测试内容：

  ```js
  assert.equal(report.verification.hookEvidence['claude-code']['planning-with-files'].config, 'settings-hook-present');
  assert.equal(report.verification.hookEvidence['claude-code']['planning-with-files'].runtime, 'not-measured');
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run:

  ```bash
  node --test tests/installer/verify.test.mjs
  ```

  如果没有该文件，运行新增 test file。

- [ ] **Step 3: 在 `verify.mjs` 构造 stable summary**

  增加 helper：

  ```js
  function summarizeHookEvidence(health) {
    const summary = {};

    for (const [target, targetHealth] of Object.entries(health.targets ?? {})) {
      for (const hook of targetHealth.hooks ?? []) {
        summary[target] ??= {};
        summary[target][hook.parentSkillName] = {
          config: hook.configEvidence ?? hook.evidenceLevel ?? 'unknown',
          payload: hook.payloadEvidence ?? 'not-measured',
          runtime: hook.runtimeEvidence ?? 'not-measured'
        };
      }
    }

    return summary;
  }
  ```

  然后 report 增加：

  ```js
  verification: {
    hookEvidence: summarizeHookEvidence(health)
  }
  ```

- [ ] **Step 4: 运行测试确认通过**

  Run:

  ```bash
  node --test tests/installer/verify.test.mjs
  ```

  Expected: PASS。

---

### Task 6: 调整 adoption receipt/status，避免 `doctorPassed:true` 过度表达

**Files:**

- Modify: `harness/installer/lib/adoption.mjs`
- Modify: `harness/installer/commands/adopt-global.mjs`
- Test: adoption-related tests

**目标：** 保留向后兼容的 `doctorPassed:true`，但新增明确字段，说明它不是 Claude Code runtime invocation proof。

建议 receipt 增加：

```js
verification: {
  doctorPassed: true,
  runtimeInvocationVerified: false,
  hookEvidence: {
    'claude-code': {
      'planning-with-files': {
        config: 'settings-hook-present',
        payload: 'local-payload-verified',
        runtime: 'not-measured'
      }
    }
  }
}
```

- [ ] **Step 1: 写 receipt test**

  测试 `createSuccessReceipt()` 或 adopt-global integration receipt：

  ```js
  assert.equal(receipt.doctorPassed, true);
  assert.equal(receipt.verification.runtimeInvocationVerified, false);
  assert.equal(
    receipt.verification.hookEvidence['claude-code']['planning-with-files'].runtime,
    'not-measured'
  );
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run:

  ```bash
  node --test tests/installer/adoption.test.mjs
  ```

- [ ] **Step 3: 修改 `createSuccessReceipt()` 参数**

  将当前：

  ```js
  export async function createSuccessReceipt(rootDir, state, options = {}) {
  ```

  扩展为接受：

  ```js
  options.verification
  ```

  并写入 receipt：

  ```js
  verification: options.verification ?? {
    doctorPassed: true,
    runtimeInvocationVerified: false,
    hookEvidence: {}
  }
  ```

- [ ] **Step 4: 修改 `adopt-global.mjs` 调用处**

  在 `readHarnessHealth()` 后构造 hook evidence summary，传入：

  ```js
  const receipt = await createSuccessReceipt(rootDir, nextState, {
    verificationReportPath: path.join(verificationOutput, 'latest.json'),
    verification: {
      doctorPassed: true,
      runtimeInvocationVerified: false,
      hookEvidence: summarizeHookEvidence(health)
    }
  });
  ```

- [ ] **Step 5: 修改 `computeAdoptionStatus()` reason**

  当 receipt 有 `runtimeInvocationVerified:false` 且 target 包含 `claude-code`、hookMode 为 `on` 时，不应失败，但应给 warning/reason：

  ```text
  Claude Code runtime hook invocation is not measured; local settings and payload checks passed only.
  ```

- [ ] **Step 6: 运行 adoption tests**

  Run:

  ```bash
  node --test tests/installer/adoption.test.mjs
  ```

  Expected: PASS。

---

### Task 7: 修正文档，明确 Claude Code hooks 的真实边界

**Files:**

- Modify: `docs/install/claude-code.md`
- Modify: `README.md`

**目标：** 文档不再让人误以为“支持 Claude Code”自动等于 “hooks 在当前 Claude Code 会话中生效”。

需要明确写入：

- Claude Code base support:
  - `CLAUDE.md`
  - `.claude/skills`
- Optional hook support:
  - requires `--hooks=on`
  - writes to settings `hooks` field
- Scripts alone are inert:
  - `.claude/hooks/*.sh` exists 不代表 Claude Code 会调用
- Verification levels:
  - projection check
  - settings hook config check
  - local payload script check
  - runtime invocation proof
- Current limitation:
  - Harness can locally validate hook payload.
  - Harness cannot prove the running Claude Code session invoked the hook unless Claude Code runtime emits or records invocation evidence.

- [ ] **Step 1: 更新 `docs/install/claude-code.md`**

  增加 section：

  ```md
  ## Verification levels

  Claude Code support is verified in layers:

  1. Projection: `CLAUDE.md` and `.claude/skills` exist.
  2. Hook configuration: `.claude/settings.json` or `~/.claude/settings.json` contains Harness-managed `hooks`.
  3. Local hook payload: Harness can execute the projected hook script and parse the expected JSON payload.
  4. Runtime invocation: the active Claude Code process is observed invoking the hook.

  The first three levels can be checked by Harness. Runtime invocation requires runtime evidence from Claude Code itself and is reported separately when available.
  ```

- [ ] **Step 2: 更新 README support matrix**

  把 Claude Code 从单纯 “supported” 表达改成：

  ```md
  Claude Code: entry and skills supported; hooks supported when explicitly enabled; runtime invocation evidence is reported separately.
  ```

- [ ] **Step 3: 运行文档相关检查**

  Run:

  ```bash
  rg -n "runtime invocation|Verification levels|Claude Code" README.md docs/install/claude-code.md
  ```

  Expected: 文档包含新增说明。

---

### Task 8: 全量回归验证

**Files:**

- No source changes beyond above files.

- [ ] **Step 1: 运行 focused tests**

  ```bash
  node --test tests/installer/health.test.mjs
  node --test tests/adapters/sync-hooks.test.mjs
  node --test tests/hooks/task-scoped-hook.test.mjs
  node --test tests/hooks/hook-budget.test.mjs
  ```

  Expected: PASS。

- [ ] **Step 2: 运行 installer/adoption/verify 相关测试**

  ```bash
  node --test tests/installer/*.test.mjs
  ```

  Expected: PASS。

- [ ] **Step 3: 运行项目现有 test script**

  先检查 lockfile/package manager，再运行仓库约定命令。若是 npm scripts：

  ```bash
  npm test
  ```

  Expected: PASS。

- [ ] **Step 4: 手动 dry-run 验证**

  ```bash
  ./scripts/harness sync --dry-run
  ./scripts/harness doctor --check-only
  ./scripts/harness verify
  ```

  Expected:

  - `sync --dry-run` 展示预期 projection diff。
  - `doctor --check-only` 显示 hook evidence section。
  - `verify` report 包含 Claude Code hook evidence summary。

---

## 3. 明确不做的事

本计划不做以下事情：

1. 不默认安装 Claude Code hooks。  
   仍遵守现有策略：除非用户显式选择 `--hooks=on`，否则不写入/修改 hooks。

2. 不把 hook scripts 存在解释为 hooks 生效。  
   `.claude/hooks/task-scoped-hook.sh` 只是脚本，Claude Code 是否调用取决于 settings `hooks`。

3. 不伪造 runtime invocation proof。  
   如果没有 Claude Code runtime 明确回传 invocation evidence，就报告 `runtime=not-measured`。

4. 不把 global 和 workspace settings 混在一起。  
   报告必须显示具体 target path，避免 `.harness/projections.json` 中临时 home path 误导真实用户 home 状态。

---

## 4. Review Checklist

实施前需要确认以下设计点：

- [ ] 是否接受把 Claude Code 的 evidence 从笼统 `verified` 改为 `config-verified` / `local-payload-verified` / `runtime=not-measured`？
- [ ] 是否接受 adoption receipt 保留 `doctorPassed:true`，但新增更细的 `verification` 字段来避免误解？
- [ ] 是否希望 `doctor` 对 `runtime=not-measured` 只输出 warning，而不是 problem？
- [ ] 是否希望文档明确写出：Harness 目前不能单方面证明当前 Claude Code runtime 已实际调用 hook？

---

## 5. Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-27-cc-harness-analysis.md`.

Two execution options after review:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.

Current status: waiting for user review; no implementation code has been changed by this plan-writing step.
