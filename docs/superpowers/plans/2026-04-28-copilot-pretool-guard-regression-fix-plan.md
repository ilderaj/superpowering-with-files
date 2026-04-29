# Copilot PreTool Guard Regression Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Active task path:** `planning/active/copilot-pretool-guard-regression-fix/`
> **Lifecycle state:** closed
> **Sync-back status:** synced on 2026-04-28

Active task path: planning/active/copilot-pretool-guard-regression-fix/

**Goal:** 修复 Copilot workspace safety 下 `pretool-guard.sh` 因 payload 解析失败而导致的 `Hook PreToolUse aborted`，并补齐 projection / sync / runtime / smoke 四层回归验证。

**Architecture:** 仅收敛在 `pretool-guard.sh` 的 payload 解析与 command 归一化层，不改 hook projection contract、不改 policy profile 语义。修复核心是把“异常退出”改为“可判定的 `allow/ask/deny` 输出”，并用 Copilot 专用测试夹具锁住真实回归面。

**Tech Stack:** Bash, embedded Node.js in shell script, Node test runner, existing Harness adapter tests.

---

## Scope And Non-Goals

### In Scope
- `harness/core/hooks/safety/scripts/pretool-guard.sh` 的 payload 解析与 fallback 判定
- `tests/hooks/pretool-guard.test.mjs` 的 runtime regression tests
- `tests/adapters/hook-projection.test.mjs` 中 Copilot safety projection 覆盖
- `tests/adapters/sync-hooks.test.mjs` 中 Copilot safety sync/install 覆盖
- 一次真实 Copilot workspace safety 手工 smoke

### Out Of Scope
- 更改 `policyProfile` / install state 模型
- 重写 safety policy 文本
- 调整 Codex/Cursor/Claude 的 runtime 逻辑，除非共享脚本改动被动影响它们
- 把 Copilot safety 降级为默认关闭或删除该 hook

## File Structure

| File | Responsibility |
| --- | --- |
| `harness/core/hooks/safety/scripts/pretool-guard.sh` | 解析 hook stdin，归一化 command/cwd/tool 信息，并输出 `allow / ask / deny` |
| `tests/hooks/pretool-guard.test.mjs` | 直接执行 guard 脚本，验证 runtime payload 解析和 decision fallback |
| `tests/adapters/hook-projection.test.mjs` | 验证 safety profile 下 Copilot hook projection 的 config target / script target |
| `tests/adapters/sync-hooks.test.mjs` | 验证 `sync` 真的把 Copilot safety hooks 安装到 `.github/hooks/` |

## Implementation Strategy

1. **先 red**：用 raw stdin regression test 复现“guard 不应 abort”。
2. **再 fix**：把 payload 解析包成容错层，优先解析 JSON，失败时继续尝试提取嵌入 JSON 或把 raw stdin 作为 command 候选，而不是直接抛异常。
3. **保留 safety 边界**：危险 shell 模式仍按现有 `safePatterns` / `dangerousPatterns`、risk assessment、upstream 规则判定。
4. **补 adapter regression**：projection 与 sync 对 Copilot safety 明确加测试，防止“能安装但没人测 runtime”的老问题继续存在。

## Task 1: 为 guard runtime 建立 Copilot 回归夹具

**Files:**
- Modify: `tests/hooks/pretool-guard.test.mjs`

- [ ] **Step 1: 增加 raw stdin helper，允许测试 malformed / wrapped payload**

在 `tests/hooks/pretool-guard.test.mjs` 里保留现有 `runGuard(...)`，并新增一个 raw helper：

```js
function runGuardRawInput(scriptPath, cwd, stdinText, platform = 'copilot', env = {}) {
  const stdout = execFileSync('bash', [scriptPath, platform], {
    cwd,
    input: stdinText,
    env: { ...process.env, ...env }
  }).toString();
  return JSON.parse(stdout);
}
```

- [ ] **Step 2: 写第一个 failing regression test，证明 malformed stdin 当前会 abort**

把下面测试加入 `tests/hooks/pretool-guard.test.mjs`：

