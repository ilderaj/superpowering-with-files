# Harness Adapters Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Codex、Copilot、Cursor、Claude Code 的 render/link/materialize 投影，使 core policy 能落地到 workspace、user-global、both 三种 scope。

**Architecture:** 每个平台 adapter 只定义投影规则和模板，不复制 policy 正文。`sync` 读取 state、metadata、templates 和 core policy 后生成目标文件；Copilot 的 `planning-with-files` 走 materialize 策略。

**Tech Stack:** Node.js built-in modules, Markdown templates, JSON adapter manifests, `node:test`.

---

## File Structure

- Create: `harness/core/templates/AGENTS.md.hbs`
- Create: `harness/core/templates/copilot-instructions.md.hbs`
- Create: `harness/core/templates/CLAUDE.md.hbs`
- Create: `harness/core/templates/cursor-rule.mdc.hbs`
- Create: `harness/adapters/codex/manifest.json`
- Create: `harness/adapters/copilot/manifest.json`
- Create: `harness/adapters/cursor/manifest.json`
- Create: `harness/adapters/claude-code/manifest.json`
- Create: `harness/installer/lib/adapters.mjs`
- Modify: `harness/installer/commands/sync.mjs`
- Test: `tests/adapters/templates.test.mjs`
- Test: `tests/adapters/sync.test.mjs`

## Task 1: Add Render Templates

**Files:**
- Create: `harness/core/templates/AGENTS.md.hbs`
- Create: `harness/core/templates/copilot-instructions.md.hbs`
- Create: `harness/core/templates/CLAUDE.md.hbs`
- Create: `harness/core/templates/cursor-rule.mdc.hbs`

- [ ] **Step 1: Create templates directory**

Run:

```bash
mkdir -p harness/core/templates
```

Expected:

```text
directory created
```

- [ ] **Step 2: Add Codex template**

Create `harness/core/templates/AGENTS.md.hbs`:

```markdown
# Harness Policy For Codex

{{basePolicy}}

## Codex Platform Notes

{{platformOverride}}
```

- [ ] **Step 3: Add Copilot template**

Create `harness/core/templates/copilot-instructions.md.hbs`:

```markdown
# Harness Policy For Copilot

Apply this global policy together with repository-local instructions.

{{basePolicy}}

## Copilot Platform Notes

{{platformOverride}}
```

- [ ] **Step 4: Add Claude Code template**

Create `harness/core/templates/CLAUDE.md.hbs`:

```markdown
# Harness Policy For Claude Code

{{basePolicy}}

## Claude Code Platform Notes

{{platformOverride}}
```

- [ ] **Step 5: Add Cursor rule template**

Create `harness/core/templates/cursor-rule.mdc.hbs`:

```markdown
---
description: Harness workflow policy
alwaysApply: true
---

# Harness Policy For Cursor

{{basePolicy}}

## Cursor Platform Notes

{{platformOverride}}
```

- [ ] **Step 6: Commit**

```bash
git add harness/core/templates
git commit -m "feat: add platform render templates"
```

## Task 2: Add Adapter Manifests

**Files:**
- Create: `harness/adapters/codex/manifest.json`
- Create: `harness/adapters/copilot/manifest.json`
- Create: `harness/adapters/cursor/manifest.json`
- Create: `harness/adapters/claude-code/manifest.json`

- [ ] **Step 1: Create adapter directories**

Run:

```bash
mkdir -p harness/adapters/codex harness/adapters/copilot harness/adapters/cursor harness/adapters/claude-code
```

Expected:

```text
directories created
```

- [ ] **Step 2: Create Codex manifest**

Create `harness/adapters/codex/manifest.json`:

```json
{
  "target": "codex",
  "template": "harness/core/templates/AGENTS.md.hbs",
  "override": "harness/core/policy/platform-overrides/codex.md",
  "workspaceEntries": ["AGENTS.md"],
  "globalEntries": [".codex/AGENTS.md"],
  "skills": {
    "superpowers": "link",
    "planning-with-files": "link"
  }
}
```

- [ ] **Step 3: Create Copilot manifest**

Create `harness/adapters/copilot/manifest.json`:

```json
{
  "target": "copilot",
  "template": "harness/core/templates/copilot-instructions.md.hbs",
  "override": "harness/core/policy/platform-overrides/copilot.md",
  "workspaceEntries": [".copilot/copilot-instructions.md"],
  "globalEntries": [".copilot/copilot-instructions.md"],
  "skills": {
    "superpowers": "link",
    "planning-with-files": "materialize"
  }
}
```

- [ ] **Step 4: Create Cursor manifest**

Create `harness/adapters/cursor/manifest.json`:

```json
{
  "target": "cursor",
  "template": "harness/core/templates/cursor-rule.mdc.hbs",
  "override": "harness/core/policy/platform-overrides/cursor.md",
  "workspaceEntries": [".cursor/rules/harness.mdc"],
  "globalEntries": [".cursor/rules/harness.mdc"],
  "skills": {
    "superpowers": "link",
    "planning-with-files": "link"
  }
}
```

- [ ] **Step 5: Create Claude Code manifest**

Create `harness/adapters/claude-code/manifest.json`:

```json
{
  "target": "claude-code",
  "template": "harness/core/templates/CLAUDE.md.hbs",
  "override": "harness/core/policy/platform-overrides/claude-code.md",
  "workspaceEntries": ["CLAUDE.md"],
  "globalEntries": [".claude/CLAUDE.md"],
  "skills": {
    "superpowers": "link",
    "planning-with-files": "link"
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add harness/adapters
git commit -m "feat: add adapter manifests"
```

## Task 3: Implement Adapter Loader And Template Rendering

**Files:**
- Create: `harness/installer/lib/adapters.mjs`
- Test: `tests/adapters/templates.test.mjs`

- [ ] **Step 1: Write failing test**

Create `tests/adapters/templates.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEntry } from '../../harness/installer/lib/adapters.mjs';

test('renderEntry combines base policy and platform override', async () => {
  const rendered = await renderEntry(process.cwd(), 'codex');
  assert.match(rendered, /# Harness Policy For Codex/);
  assert.match(rendered, /Hybrid Workflow Policy/);
  assert.match(rendered, /Codex Platform Notes/);
});
```

- [ ] **Step 2: Implement adapter loader**

Create `harness/installer/lib/adapters.mjs`:

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { renderTemplate } from './fs-ops.mjs';

export async function loadAdapter(rootDir, target) {
  const file = path.join(rootDir, 'harness/adapters', target, 'manifest.json');
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function renderEntry(rootDir, target) {
  const adapter = await loadAdapter(rootDir, target);
  const [template, basePolicy, platformOverride] = await Promise.all([
    readFile(path.join(rootDir, adapter.template), 'utf8'),
    readFile(path.join(rootDir, 'harness/core/policy/base.md'), 'utf8'),
    readFile(path.join(rootDir, adapter.override), 'utf8')
  ]);

  return renderTemplate(template, {
    basePolicy,
    platformOverride
  });
}

export function entriesForScope(rootDir, homeDir, adapter, scope) {
  const workspace = adapter.workspaceEntries.map((entry) => path.join(rootDir, entry));
  const global = adapter.globalEntries.map((entry) => path.join(homeDir, entry));

  if (scope === 'workspace') return workspace;
  if (scope === 'user-global') return global;
  return [...workspace, ...global];
}
```

- [ ] **Step 3: Run test**

Run:

```bash
node --test tests/adapters/templates.test.mjs
```

Expected:

```text
ok
```

- [ ] **Step 4: Commit**

```bash
git add harness/installer/lib/adapters.mjs tests/adapters/templates.test.mjs
git commit -m "feat: add adapter rendering"
```

## Task 4: Implement Sync Projection

**Files:**
- Modify: `harness/installer/commands/sync.mjs`
- Test: `tests/adapters/sync.test.mjs`

- [ ] **Step 1: Write failing test**

Create `tests/adapters/sync.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeState } from '../../harness/installer/lib/state.mjs';
import { sync } from '../../harness/installer/commands/sync.mjs';

