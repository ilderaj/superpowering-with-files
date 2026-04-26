# Harness Docs Verification And Release Implementation Plan

- Active task path: `planning/active/harness-template-foundation/`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 README、架构/安装/维护/发布文档、verification report 生成，以及本地 main/dev 和 GitHub template repo 发布流程。

**Architecture:** 文档说明用户路径和维护路径，verification 脚本把结构、投影、体验和维护检查沉淀为 Markdown + JSON 报告。GitHub 发布只在验证通过后执行。

**Tech Stack:** Markdown, Node.js built-in modules, Git, GitHub CLI.

---

## File Structure

- Create: `README.md`
- Create: `docs/architecture.md`
- Create: `docs/install/codex.md`
- Create: `docs/install/copilot.md`
- Create: `docs/install/cursor.md`
- Create: `docs/install/claude-code.md`
- Create: `docs/compatibility/copilot-planning-with-files.md`
- Create: `docs/compatibility/hooks.md`
- Create: `docs/maintenance.md`
- Create: `docs/release.md`
- Create: `harness/installer/commands/verify.mjs`
- Modify: `harness/installer/commands/harness.mjs`
- Create: `reports/verification/.gitkeep`

## Task 1: Write README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README**

Create `README.md`:

```markdown
# HarnessTemplate

HarnessTemplate is a reusable agent workflow template. It packages a shared policy for `planning-with-files`, optional `superpowers` reasoning, and platform projections for Codex, GitHub Copilot, Cursor, and Claude Code.

## What It Provides

- One platform-neutral Harness policy source.
- Workspace, user-global, and combined installation scopes.
- Adapter projections for Codex, Copilot, Cursor, and Claude Code.
- Vendored baselines for `superpowers` and `planning-with-files`.
- A CLI for install, sync, doctor, status, fetch, and update workflows.

## Quick Start

```bash
./scripts/harness install --scope=workspace --targets=all --projection=link
./scripts/harness sync
./scripts/harness doctor
```

## Installation Scopes

- `workspace`: install Harness projections into the current repository.
- `user-global`: install Harness projections into user-level agent locations.
- `both`: install user-level projections and current workspace projections.

`workspace` is the default. Use `both` when you want one user-level Harness and a project-level entrypoint.

## Supported Targets

- Codex
- GitHub Copilot
- Cursor
- Claude Code

The goal is consistent Harness behavior across supported targets, not identical low-level platform mechanics.

## Common Commands

```bash
./scripts/harness install
./scripts/harness sync
./scripts/harness doctor
./scripts/harness status
./scripts/harness fetch
./scripts/harness update
```

## Documentation

- [Architecture](docs/architecture.md)
- [Maintenance](docs/maintenance.md)
- [Release](docs/release.md)
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add project readme"
```

## Task 2: Write Architecture And Install Docs

**Files:**
- Create: `docs/architecture.md`
- Create: `docs/install/codex.md`
- Create: `docs/install/copilot.md`
- Create: `docs/install/cursor.md`
- Create: `docs/install/claude-code.md`

- [ ] **Step 1: Create docs directories**

Run:

```bash
mkdir -p docs/install
```

Expected:

```text
directory created
```

- [ ] **Step 2: Create architecture doc**

Create `docs/architecture.md`:

```markdown
# Architecture

HarnessTemplate uses four layers:

- `harness/core`: platform-neutral policy, skills metadata, templates, and schemas.
- `harness/adapters`: platform-specific projection manifests.
- `harness/installer`: CLI commands and projection logic.
- `harness/upstream`: vendored baselines and source metadata.

Core is the source of truth. Adapters translate core into platform-specific files. The installer manages state and projection.

Projection operations:

- `render`: generate entry files from templates.
- `link`: link compatible skills or directories.
- `materialize`: copy files when a platform needs a real local copy or patched content.
```

- [ ] **Step 3: Create Codex install doc**

Create `docs/install/codex.md`:

```markdown
# Codex Installation

Codex receives rendered `AGENTS.md` files.

Workspace scope writes:

```text
AGENTS.md
```

User-global scope writes:

```text
~/.codex/AGENTS.md
```

Skills prefer link projection when symlinks are available.
```

- [ ] **Step 4: Create Copilot install doc**

Create `docs/install/copilot.md`:

```markdown
# GitHub Copilot Installation

Copilot receives rendered `copilot-instructions.md` files.

Workspace scope writes:

```text
.copilot/copilot-instructions.md
```

User-global scope writes:

```text
~/.copilot/copilot-instructions.md
```

Copilot must not be assumed to read Codex global configuration. `planning-with-files` is materialized for Copilot when required.
```

- [ ] **Step 5: Create Cursor install doc**

Create `docs/install/cursor.md`:

```markdown
# Cursor Installation

Cursor receives rules and skill projections.

Workspace scope writes:

```text
.cursor/rules/harness.mdc
```

User-global scope writes:

```text
~/.cursor/rules/harness.mdc
```

Cursor uses both rules and skills when available.
```

- [ ] **Step 6: Create Claude Code install doc**

Create `docs/install/claude-code.md`:

```markdown
# Claude Code Installation

Claude Code receives rendered `CLAUDE.md` files.

Workspace scope writes:

```text
CLAUDE.md
```

User-global scope writes:

```text
~/.claude/CLAUDE.md
```

Hooks are optional and are not installed unless explicitly selected.
```

