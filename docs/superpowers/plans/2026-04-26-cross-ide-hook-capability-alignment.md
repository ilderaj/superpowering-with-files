# Cross-IDE Hook Capability Alignment Implementation Plan

> **Authoritative task memory:** `planning/active/cross-ide-hook-capability-alignment/`
>
> **Active task path:** `planning/active/cross-ide-hook-capability-alignment/`
>
> **Backlink:** see `planning/active/cross-ide-hook-capability-alignment/task_plan.md`, `planning/active/cross-ide-hook-capability-alignment/findings.md`, and `planning/active/cross-ide-hook-capability-alignment/progress.md`
>
> **Sync-back status:** executed on `2026-04-26`; durable decisions and verification results synced back to `planning/active/cross-ide-hook-capability-alignment/`.

Active task path: planning/active/cross-ide-hook-capability-alignment/

- Active task path: `planning/active/cross-ide-hook-capability-alignment/`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Harness 基于 2026-04 官方 upstream 文档，修正 Codex / GitHub Copilot / Cursor / Claude Code 的 hooks 事实与投影，使 session summary / planning-with-files / superpowers session-start 在四个目标上都有一致、可验证、文档正确的行为表达。

**Architecture:** 继续保留每个 IDE 的原生 hook adapter，把“可读取 Claude hooks”明确降级为兼容层而非 Copilot/Cursor 的主契约；先修 health/metadata 的事实模型，再修 Copilot 的 lifecycle 投影，再补 Copilot superpowers adapter，最后统一刷新安装文档与兼容矩阵。

**Tech Stack:** Node.js ESM, JSON hook configs, Bash hook scripts, `node:test`, existing Harness installer/health/sync pipeline.

---

## Recommended Approach

### Option A: Native-First Per-Target Adapters

- Copilot 继续使用 `.github/hooks/*.json` / `~/.copilot/hooks`。
- Cursor 继续使用 `.cursor/hooks.json` / `~/.cursor/hooks.json`。
- Claude Code 继续使用 `.claude/settings*.json`。
- 只把 Claude hooks 兼容读取记为次级能力。

**Recommendation:** 采用此方案。它最符合官方路径，避免 VS Code/ Cursor 同时加载原生与 Claude 配置导致重复执行，也避免 tool schema 不一致带来的行为漂移。

### Option B: Claude-Compatible Unification For Copilot And Cursor

- 让 Copilot / Cursor 主要依赖 `.claude/settings*.json`。
- 减少配置文件种类，但需要接受 matcher 忽略、tool-name 映射和 feature-flag 差异。

**Why not:** VS Code 官方已明确说明 Claude matcher 被忽略，tool names 与 input 字段也不同。对 Harness 这种需要稳定 hook 语义的项目，这不是好的主路径。

### Option C: Dual Projection Everywhere

- 同时投影 native hooks 与 Claude-compatible hooks，寄希望于平台自行合并。

**Why not:** 重复执行风险最高，健康检查和故障定位也会变复杂。

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `harness/installer/lib/health.mjs` | hook evidence level and health messages | Modify |
| `harness/installer/lib/hook-projection.mjs` | target → event mapping for projected planning hooks | Modify |
| `harness/core/skills/index.json` | declares which targets have hook adapters per skill | Modify |
| `harness/core/hooks/planning-with-files/copilot-hooks.json` | Copilot / VS Code planning-with-files hook config | Modify |
| `harness/core/hooks/superpowers/copilot-hooks.json` | Copilot / VS Code superpowers SessionStart hook config | Create |
| `tests/installer/health.test.mjs` | verifies health evidence and required events | Modify |
| `tests/adapters/sync-hooks.test.mjs` | verifies projected hook files/configs | Modify |
| `docs/install/copilot.md` | Copilot installation + hook contract | Modify |
| `docs/install/cursor.md` | Cursor installation + native/third-party hook facts | Modify |
| `docs/install/codex.md` | Codex installation + official hook doc facts | Modify |
| `docs/install/claude-code.md` | Claude installation + cross-IDE compatibility note | Modify |
| `docs/install/platform-support.md` | high-level support and prerequisites | Modify |
| `docs/compatibility/hooks.md` | cross-IDE hook support matrix | Modify |
| `docs/compatibility/copilot-planning-with-files.md` | Copilot-specific compatibility note about materialized skill + official hook assumptions | Modify |
| `docs/architecture.md` | authoritative architecture-level hook facts | Modify |

## Task 1: Reclassify Hook Evidence And Health Rules