test('sync renders codex workspace entry', async () => {
  const root = process.cwd();
  await writeState(root, {
    schemaVersion: 1,
    scope: 'workspace',
    projectionMode: 'link',
    targets: {
      codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
    },
    upstream: {}
  });

  await sync([]);
  const text = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(text, /Harness Policy For Codex/);
});
```

- [ ] **Step 2: Implement sync**

Replace `harness/installer/commands/sync.mjs` with:

```js
import os from 'node:os';
import { loadAdapter, renderEntry, entriesForScope } from '../lib/adapters.mjs';
import { writeRenderedFile } from '../lib/fs-ops.mjs';
import { readState } from '../lib/state.mjs';

export async function sync() {
  const rootDir = process.cwd();
  const homeDir = os.homedir();
  const state = await readState(rootDir);
  const targets = Object.keys(state.targets).filter((target) => state.targets[target].enabled);

  for (const target of targets) {
    const adapter = await loadAdapter(rootDir, target);
    const content = await renderEntry(rootDir, target);
    const entries = entriesForScope(rootDir, homeDir, adapter, state.scope);

    for (const entry of entries) {
      await writeRenderedFile(entry, content);
    }
  }

  console.log(`Synced ${targets.length} target(s): ${targets.join(', ')}`);
}
```

- [ ] **Step 3: Run sync test**

Run:

```bash
node --test tests/adapters/sync.test.mjs
```

Expected:

```text
ok
```

- [ ] **Step 4: Run sync twice to verify idempotence**

Run:

```bash
./scripts/harness sync
git diff -- AGENTS.md
./scripts/harness sync
git diff -- AGENTS.md
```

Expected:

```text
no diff after second sync
```

- [ ] **Step 5: Commit**

```bash
git add harness/installer/commands/sync.mjs tests/adapters/sync.test.mjs AGENTS.md
git commit -m "feat: render platform entries on sync"
```

## Task 5: Add Skill Projection Planning Contract

**Files:**
- Create: `harness/installer/lib/skill-projection.mjs`
- Test: `tests/adapters/skill-projection.test.mjs`

- [ ] **Step 1: Write failing test**

Create `tests/adapters/skill-projection.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectionForSkill } from '../../harness/installer/lib/skill-projection.mjs';

test('projectionForSkill returns Copilot materialize for planning-with-files', async () => {
  const result = await projectionForSkill(process.cwd(), 'planning-with-files', 'copilot');
  assert.equal(result.strategy, 'materialize');
  assert.match(result.source, /harness\/upstream\/planning-with-files/);
});

test('projectionForSkill returns link for Codex superpowers', async () => {
  const result = await projectionForSkill(process.cwd(), 'superpowers', 'codex');
  assert.equal(result.strategy, 'link');
  assert.match(result.source, /harness\/upstream\/superpowers\/skills/);
});
```

- [ ] **Step 2: Implement projection lookup**

Create `harness/installer/lib/skill-projection.mjs`:

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function projectionForSkill(rootDir, skillName, target) {
  const index = JSON.parse(await readFile(path.join(rootDir, 'harness/core/skills/index.json'), 'utf8'));
  const skill = index.skills[skillName];
  if (!skill) throw new Error(`Unknown skill: ${skillName}`);

  return {
    skillName,
    target,
    strategy: skill.projection[target] || skill.projection.default,
    source: path.join(rootDir, skill.baselinePath),
    patch: skill.patches ? skill.patches[target] : undefined
  };
}
```

- [ ] **Step 3: Run test**

Run:

```bash
node --test tests/adapters/skill-projection.test.mjs
```

Expected:

```text
ok
```

- [ ] **Step 4: Commit**

```bash
git add harness/installer/lib/skill-projection.mjs tests/adapters/skill-projection.test.mjs
git commit -m "feat: add skill projection lookup"
```

## Self-Review

- Spec coverage: 覆盖四个平台 adapter、template render、workspace/user-global/both scope、sync 幂等、skill projection 策略。
- Placeholder scan: passed; skill projection lookup is a tested contract.
- Type consistency: adapter `target`、state `scope`、skill projection `strategy` 与前序计划一致。

## Task Memory

- Authoritative task state: `planning/active/harness-template-foundation/`