```js
test('pretool-guard does not abort on malformed Copilot payload text', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-copilot-malformed-'));
  try {
    await writeFile(path.join(root, 'README.md'), '# fixture\n');
    initGitRepo(root);

    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuardRawInput(
      scriptPath,
      root,
      'copilot preToolUse payload: {not-json}\n',
      'copilot'
    );

    assert.match(result.permissionDecision, /allow|ask/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: 写第二个 failing regression test，覆盖 wrapped JSON payload**

```js
test('pretool-guard accepts Copilot payloads that wrap a JSON body in text', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-copilot-wrapped-'));
  try {
    await writeFile(path.join(root, 'README.md'), '# fixture\n');
    initGitRepo(root);

    const payload = JSON.stringify({ cwd: root, toolInput: { command: 'git status' } });
    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuardRawInput(
      scriptPath,
      root,
      `copilot-hook payload follows\n${payload}\n`,
      'copilot'
    );

    assert.equal(result.permissionDecision, 'allow');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 4: 写第三个 regression test，保证 parse failure 下危险模式仍不会直接放行**

```js
test('pretool-guard keeps dangerous shell fallback under ask when raw Copilot payload contains rm -rf', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-copilot-dangerous-'));
  try {
    await writeFile(path.join(root, 'README.md'), '# fixture\n');
    await writeTaskPlan(root, false);
    initGitRepo(root);

    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuardRawInput(
      scriptPath,
      root,
      'rm -rf ./DerivedData\n',
      'copilot'
    );

    assert.equal(result.permissionDecision, 'ask');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 5: 运行 red 测试，确认当前实现至少有一条失败**

Run:

```bash
node --test tests/hooks/pretool-guard.test.mjs
```

Expected before implementation:
- 至少 `pretool-guard does not abort on malformed Copilot payload text` 失败
- 失败形式可能是 `execFileSync` 抛异常，或脚本退出码非零

## Task 2: 硬化 `pretool-guard.sh` 的 payload 解析与 fallback 判定

**Files:**
- Modify: `harness/core/hooks/safety/scripts/pretool-guard.sh`
- Modify: `tests/hooks/pretool-guard.test.mjs`

- [ ] **Step 1: 用容错解析 helper 替换裸 `JSON.parse(payloadText)`**

把脚本中的：

```js
const payload = JSON.parse(payloadText);
```

替换为这种结构：

```js
function parsePayloadText(text) {
  try {
    return { payload: JSON.parse(text), rawText: text, parseError: null };
  } catch (error) {
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return { payload: JSON.parse(objectMatch[0]), rawText: text, parseError: null };
      } catch {}
    }
    return { payload: {}, rawText: text, parseError: error };
  }
}

const { payload, rawText, parseError } = parsePayloadText(payloadText);
```

- [ ] **Step 2: 让 command 提取在 parse failure 时继续利用 raw stdin**

把 `commandFromPayload()` 改成接受 `rawText`，并在从 payload 提取不到 command 时回落到原始文本：

```js
function commandFromPayload(rawText) {
  const direct = firstString([
    'command',
    'toolInput.command',
    'tool_input.command',
    'input.command',
    'bash.command',
    'rawCommand'
  ]);
  if (direct) return direct;

  for (const candidate of ['arguments', 'toolInput.arguments', 'tool_input.arguments']) {
    const value = get(payload, candidate);
    if (Array.isArray(value) && value.length > 0) {
      return value.join(' ');
    }
  }

  return typeof rawText === 'string' ? rawText.trim() : '';
}
```

- [ ] **Step 3: 对 parse failure 增加安全但不 abort 的降级语义**

在最终 decision 前加入一段：

```js
if (parseError && !command) {
  emit('allow', 'Hook payload could not be parsed, but no executable command was detected.', cwd, rawText.trim());
  process.exit(0);
}
```

并保留后续危险模式判定，让 `rm -rf` / `git reset --hard` 这类 raw stdin 仍能落到 `ask/deny` 路径。

- [ ] **Step 4: 运行 guard 单测，确认 red -> green**

Run:

```bash
node --test tests/hooks/pretool-guard.test.mjs
```

Expected after implementation:
- 所有既有 Codex tests 继续通过
- 新增 Copilot malformed/wrapped payload tests 通过
- 危险 raw stdin regression test 返回 `ask`，而不是 `allow` 或 abort

## Task 3: 补齐 Copilot safety projection 与 sync 回归

**Files:**
- Modify: `tests/adapters/hook-projection.test.mjs`
- Modify: `tests/adapters/sync-hooks.test.mjs`

- [ ] **Step 1: 在 hook projection test 中增加 Copilot safety case**

把下面测试加入 `tests/adapters/hook-projection.test.mjs`：

```js
test('planHookProjections adds Copilot safety hooks when the safety profile is active', async () => {
  const plans = await planHookProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'copilot',
    hookMode: 'on',
    policyProfile: 'safety'
  });
  const safety = plans.find((plan) => plan.parentSkillName === 'safety');

  assert.equal(safety.status, 'planned');
  assert.equal(safety.configTarget, path.join(process.cwd(), '.github/hooks/safety.json'));
  assert.deepEqual(safety.scriptSourcePaths, [
    path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh'),
    path.join(process.cwd(), 'harness/core/hooks/safety/scripts/session-checkpoint.sh')
  ]);
  assert.equal(safety.scriptTargetRoot, path.join(process.cwd(), '.github/hooks'));
});
```

- [ ] **Step 2: 在 sync test 中增加 Copilot safety install case**

把下面测试加入 `tests/adapters/sync-hooks.test.mjs`：

```js
test('sync installs copilot safety hooks when the safety profile is active', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      policyProfile: 'safety',
      skillProfile: 'full',
      targets: { copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const hooks = JSON.parse(await readFile(path.join(root, '.github/hooks/safety.json'), 'utf8'));

    assert.ok(hooks.hooks.sessionStart);
    assert.ok(hooks.hooks.preToolUse);
    assert.match(JSON.stringify(hooks), /Harness-managed safety hook/);
    assert.match(await readFile(path.join(root, '.github/hooks/pretool-guard.sh'), 'utf8'), /permissionDecision/);
    assert.match(await readFile(path.join(root, '.github/hooks/session-checkpoint.sh'), 'utf8'), /checkpoint/);
  } finally {
    await removeHarnessFixture(root);
  }
});
```

- [ ] **Step 3: 跑 adapter regression tests**

Run:

```bash
node --test tests/adapters/hook-projection.test.mjs tests/adapters/sync-hooks.test.mjs
```

Expected:
- Copilot planning/superpowers 既有测试继续通过
- Copilot safety projection / sync 新增测试通过

## Task 4: 做聚焦验证并执行手工 smoke

**Files:**
- No code changes expected in this task

- [ ] **Step 1: 跑全部聚焦自动化验证**

Run:

```bash
node --test \
  tests/hooks/pretool-guard.test.mjs \
  tests/adapters/hook-projection.test.mjs \
  tests/adapters/sync-hooks.test.mjs