**Files:**
- Modify: `harness/installer/lib/health.mjs`
- Modify: `tests/installer/health.test.mjs`

- [ ] **Step 1: Add a failing health test that removes Cursor’s provisional status**

Add/replace the Cursor evidence assertion block in `tests/installer/health.test.mjs` with:

```js
test('Cursor hooks are marked verified when official hook docs are recorded', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] }
      },
      upstream: {}
    });

    await mkdir(path.join(root, 'planning/active/compact-task'), { recursive: true });
    await writeFile(path.join(root, 'planning/active/compact-task/task_plan.md'), '# Compact Task\n\n## Current State\nStatus: active\nArchive Eligible: no\n');
    await writeFile(path.join(root, 'planning/active/compact-task/findings.md'), '# Findings\n');
    await writeFile(path.join(root, 'planning/active/compact-task/progress.md'), '# Progress\n');

    await withCwd(root, () => sync([]));
    const health = await readHarnessHealth(root, '/home/user');
    const planning = health.targets.cursor.hooks.find((hook) => hook.parentSkillName === 'planning-with-files');

    assert.equal(planning.status, 'ok');
    assert.equal(planning.evidenceLevel, 'verified');
    assert.equal(planning.message, undefined);
  } finally {
    await removeHarnessFixture(root);
  }
});
```

- [ ] **Step 2: Add a failing health test for Copilot’s required official stop/prompt events**

Append a Copilot-specific health test:

```js
test('readHarnessHealth reports missing official Copilot lifecycle events', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: { copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] } },
      upstream: {}
    });

    await mkdir(path.join(root, '.github/hooks'), { recursive: true });
    await mkdir(path.join(root, 'planning/active/compact-task'), { recursive: true });
    await writeFile(path.join(root, 'planning/active/compact-task/task_plan.md'), '# Compact Task\n\n## Current State\nStatus: active\nArchive Eligible: no\n');
    await writeFile(path.join(root, 'planning/active/compact-task/findings.md'), '# Findings\n');
    await writeFile(path.join(root, 'planning/active/compact-task/progress.md'), '# Progress\n');
    await writeFile(
      path.join(root, '.github/hooks/planning-with-files.json'),
      `${JSON.stringify({ version: 1, hooks: { sessionStart: [], preToolUse: [], postToolUse: [] } }, null, 2)}\n`
    );

    const health = await readHarnessHealth(root, '/home/user');
    const planning = health.targets.copilot.hooks.find((hook) => hook.parentSkillName === 'planning-with-files');

    assert.equal(planning.status, 'problem');
    assert.match(planning.message, /missing required event stop/i);
    assert.match(planning.message, /userPromptSubmit/i);
  } finally {
    await removeHarnessFixture(root);
  }
});
```

- [ ] **Step 3: Run the health suite and confirm it fails before the implementation**

Run:

```bash
node --test tests/installer/health.test.mjs
```

Expected: FAIL because Cursor is still hard-coded as provisional and Copilot’s required event list still reflects the old schema.

- [ ] **Step 4: Replace the hard-coded evidence rule with an explicit verified-target map**

Update `harness/installer/lib/health.mjs`:

```js
const HOOK_EVIDENCE_BY_TARGET = {
  codex: { evidenceLevel: 'verified' },
  copilot: { evidenceLevel: 'verified' },
  cursor: { evidenceLevel: 'verified' },
  'claude-code': { evidenceLevel: 'verified' }
};

function hookEvidence(projection) {
  return (
    HOOK_EVIDENCE_BY_TARGET[projection.target] ?? {
      evidenceLevel: 'provisional',
      message: `Official hook documentation has not been verified for ${projection.target}.`
    }
  );
}
```

- [ ] **Step 5: Re-run the same health suite**

Run:

```bash
node --test tests/installer/health.test.mjs
```

Expected: PASS for the new Cursor evidence assertion; Copilot event failure should remain until Task 2 lands.

## Task 2: Align Copilot Planning Hooks With Official VS Code Lifecycle

**Files:**
- Modify: `harness/installer/lib/hook-projection.mjs`
- Modify: `harness/core/hooks/planning-with-files/copilot-hooks.json`
- Modify: `tests/adapters/sync-hooks.test.mjs`

- [ ] **Step 1: Add a failing sync test that codifies the new Copilot planning hook contract**

Append to `tests/adapters/sync-hooks.test.mjs`:

```js
test('sync installs copilot planning hooks aligned with the official VS Code lifecycle', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: { copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    const hooks = JSON.parse(await readFile(path.join(root, '.github/hooks/planning-with-files.json'), 'utf8'));

    assert.ok(hooks.hooks.sessionStart);
    assert.ok(hooks.hooks.userPromptSubmit);
    assert.ok(hooks.hooks.preToolUse);
    assert.ok(hooks.hooks.postToolUse);
    assert.ok(hooks.hooks.stop);
    assert.equal(hooks.hooks.agentStop, undefined);
    assert.equal(hooks.hooks.errorOccurred, undefined);
    assert.match(JSON.stringify(hooks), /Harness-managed planning-with-files hook/);
    assert.match(await readFile(path.join(root, '.github/hooks/task-scoped-hook.sh'), 'utf8'), /planning\/active/);
  } finally {
    await removeHarnessFixture(root);
  }
});
```

- [ ] **Step 2: Run the sync + health tests to capture the pre-change failure**

Run:

```bash
node --test tests/adapters/sync-hooks.test.mjs tests/installer/health.test.mjs
```

Expected: FAIL because the generated Copilot config still contains `agentStop` / `errorOccurred` and does not generate `userPromptSubmit` / `stop`.

- [ ] **Step 3: Update the Copilot event list in the projection planner**

Change the Copilot entry in `harness/installer/lib/hook-projection.mjs` to:

```js
const PLANNING_EVENTS_BY_TARGET = {
  codex: ['SessionStart', 'UserPromptSubmit', 'Stop'],
  copilot: ['sessionStart', 'userPromptSubmit', 'preToolUse', 'postToolUse', 'stop'],
  cursor: ['userPromptSubmit', 'preToolUse', 'postToolUse', 'stop'],
  'claude-code': ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']
};
```

- [ ] **Step 4: Replace the old Copilot hook template keys**

Update `harness/core/hooks/planning-with-files/copilot-hooks.json` so the `hooks` object becomes:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "bash": "sh -c '[ -f .github/hooks/task-scoped-hook.sh ] && bash .github/hooks/task-scoped-hook.sh copilot session-start || bash \"$HOME/.copilot/hooks/task-scoped-hook.sh\" copilot session-start'",
        "timeout": 15,
        "description": "Harness-managed planning-with-files hook"
      }
    ],
    "userPromptSubmit": [
      {
        "type": "command",
        "bash": "sh -c '[ -f .github/hooks/task-scoped-hook.sh ] && bash .github/hooks/task-scoped-hook.sh copilot user-prompt-submit || bash \"$HOME/.copilot/hooks/task-scoped-hook.sh\" copilot user-prompt-submit'",
        "timeout": 5,
        "description": "Harness-managed planning-with-files hook"
      }
    ],
    "preToolUse": [
      {
        "type": "command",
        "bash": "sh -c '[ -f .github/hooks/task-scoped-hook.sh ] && bash .github/hooks/task-scoped-hook.sh copilot pre-tool-use || bash \"$HOME/.copilot/hooks/task-scoped-hook.sh\" copilot pre-tool-use'",
        "timeout": 5,
        "description": "Harness-managed planning-with-files hook"
      }
    ],
    "postToolUse": [
      {
        "type": "command",
        "bash": "sh -c '[ -f .github/hooks/task-scoped-hook.sh ] && bash .github/hooks/task-scoped-hook.sh copilot post-tool-use || bash \"$HOME/.copilot/hooks/task-scoped-hook.sh\" copilot post-tool-use'",
        "timeout": 5,
        "description": "Harness-managed planning-with-files hook"
      }
    ],
    "stop": [
      {
        "type": "command",
        "bash": "sh -c '[ -f .github/hooks/task-scoped-hook.sh ] && bash .github/hooks/task-scoped-hook.sh copilot stop || bash \"$HOME/.copilot/hooks/task-scoped-hook.sh\" copilot stop'",
        "timeout": 10,
        "description": "Harness-managed planning-with-files hook"
      }
    }
  }
}
```

- [ ] **Step 5: Re-run targeted verification for planner + sync outputs**

Run:

```bash
node --test tests/adapters/sync-hooks.test.mjs tests/installer/health.test.mjs tests/hooks/task-scoped-hook.test.mjs
```

Expected: PASS. `tests/hooks/task-scoped-hook.test.mjs` should stay green because the runtime script already understands `user-prompt-submit` and `stop`.

## Task 3: Add Copilot Support For The Superpowers SessionStart Hook

**Files:**
- Create: `harness/core/hooks/superpowers/copilot-hooks.json`
- Modify: `harness/core/skills/index.json`
- Modify: `tests/adapters/sync-hooks.test.mjs`

- [ ] **Step 1: Add a failing sync test that expects a Copilot superpowers hook file**

Append to `tests/adapters/sync-hooks.test.mjs`:

```js
test('sync installs copilot superpowers hooks when hookMode is on', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: { copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] } },
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    const hooks = JSON.parse(await readFile(path.join(root, '.github/hooks/superpowers.json'), 'utf8'));
    assert.ok(hooks.hooks.sessionStart);
    assert.match(JSON.stringify(hooks), /Harness-managed superpowers hook/);

    const sessionStart = await readFile(path.join(root, '.github/hooks/session-start'), 'utf8');
    assert.match(sessionStart, /You have superpowers/);
    assert.match(sessionStart, /planning\/active\/<task-id>\//);
  } finally {
    await removeHarnessFixture(root);
  }
});
```

- [ ] **Step 2: Confirm the new test fails before adding the adapter**

Run:

```bash
node --test tests/adapters/sync-hooks.test.mjs
```

Expected: FAIL because `superpowers` currently has no Copilot hook projection.

- [ ] **Step 3: Create a native Copilot hook config for superpowers SessionStart**

Create `harness/core/hooks/superpowers/copilot-hooks.json` with:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "bash": "sh -c '[ -f .github/hooks/session-start ] && sh .github/hooks/session-start || sh \"$HOME/.copilot/hooks/session-start\"'",
        "timeout": 15,
        "description": "Harness-managed superpowers hook"
      }
    ]
  }
}
```

