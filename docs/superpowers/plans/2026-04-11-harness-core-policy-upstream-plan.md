# Harness Core Policy And Upstream Implementation Plan

- Active task path: `planning/active/harness-template-foundation/`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 HarnessTemplate 的中立 core、全局 policy baseline、skill metadata 和 vendored upstream baseline。

**Architecture:** `harness/core/` 是唯一规则语义源，`harness/upstream/` 保存外部来源快照。policy 从执行时最新的 Codex global `AGENTS.md` 全量抽取，抽取后由 `harness/core/policy/base.md` 成为模板事实源。

**Tech Stack:** Markdown, JSON, Node.js built-in `node:test`, shell commands, Git.

---

## File Structure

- Create: `package.json` - defines Node test and verification scripts.
- Create: `tests/core/no-personal-paths.test.mjs` - scans committed template files for author-specific absolute paths.
- Create: `tests/core/skill-index.test.mjs` - validates `harness/core/skills/index.json`.
- Create: `harness/core/policy/base.md` - platform-neutral policy extracted from latest global Codex `AGENTS.md`.
- Create: `harness/core/policy/platform-overrides/codex.md` - Codex-specific notes.
- Create: `harness/core/policy/platform-overrides/copilot.md` - Copilot-specific notes.
- Create: `harness/core/policy/platform-overrides/cursor.md` - Cursor-specific notes.
- Create: `harness/core/policy/platform-overrides/claude-code.md` - Claude Code-specific notes.
- Create: `harness/core/policy/snippets/shell-token-guidance.md` - shell and token-saving policy fragment.
- Create: `harness/core/skills/index.json` - skill source and projection metadata.
- Create: `harness/core/skills/patches/copilot-planning-with-files.patch.md` - documents Copilot-specific planning skill patch.
- Create: `harness/core/metadata/platforms.json` - v1 platform and scope metadata.
- Create: `harness/core/state-schema/state.schema.json` - local state shape.
- Create: `harness/upstream/sources.json` - upstream source metadata.
- Create: `harness/upstream/superpowers/` - vendored superpowers baseline.
- Create: `harness/upstream/planning-with-files/` - vendored planning-with-files baseline.

## Task 1: Add Node Test Harness

**Files:**
- Create: `package.json`

- [ ] **Step 1: Write package script definitions**

Create `package.json` with:

```json
{
  "name": "harness-template",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "test:core": "node --test tests/core/*.test.mjs",
    "verify": "node --test"
  }
}
```

- [ ] **Step 2: Run test command before tests exist**

Run:

```bash
npm test
```

Expected:

