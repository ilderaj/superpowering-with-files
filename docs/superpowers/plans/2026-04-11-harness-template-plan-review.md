# Harness Template Plan Review Implementation Plan

- Active task path: `planning/active/harness-template-foundation/`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 HarnessTemplate spec 拆成可 review、可排序、可独立验证的实施计划集合。

**Architecture:** 本计划不直接执行实现，只定义计划拆分和执行顺序。实际实施被拆成 core/upstream、installer、adapters、docs/verification/release 四个计划，避免一个超大计划同时修改规则、CLI、投影和发布流程。

**Tech Stack:** Markdown plans, Node.js built-in runtime for later CLI/tests, Git/GitHub CLI for later release steps.

---

## Plan Set

本 spec 覆盖多个独立子系统，必须拆成多个实施计划。推荐执行顺序如下：

1. `2026-04-11-harness-core-policy-upstream-plan.md`
2. `2026-04-11-harness-installer-cli-plan.md`
3. `2026-04-11-harness-adapters-projection-plan.md`
4. `2026-04-11-harness-docs-verification-release-plan.md`

## Dependency Rules

- Core plan 先执行，因为后续 installer 和 adapters 都依赖 `harness/core/`、metadata、policy baseline 和 vendored skill baselines。
- Installer plan 第二执行，因为 adapters 需要复用 installer 的 render、state、filesystem 和 path 解析能力。
- Adapters plan 第三执行，因为它要把 core 和 installer 串起来，生成 Codex / Copilot / Cursor / Claude Code 投影。
- Docs/verification/release plan 最后执行，因为它要验证前三个计划产物，并补 README、maintenance、release 和 GitHub repo 流程。

## Review Checklist

- [ ] **Step 1: Review plan boundaries**

确认四个计划没有循环依赖。

Expected:

```text
core -> installer -> adapters -> docs/verification/release
```

- [ ] **Step 2: Review v1 scope**

确认 v1 覆盖：

```text
workspace scope
user-global scope
both scope
Codex
Copilot
Cursor
Claude Code
planning-with-files
superpowers
full global policy extraction
```

- [ ] **Step 3: Review deferred scope**

确认以下内容不阻塞第一个可用版本：

```text
fetch implementation
update implementation
automation implementation
non-v1 IDE support
forced hook installation
```

- [ ] **Step 4: Decide review outcome**

如果计划拆分合理，进入第一个实施计划 review。不要开始实现代码，直到用户明确选择执行方式。

Expected:

```text
Plan review approved before implementation.
```

## Self-Review

- Spec coverage: 本 review 文件覆盖计划拆分和执行顺序；具体 spec 实现由四个子计划覆盖。
- Placeholder scan: passed; no placeholder markers remain.
- Type consistency: 本文件不定义代码类型。

## Task Memory

- Authoritative task state: `planning/active/harness-template-foundation/`