- [ ] **Step 4: Register the new adapter in `harness/core/skills/index.json`**

Add a `copilot` hook entry under `skills.superpowers.hooks`:

```json
"copilot": {
  "source": "harness/core/hooks/superpowers",
  "config": "copilot-hooks.json",
  "scriptRoot": "scripts",
  "scripts": ["session-start", "run-hook.cmd"],
  "events": ["sessionStart"]
}
```

- [ ] **Step 5: Re-run the sync suite**

Run:

```bash
node --test tests/adapters/sync-hooks.test.mjs
```

Expected: PASS, with `.github/hooks/superpowers.json` plus `.github/hooks/session-start` projected for Copilot.

## Task 4: Refresh Cross-IDE Documentation To Match Official Facts

**Files:**
- Modify: `docs/install/copilot.md`
- Modify: `docs/install/cursor.md`
- Modify: `docs/install/codex.md`
- Modify: `docs/install/claude-code.md`
- Modify: `docs/install/platform-support.md`
- Modify: `docs/compatibility/hooks.md`
- Modify: `docs/compatibility/copilot-planning-with-files.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Rewrite the Copilot install doc around native VS Code hooks and Claude compatibility caveats**

Update the hook section in `docs/install/copilot.md` so it says, in substance:

```md
Optional hooks:

```text
.github/hooks/planning-with-files.json
.github/hooks/superpowers.json
.github/hooks/task-scoped-hook.sh
.github/hooks/session-start
~/.copilot/hooks/planning-with-files.json
~/.copilot/hooks/superpowers.json
~/.copilot/hooks/task-scoped-hook.sh
~/.copilot/hooks/session-start
```