```text
TAP version 13
1..0
```

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add node test harness"
```

## Task 2: Add Depersonalization Test

**Files:**
- Create: `tests/core/no-personal-paths.test.mjs`

- [ ] **Step 1: Write failing test**

Create `tests/core/no-personal-paths.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules']);
const scannedExtensions = new Set(['.md', '.json', '.mjs', '.js', '.sh']);
const authorUser = 'jared';
const forbidden = [
  `/Users/${authorUser}/`,
  `C:\\\\Users\\\\${authorUser}\\\\`,
  `/home/${authorUser}/`
];

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
      continue;
    }
    if (entry.isFile() && scannedExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

test('committed template files do not contain author-specific absolute paths', async () => {
  const files = await collectFiles(root);
  const offenders = [];

  for (const file of files) {
    const info = await stat(file);
    if (!info.isFile()) continue;
    const text = await readFile(file, 'utf8');
    for (const token of forbidden) {
      if (text.includes(token)) {
        offenders.push(`${path.relative(root, file)} contains ${token}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});
```

- [ ] **Step 2: Run test to verify current repository state**

Run:

```bash
npm run test:core
```

Expected if planning notes still contain local research paths:

```text
not ok
```

Expected if only template files are scanned and no author paths remain:

```text
ok
```

- [ ] **Step 3: If the test fails only because planning research files include source paths, narrow the scanner**

Replace:

```js
const ignoredDirs = new Set(['.git', 'node_modules']);
```

with:

```js
const ignoredDirs = new Set(['.git', 'node_modules', 'planning']);
```

Rationale: planning files preserve local research evidence; generated template files must remain depersonalized.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:core
```

Expected:

```text
ok
```

- [ ] **Step 5: Commit**

```bash
git add tests/core/no-personal-paths.test.mjs
git commit -m "test: guard against personal path leakage"
```

## Task 3: Extract Core Policy

**Files:**
- Create: `harness/core/policy/base.md`
- Create: `harness/core/policy/snippets/shell-token-guidance.md`

- [ ] **Step 1: Reread latest global policy before extraction**

Run:

```bash
sed -n '1,260p' "$HOME/.codex/AGENTS.md"
```

Expected:

```text
# Hybrid Workflow Policy
```

- [ ] **Step 2: Create core policy directory**

Run:

```bash
mkdir -p harness/core/policy/snippets
```

Expected:

```text
directory created
```

- [ ] **Step 3: Create `harness/core/policy/base.md`**

Write the latest global policy into `harness/core/policy/base.md`, then normalize it by replacing any local-machine phrasing with platform-neutral language. Preserve these sections:

```markdown
# Hybrid Workflow Policy

This project uses a hybrid workflow:

- `planning-with-files` is the persistent memory and planning system.
- `superpowers` is an optional, temporary reasoning tool.
- Persistent task state must live only in:
  - `planning/active/<task-id>/task_plan.md`
  - `planning/active/<task-id>/findings.md`
  - `planning/active/<task-id>/progress.md`
  - completed task state may move to `planning/archive/<timestamp>-<task-id>/`

## Default Behavior

- Do not invoke superpowers by default.
- Do not perform heavyweight workflow routing for simple tasks.
- Directly execute straightforward work.
- Keep the active task's three markdown files updated.
- Isolate concurrent work by task id instead of sharing one project-root planning file set.

## When Superpowers Is Allowed

Use superpowers only when:

- architecture is unclear
- requirements are ambiguous
- debugging is complex
- root cause is not obvious
- deep structured reasoning is explicitly requested

## Mandatory Sync-Back Rule

Whenever superpowers is used:

1. finish the reasoning pass
2. summarize durable decisions back into the active task files
3. return to normal low-cost execution mode
```

Continue the file with the remaining global hard constraints from the latest global policy:

```text
Core Behavioral Guidelines
Task Completion
Communication Guidelines
Development Guidelines
Code Comments
Tool Preferences
Subagents
Output Style
References
Compact Instructions
Shell/token-saving preferences
```

- [ ] **Step 4: Create shell snippet**

Create `harness/core/policy/snippets/shell-token-guidance.md`:

```markdown
# Shell And Token Guidance

Use output-compressing command wrappers for shell commands likely to produce medium or large output, especially Git operations, broad searches, large file reads, diffs, tests, builds, linters, logs, GitHub CLI, Docker, Kubernetes, curl, and JSON or log formatting.

Skip command wrappers for trivial commands or tiny targeted reads where compression adds overhead without saving context.
```

- [ ] **Step 5: Run depersonalization test**

Run:

```bash
npm run test:core
```

Expected:

```text
ok
```

- [ ] **Step 6: Commit**

```bash
git add harness/core/policy/base.md harness/core/policy/snippets/shell-token-guidance.md
git commit -m "feat: extract core harness policy"
```

## Task 4: Add Platform Overrides

**Files:**
- Create: `harness/core/policy/platform-overrides/codex.md`
- Create: `harness/core/policy/platform-overrides/copilot.md`
- Create: `harness/core/policy/platform-overrides/cursor.md`
- Create: `harness/core/policy/platform-overrides/claude-code.md`

- [ ] **Step 1: Create override directory**

Run:

```bash
mkdir -p harness/core/policy/platform-overrides
```

Expected:

```text
directory created
```

- [ ] **Step 2: Add Codex override**

Create `harness/core/policy/platform-overrides/codex.md`:

```markdown
# Codex Override

Codex can consume `AGENTS.md` as the primary instruction entrypoint.

Use rendered `AGENTS.md` files for both workspace and user-global scopes. Prefer symlinked skills when the target filesystem supports reliable symlinks.
```

- [ ] **Step 3: Add Copilot override**

Create `harness/core/policy/platform-overrides/copilot.md`:

```markdown
# Copilot Override

Copilot must not be assumed to read Codex global configuration or shared `.agents/skills` directories.

Render `copilot-instructions.md` for Copilot instruction entrypoints. Link compatible skills where possible, but materialize patched `planning-with-files` content because Copilot skill and hook behavior differs from Codex and Claude Code.
```

- [ ] **Step 4: Add Cursor override**

Create `harness/core/policy/platform-overrides/cursor.md`:

```markdown
# Cursor Override

Cursor should receive both rules and skills projections when possible.

Render Cursor-compatible `.mdc` rules from core policy and expose supported skills through Cursor-readable skill directories. Keep both projections derived from the same core source.
```

- [ ] **Step 5: Add Claude Code override**

Create `harness/core/policy/platform-overrides/claude-code.md`:

```markdown
# Claude Code Override

Claude Code can use `CLAUDE.md`, skills, plugins, and hooks.

Render a thin `CLAUDE.md` entry file and link compatible skills. Do not install or mutate hooks unless the user explicitly selects hook installation.
```

- [ ] **Step 6: Commit**

```bash
git add harness/core/policy/platform-overrides
git commit -m "feat: add platform policy overrides"
```

## Task 5: Add Core Metadata

**Files:**
- Create: `harness/core/metadata/platforms.json`
- Create: `harness/core/state-schema/state.schema.json`

- [ ] **Step 1: Create metadata directories**

Run:

```bash
mkdir -p harness/core/metadata harness/core/state-schema
```

Expected:

```text
directories created
```

- [ ] **Step 2: Create platform metadata**

Create `harness/core/metadata/platforms.json`:

```json
{
  "schemaVersion": 1,
  "defaultScope": "workspace",
  "supportedScopes": ["workspace", "user-global", "both"],
  "platforms": {
    "codex": {
      "displayName": "Codex",
      "entryFiles": ["AGENTS.md"],
      "supportsGlobal": true,
      "supportsWorkspace": true,
      "skillsStrategy": "link-preferred"
    },
    "copilot": {
      "displayName": "GitHub Copilot",
      "entryFiles": ["copilot-instructions.md"],
      "supportsGlobal": true,
      "supportsWorkspace": true,
      "skillsStrategy": "mixed"
    },
    "cursor": {
      "displayName": "Cursor",
      "entryFiles": [".cursor/rules/harness.mdc"],
      "supportsGlobal": true,
      "supportsWorkspace": true,
      "skillsStrategy": "mixed"
    },
    "claude-code": {
      "displayName": "Claude Code",
      "entryFiles": ["CLAUDE.md"],
      "supportsGlobal": true,
      "supportsWorkspace": true,
      "skillsStrategy": "link-preferred"
    }
  }
}
```

- [ ] **Step 3: Create state schema**

Create `harness/core/state-schema/state.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Harness local state",
  "type": "object",
  "required": ["schemaVersion", "scope", "targets", "projectionMode"],
  "properties": {
    "schemaVersion": { "type": "integer", "const": 1 },
    "scope": { "type": "string", "enum": ["workspace", "user-global", "both"] },
    "projectionMode": { "type": "string", "enum": ["link", "portable"] },
    "targets": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["enabled", "paths"],
        "properties": {
          "enabled": { "type": "boolean" },
          "paths": {
            "type": "array",
            "items": { "type": "string" }
          }
        }
      }
    },
    "upstream": { "type": "object" },
    "lastSync": { "type": "string" },
    "lastFetch": { "type": "string" },
    "lastUpdate": { "type": "string" }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add harness/core/metadata/platforms.json harness/core/state-schema/state.schema.json
git commit -m "feat: add harness metadata schema"
```

## Task 6: Add Skill Index And Upstream Metadata

**Files:**
- Create: `harness/core/skills/index.json`
- Create: `harness/core/skills/patches/copilot-planning-with-files.patch.md`
- Create: `harness/upstream/sources.json`
- Test: `tests/core/skill-index.test.mjs`

- [ ] **Step 1: Create directories**

Run:

```bash
mkdir -p harness/core/skills/patches harness/upstream
```

Expected:

```text
directories created
```

- [ ] **Step 2: Write skill index**

Create `harness/core/skills/index.json`:

```json
{
  "schemaVersion": 1,
  "skills": {
    "superpowers": {
      "source": "https://github.com/obra/superpowers",
      "baselinePath": "harness/upstream/superpowers/skills",
      "projection": {
        "default": "link",
        "copilot": "link",
        "cursor": "link",
        "codex": "link",
        "claude-code": "link"
      }
    },
    "planning-with-files": {
      "source": "local-initial-import",
      "baselinePath": "harness/upstream/planning-with-files",
      "projection": {
        "default": "link",
        "copilot": "materialize",
        "cursor": "link",
        "codex": "link",
        "claude-code": "link"
      },
      "patches": {
        "copilot": "harness/core/skills/patches/copilot-planning-with-files.patch.md"
      }
    }
  }
}
```

- [ ] **Step 3: Write Copilot patch note**

Create `harness/core/skills/patches/copilot-planning-with-files.patch.md`:

```markdown
# Copilot Planning With Files Patch

Copilot receives a materialized `planning-with-files` copy because Copilot skill loading and hook behavior differs from Codex and Claude Code.

Patch behavior:

- preserve the planning workflow body,
- remove or avoid incompatible hook assumptions,
- keep task-scoped planning paths unchanged,
- keep the skill name `planning-with-files`.
```

- [ ] **Step 4: Write upstream sources**

Create `harness/upstream/sources.json`:

```json
{
  "schemaVersion": 1,
  "sources": {
    "superpowers": {
      "type": "git",
      "url": "https://github.com/obra/superpowers",
      "path": "harness/upstream/superpowers"
    },
    "planning-with-files": {
      "type": "local-initial-import",
      "path": "harness/upstream/planning-with-files"
    }
  }
}
```

- [ ] **Step 5: Write skill index test**

Create `tests/core/skill-index.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('skill index defines required v1 skills and projections', async () => {
  const index = JSON.parse(await readFile('harness/core/skills/index.json', 'utf8'));

  assert.equal(index.schemaVersion, 1);
  assert.ok(index.skills.superpowers);
  assert.ok(index.skills['planning-with-files']);
  assert.equal(index.skills['planning-with-files'].projection.copilot, 'materialize');
  assert.equal(index.skills.superpowers.projection.codex, 'link');
});
```

- [ ] **Step 6: Run test**

Run:

```bash
npm run test:core
```

Expected:

```text
ok
```

- [ ] **Step 7: Commit**

```bash
git add harness/core/skills harness/upstream/sources.json tests/core/skill-index.test.mjs
git commit -m "feat: add skill source metadata"
```

## Task 7: Vendor Initial Skill Baselines

**Files:**
- Create: `harness/upstream/superpowers/`
- Create: `harness/upstream/planning-with-files/`

- [ ] **Step 1: Import superpowers baseline**

Run:

```bash
mkdir -p harness/upstream
rm -rf harness/upstream/superpowers
git clone --depth 1 https://github.com/obra/superpowers.git harness/upstream/superpowers
rm -rf harness/upstream/superpowers/.git
```

Expected:

```text
Cloning into 'harness/upstream/superpowers'
```

- [ ] **Step 2: Import local planning-with-files baseline**

Run:

```bash
rm -rf harness/upstream/planning-with-files
mkdir -p harness/upstream/planning-with-files
cp -R "$HOME/.agents/skills/planning-with-files/." harness/upstream/planning-with-files/
```

Expected:

```text
harness/upstream/planning-with-files/SKILL.md exists
```

- [ ] **Step 3: Verify required files**

Run:

```bash
test -f harness/upstream/superpowers/skills/brainstorming/SKILL.md
test -f harness/upstream/planning-with-files/SKILL.md
```

Expected:

```text
no output and exit code 0
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm run test:core
```

Expected:

```text
ok
```

- [ ] **Step 5: Commit**

```bash
git add harness/upstream
git commit -m "feat: vendor initial skill baselines"
```

## Self-Review

- Spec coverage: 覆盖 core policy、全局规则抽取、platform overrides、skills index、upstream baseline、depersonalization。
- Placeholder scan: passed; no placeholder markers remain.
- Type consistency: `scope`、`projectionMode`、`targets` 与后续 installer plan 的状态模型保持一致。

## Task Memory

- Authoritative task state: `planning/active/harness-template-foundation/`