- [ ] **Step 7: Commit**

```bash
git add docs/architecture.md docs/install
git commit -m "docs: add architecture and install guides"
```

## Task 3: Write Compatibility And Maintenance Docs

**Files:**
- Create: `docs/compatibility/copilot-planning-with-files.md`
- Create: `docs/compatibility/hooks.md`
- Create: `docs/maintenance.md`
- Create: `docs/release.md`

- [ ] **Step 1: Create compatibility directory**

Run:

```bash
mkdir -p docs/compatibility
```

Expected:

```text
directory created
```

- [ ] **Step 2: Create Copilot compatibility doc**

Create `docs/compatibility/copilot-planning-with-files.md`:

```markdown
# Copilot Planning With Files Compatibility

Copilot receives a materialized `planning-with-files` copy because its skill loading and hook behavior can differ from Codex and Claude Code.

The materialized copy must preserve:

- task-scoped planning paths,
- `task_plan.md`, `findings.md`, and `progress.md`,
- restore-context guidance,
- sync-back behavior.

The materialized copy must avoid incompatible hook assumptions.
```

- [ ] **Step 3: Create hooks compatibility doc**

Create `docs/compatibility/hooks.md`:

```markdown
# Hooks Compatibility

HarnessTemplate does not force hooks during v1 installation.

Hooks can be powerful but invasive. They may mutate global IDE or agent behavior and differ across platforms. The default install renders policy and skill projections only.

Hook installation must be explicit.
```

- [ ] **Step 4: Create maintenance doc**

Create `docs/maintenance.md`:

```markdown
# Maintenance

Maintenance flow:

```bash
./scripts/harness status
./scripts/harness fetch
./scripts/harness update
./scripts/harness sync
./scripts/harness doctor
```

`fetch` retrieves upstream candidates. `update` applies accepted candidates. `sync` regenerates installed projections.

Before policy extraction, reread the current global policy source and compare it with `harness/core/policy/base.md`.
```

- [ ] **Step 5: Create release doc**

Create `docs/release.md`:

```markdown
# Release

Branches:

- `dev`: ongoing implementation and upstream updates.
- `main`: verified template baseline.

Release flow:

```bash
git switch dev
./scripts/harness doctor
npm test
git switch main
git merge --ff-only dev
git push origin main
```

Only promote to `main` after verification passes.
```

- [ ] **Step 6: Commit**

```bash
git add docs/compatibility docs/maintenance.md docs/release.md
git commit -m "docs: add maintenance and compatibility guides"
```

## Task 4: Add Verification Report Command

**Files:**
- Create: `harness/installer/commands/verify.mjs`
- Modify: `harness/installer/commands/harness.mjs`
- Create: `reports/verification/.gitkeep`

- [ ] **Step 1: Implement verify command**

Create `harness/installer/commands/verify.mjs`:

```js
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readState } from '../lib/state.mjs';

export async function verify() {
  const rootDir = process.cwd();
  const state = await readState(rootDir);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    checks: {
      stateReadable: true,
      selectedTargets: Object.keys(state.targets),
      scope: state.scope,
      projectionMode: state.projectionMode
    }
  };

  const dir = path.join(rootDir, 'reports/verification');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(dir, 'latest.md'), [
    '# Harness Verification Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Scope: ${report.checks.scope}`,
    `Projection mode: ${report.checks.projectionMode}`,
    `Targets: ${report.checks.selectedTargets.join(', ') || 'none'}`
  ].join('\n') + '\n');

  console.log('Verification report written to reports/verification/latest.md');
}
```

- [ ] **Step 2: Register verify command**

Modify `harness/installer/commands/harness.mjs`:

```js
import { verify } from './verify.mjs';
```

Add to `commands`:

```js
verify
```

Add to usage:

```text
  verify   Write verification reports
```

- [ ] **Step 3: Add report directory marker**

Run:

```bash
mkdir -p reports/verification
touch reports/verification/.gitkeep
```

Expected:

```text
directory marker created
```

- [ ] **Step 4: Run verify command**

Run:

```bash
./scripts/harness verify
```

Expected:

```text
Verification report written to reports/verification/latest.md
```

- [ ] **Step 5: Commit**

```bash
git add harness/installer/commands/verify.mjs harness/installer/commands/harness.mjs reports/verification/.gitkeep
git commit -m "feat: add verification report command"
```

## Task 5: Plan GitHub Repository Setup

**Files:**
- Modify: `docs/release.md`

- [ ] **Step 1: Add GitHub setup commands to release doc**

Append to `docs/release.md`:

```markdown
## GitHub Repository Setup

Create the GitHub repository with:

```bash
gh repo create HarnessTemplate --public --source=. --remote=origin --push
```

Create and push `dev`:

```bash
git switch -c dev
git push -u origin dev
git switch main
git push -u origin main
```

After repository creation, enable template repository behavior in GitHub repository settings.
```

- [ ] **Step 2: Commit**

```bash
git add docs/release.md
git commit -m "docs: add github repository setup"
```

## Self-Review

- Spec coverage: 覆盖 README、install docs、compatibility docs、maintenance docs、release docs、verification reports、GitHub setup guidance。
- Placeholder scan: passed; GitHub setup is documented commands and is not executed in plan review.
- Type consistency: verify report 使用 state 里的 `scope`、`projectionMode`、`targets`。

## Task Memory

- Authoritative task state: `planning/active/harness-template-foundation/`