GitHub Copilot / VS Code Chat now has official preview hooks support. Harness uses
native Copilot hook files under `.github/hooks/*.json` and `~/.copilot/hooks` as the
primary contract. VS Code can also read Claude-format hooks from `.claude/settings*.json`,
but Harness treats that as compatibility only because VS Code ignores Claude matchers and
uses different tool names / input field names.
```

- [ ] **Step 2: Remove Cursor’s provisional wording and add the third-party Claude note**

Replace the provisional paragraph in `docs/install/cursor.md` with:

```md
Cursor receives the Harness planning-with-files task-scoped hook and the vendored
superpowers session-start hook when hooks are enabled. Cursor now has official native
hooks documentation for `.cursor/hooks.json` / `~/.cursor/hooks.json`, and official
third-party Claude hook compatibility. Harness keeps the native Cursor format as the
primary adapter; Claude-compatible loading is migration/compatibility behavior, not the
default projection path.
```

- [ ] **Step 3: Tighten Codex and Claude wording to match the newly verified sources**

Update `docs/install/codex.md` with:

```md
Codex hooks are officially documented and remain gated behind `codex_hooks = true` in
Codex `config.toml`. Codex can load hooks from `hooks.json` or inline `[hooks]` tables in
`config.toml` at both repo and user config layers.
```

Update `docs/install/claude-code.md` with:

```md
Claude Code remains the native owner of `.claude/settings*.json`. VS Code and Cursor can
read Claude-format hooks as a compatibility surface, but Harness treats these settings
files as the Claude Code contract and keeps other targets on their native hook adapters.
```

- [ ] **Step 4: Replace the compatibility and architecture matrices**

In `docs/compatibility/hooks.md`, replace the support matrix with:

```md
| Hook source | Codex | GitHub Copilot | Cursor | Claude Code |
| --- | --- | --- | --- | --- |
| `planning-with-files` task-scoped hook | Supported (`codex_hooks = true`) | Supported | Supported | Supported |
| `superpowers` session-start hook | Supported via Harness wrapper | Supported | Supported | Supported |
```

Then replace the explanatory paragraph with:

```md
Supported means Harness has an adapter whose path/schema contract is backed by official
platform documentation. Some targets still have prerequisites: Codex needs
`codex_hooks = true`; VS Code hooks are preview functionality and may be disabled by org
policy; Cursor's Claude-compatible path requires the Third-party skills feature.
```

In `docs/architecture.md`, replace the hook-facts rows with:

```md
| GitHub Copilot / VS Code | `.github/hooks/*.json`, `~/.copilot/hooks`, PascalCase hook events, Claude hook config compatibility, Copilot CLI lowerCamelCase compatibility | Harness chooses concrete hook filenames and keeps native Copilot hook files as the primary projection path. |
| Cursor | `.cursor/hooks.json`, `~/.cursor/hooks.json`, native agent hook events including `sessionStart`, `sessionEnd`, `preToolUse`, `postToolUse`, `stop`, plus official third-party Claude hook compatibility | Harness chooses concrete script filenames under `.cursor/hooks/*` and keeps the native Cursor format as the default adapter. |
```

- [ ] **Step 5: Add a short prerequisites note to `docs/install/platform-support.md`**

Append:

```md
Hook availability depends on target-specific prerequisites:

- Codex: requires `[features] codex_hooks = true`.
- GitHub Copilot / VS Code: hooks are preview functionality and may be disabled by org policy.
- Cursor: native hooks are official; Claude-compatible hooks additionally require the Third-party skills feature.
- Claude Code: hooks are native in `.claude/settings*.json`.
```

- [ ] **Step 6: Run doc-oriented verification plus the repo verify target**

Run:

```bash
rg "Provisional|unsupported for Copilot|official Cursor hook documentation has not been verified|agentStop|errorOccurred" docs/install docs/compatibility docs/architecture harness/core/hooks/planning-with-files/copilot-hooks.json harness/installer/lib/hook-projection.mjs
npm run verify
```

Expected:

- `rg` only finds intentional historical mentions outside the updated files, or no matches in the modified surfaces.
- `npm run verify` passes.

## Task 5: Final Verification And Handoff

**Files:**
- No new files; uses the outputs from Tasks 1-4.

- [ ] **Step 1: Run the focused executable validation set**

Run:

```bash
node --test tests/installer/health.test.mjs tests/adapters/sync-hooks.test.mjs tests/hooks/task-scoped-hook.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run the repo-wide verification target**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 3: Perform one live status check in the working repo**

Run:

```bash
./scripts/harness doctor --check-only
```

Expected: no hook-evidence mismatch about Cursor provisional status, no outdated Copilot hook-event warnings, and no new JSON merge/config errors.

- [ ] **Step 4: Sync back durable conclusions into task-scoped planning files**

Update the task files with:

```md
- Copilot planning hooks now align to VS Code official lifecycle (`sessionStart`, `userPromptSubmit`, `preToolUse`, `postToolUse`, `stop`).
- Copilot `superpowers` session-start hook is now supported through a native Copilot adapter.
- Cursor hook evidence level is upgraded from provisional to verified.
- Claude hook compatibility is documented as a secondary compatibility surface, not the primary Copilot/Cursor contract.
```

## Spec Coverage Check

- VS Code preview hooks + Claude compatibility: covered by Tasks 1, 2, and 4.
- Claude native semantics (`Stop` vs `SessionEnd`): covered by Tasks 1 and 4.
- Codex official docs refresh: covered by Task 4.
- Cursor provisional → verified and third-party note: covered by Tasks 1 and 4.
- session summary / planning-with-files reliability in Copilot: covered by Task 2.
- `superpowers` Copilot support: covered by Task 3.

## Placeholder Scan

- No `TODO` / `TBD` placeholders remain.
- Every file path listed above exists today except the planned new file `harness/core/hooks/superpowers/copilot-hooks.json`.
- Verification commands are concrete and scoped.