```

Expected:
- 全部通过

- [ ] **Step 2: 跑一次 Harness doctor / hook projection 健康检查**

在临时 fixture 或 sacrificial worktree 中执行：

```bash
./scripts/harness install --targets=copilot --scope=workspace --profile=safety --hooks=on
./scripts/harness sync
./scripts/harness doctor --check-only
```

Expected:
- `Harness check passed.`
- `Safety checks:` 下所有项目为 `ok`

- [ ] **Step 3: 做真实 Copilot workspace safety smoke**

在 sacrificial worktree 中：

1. 启用本仓库 `workspace` Copilot safety。
2. 让 Copilot 执行一个只读动作：例如读取 `README.md` 或搜索 `pretool-guard`。
   - Expected: 不再出现 `Hook PreToolUse aborted`。
3. 让 Copilot 触发一个安全白名单 shell 命令，例如 `git status`。
   - Expected: 允许执行。
4. 在没有风险评估的前提下，让 Copilot 触发危险命令，例如 `rm -rf ./DerivedData`。
   - Expected: 返回 `ask`，而不是 `allow` 或 abort。

- [ ] **Step 4: 若 smoke 失败，按以下顺序回滚并记录**

1. 记录失败 payload / 命令 / decision 或 abort 现象到 `planning/active/copilot-pretool-guard-regression-fix/progress.md`
2. 保留自动化测试改动，不强推 runtime 行为修复
3. 恢复仓库到 `user-global` authoritative state：

```bash
./scripts/harness install --scope=user-global --targets=all --projection=link --hooks=on
./scripts/harness sync
./scripts/harness doctor --check-only
```

## Regression Matrix

| Layer | Scenario | Expected |
| --- | --- | --- |
| Runtime | malformed Copilot stdin | 不 abort；输出 `allow` 或 `ask` JSON |
| Runtime | wrapped JSON stdin | 成功提取 JSON 并正常判定 |
| Runtime | raw dangerous command fallback | 仍走 `ask/deny`，不误放行 |
| Runtime | existing Codex `git status` | 继续 `allow` |
| Runtime | existing Codex dangerous command without RA/upstream | 继续 `ask` |
| Projection | Copilot + `policyProfile=safety` | 生成 `.github/hooks/safety.json` |
| Sync | Copilot workspace safety install | 写出 `pretool-guard.sh` / `session-checkpoint.sh` |
| Manual smoke | Copilot read-only/search tools | 不再出现 `Hook PreToolUse aborted` |

## Spec Coverage Self-Review

### Requirement coverage
- 修复方案：已覆盖 `pretool-guard.sh` runtime 设计。
- 详细回归测试：已覆盖 runtime / projection / sync / smoke 四层。
- 验证步骤：已写明自动化命令、doctor、手工 smoke、回退步骤。
- 本轮不动代码：本 companion plan 只用于后续执行，不代表当前已经改实现。

### Placeholder scan
- 无 `TBD` / `TODO` / “later” 占位语句。
- 所有测试任务都给出了明确文件、命令、预期结果。

### Type / name consistency
- runtime fix 文件统一为 `harness/core/hooks/safety/scripts/pretool-guard.sh`
- projection test 文件统一为 `tests/adapters/hook-projection.test.mjs`
- sync test 文件统一为 `tests/adapters/sync-hooks.test.mjs`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-28-copilot-pretool-guard-regression-fix-plan.md`.

执行时建议优先选择 `subagent-driven-development`，因为这次修复天然分成 runtime 脚本、adapter 测试、手工 smoke 三个可审查面；但也可以在当前会话里按本计划 inline 执行。