# Harness 复杂任务编排改造计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans only for the planning pass in this task. Durable state must stay in this Planning with Files directory, not in `docs/superpowers/plans/`. Execute normally after the plan is written unless a later phase becomes ambiguous or complex enough to justify another temporary Superpowers pass.

**Goal:** 把复杂多需求任务的编排模式固化进 HarnessTemplate，并保证 Codex、GitHub Copilot、Cursor、Claude Code 渲染出的入口规则都能识别并执行同一套约束。

**Architecture:** `harness/core/policy/base.md` 是长期规则真源，四个平台模板只投影同一份核心规则。README 与维护文档解释使用方式，测试通过渲染全部平台入口来防止跨 IDE 漏规则。

**Tech Stack:** Node.js `node:test`, Markdown policy files, Handlebars-style template rendering, Harness installer adapter rendering.

---

## Current State
Status: closed
Archive Eligible: yes
Close Reason: 已将复杂任务编排规则固化进核心 policy，更新用户与维护文档，并通过跨 IDE 渲染测试和完整仓库验证。

## Scope

- In scope:
  - 将复杂任务 orchestration 写入核心 policy。
  - 明确 Planning with Files、Superpowers、subagents、worktree/branch、主 agent 验收之间的从属关系。
  - 更新 README / maintenance docs，让用户知道如何执行这套模式。
  - 增加测试，验证 Codex、Copilot、Cursor、Claude Code 渲染入口都包含关键编排规则。
- Out of scope:
  - 不实现新的自动调度器。
  - 不接入 skill filesystem projection 到 `sync`。
  - 不改 vendored upstream Superpowers 或 planning-with-files 源码。
  - 不创建长期 `docs/superpowers/plans` 文件。

## File Structure

- Modify: `harness/core/policy/base.md`
  - 负责长期、跨平台、平台中立的复杂任务编排规则。
- Modify: `README.md`
  - 负责面向用户解释推荐流程与跨 IDE 保证。
- Modify: `docs/maintenance.md`
  - 负责维护者视角的政策更新、渲染、验证顺序。
- Modify: `tests/adapters/templates.test.mjs`
  - 负责验证四个平台渲染入口都包含复杂任务编排规则。
- Modify: `planning/active/harness-complex-orchestration/findings.md`
  - 记录发现、设计决策与验证结论。
- Modify: `planning/active/harness-complex-orchestration/progress.md`
  - 记录执行进度、命令结果与失败尝试。

## Phases

### Phase 1: Baseline and Plan

- [x] 读取现有 active planning tasks，确认不复用已关闭任务。
- [x] 读取核心 policy、README、maintenance docs、adapter rendering tests。
- [x] 写入本任务的 Planning with Files 三份文件。

### Phase 2: Core Policy Orchestration

- [x] **Step 1: Update `harness/core/policy/base.md`**

Add a platform-neutral section named `## Complex Task Orchestration` after the Planning-With-Files lifecycle section. It must state:

```md
## Complex Task Orchestration

For broad or mixed requests, use this order:

1. Create or reuse one task-scoped `planning/active/<task-id>/` directory.
2. Group the request into phases with explicit dependencies and finishing criteria.
3. Decide whether worktree or branch isolation is needed before implementation.
4. Use Superpowers only for the phase that needs deeper reasoning, then sync durable decisions back to Planning with Files.
5. Assign subagents only to independent scopes with clear file ownership, constraints, verification commands, and return format.
6. Let the main agent review, integrate, verify, and update Planning with Files.

Planning with Files is the source of truth. Superpowers can generate temporary construction plans, but it must not own durable task memory.
Git worktrees and branches provide isolation. Superpowers may describe how to use them, but it does not replace version control.
```

Also add a short `## Cross-IDE Portability` section that says agents must not rely on hooks, implicit skill discovery, or Codex-only configuration, because all supported IDEs consume rendered entry files differently.

- [x] **Step 2: Review the same edited block**

Run:

```bash
sed -n '1,240p' harness/core/policy/base.md
```

Expected: the new sections are platform neutral, contain no personal absolute paths, and do not ask the user for implementation permission.

### Phase 3: Docs Update

- [x] **Step 1: Update `README.md`**

Add a concise section after `## Workflow` named `## Complex Request Mode`. It must summarize:

```md
Planning with Files master orchestration
→ worktree/branch isolation when risk or parallelism requires it
→ per-phase Superpowers reasoning only when justified
→ scoped subagent execution
→ main-agent review and verification
→ sync back to Planning with Files
```

It must also state that rendered entry files carry this mode into Codex, Copilot, Cursor, and Claude Code.

- [x] **Step 2: Update `docs/maintenance.md`**

Add a maintenance checklist for policy changes:

```md
When changing orchestration policy:

1. Update `harness/core/policy/base.md` first.
2. Keep platform overrides limited to platform-specific caveats.
3. Run adapter rendering tests to confirm every supported target receives the rule.
4. Run repository verification before reporting completion.
```

### Phase 4: Cross-IDE Rendering Tests

- [x] **Step 1: Add adapter rendering coverage**

Modify `tests/adapters/templates.test.mjs` with a test that loops over:

```js
const targets = ['codex', 'copilot', 'cursor', 'claude-code'];
```

For each rendered target, assert it includes:

```js
/Complex Task Orchestration/
/Planning with Files is the source of truth/
/Git worktrees and branches provide isolation/
/Cross-IDE Portability/
```

- [x] **Step 2: Run the focused adapter test**

Run:

```bash
node --test tests/adapters/templates.test.mjs
```

Expected: all adapter template tests pass.

### Phase 5: Verification and Sync-Back

- [x] **Step 1: Run formatting whitespace check**

Run:

```bash
git diff --check -- harness/core/policy/base.md README.md docs/maintenance.md tests/adapters/templates.test.mjs planning/active/harness-complex-orchestration
```

Expected: no whitespace errors.

- [x] **Step 2: Run full repository verification**

Run:

```bash
npm run verify
```

Expected: all repo-scoped tests pass.

- [x] **Step 3: Update Planning with Files**

Update:

- `task_plan.md`: mark phases complete and close lifecycle after final verification.
- `findings.md`: record durable decisions and verification result.
- `progress.md`: record commands and pass/fail results.

## Decisions

- 本任务会复用现有 Core + Adapters 架构，不引入新系统。
- 跨 IDE 保证通过核心 policy 投影和 adapter rendering tests 实现，而不是依赖某个 IDE 的 hooks 或隐式 skill discovery。
- worktree/branch 是版本管理隔离层；Superpowers 只提供推理和流程说明，不能替代 Git 隔离。
- 子 agent 规则写入 policy，但本次执行不强制启动子 agent；当前改动范围小、文件边界清晰，主 agent 可直接完成。

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| `fd` command not found | 1 | 按仓库工具降级规则使用 `rg --files`。 |
