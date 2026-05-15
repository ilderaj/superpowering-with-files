# Alma Thin Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Alma support as a removable, plugin-like target layer that can be enabled or deleted without contaminating the existing harness architecture or changing behavior for current supported targets.

**Architecture:** Introduce Alma as an isolated adapter package with metadata, template, and platform override kept in target-scoped files only. Keep the installer changes minimal and generic: only register Alma in platform metadata/path resolution, while deferring hooks and risky write flows so the first version remains cleanly removable.

**Tech Stack:** Node.js ESM, existing harness installer/adapters architecture, JSON metadata, Handlebars templates, existing test suite

---

## File Structure

### New files
- `harness/adapters/alma/manifest.json`
- `harness/core/templates/ALMA.md.hbs` *(or `.alma/instructions.md.hbs` if that becomes the chosen entry target)*
- `harness/core/policy/platform-overrides/alma.md`
- `docs/install/alma.md`
- `tests/installer/alma-adapter.test.mjs`
- `tests/installer/alma-paths.test.mjs`

### Modified files
- `harness/core/metadata/platforms.json`
- `harness/installer/lib/paths.mjs`
- `docs/install/platform-support.md`
- `tests/installer/metadata.test.mjs`
- `tests/installer/paths.test.mjs`
- `tests/installer/commands.test.mjs`

### Deferred on purpose
- `harness/installer/lib/hook-projection.mjs`
- `harness/core/hooks/**`
- `harness/core/skills/index.json`
- `harness/mcp/**`

These are intentionally out of scope for v1 so the Alma layer remains thin and removable.

## Approach Options

### Option A — Thin adapter only *(recommended)*
Add only:
- target metadata
- path resolution
- adapter manifest
- Alma-specific template + override
- docs + tests

**Pros:**
- cleanest removable shape
- minimal risk to existing targets
- smallest code surface
- preserves original architecture cleanliness

**Cons:**
- v1 solves native target recognition and entry projection only
- does not provide hook parity, MCP full parity, or deep skill integration

### Option B — Adapter + skills projection
Build on Option A and also patch `harness/core/skills/index.json` for Alma skill projection.

**Pros:**
- closer to operational parity
- better path toward real usage

**Cons:**
- raises coupling
- reduces removability
- increases risk of path/patch drift

### Option C — Full platform parity
Implement adapter, skills, hooks, and richer MCP integration together.

**Pros:**
- most complete feature set

**Cons:**
- directly conflicts with the goal of a thin removable plugin
- highest implementation and maintenance risk
- most likely to pollute the current clean target model

### Recommendation
Choose **Option A** for P0.

The first Alma version should be a thin, isolated target that:
- can be recognized by install/sync
- can render an Alma entry artifact
- can support global use without modifying other target behavior
- does not attempt hook parity
- does not attempt risky write integration
- does not require deep skill patching on day one

## Design Notes

### 1. Plugin Boundary
Keep Alma-specific behavior confined to:
- `harness/adapters/alma/**`
- `harness/core/templates/ALMA.md.hbs`
- `harness/core/policy/platform-overrides/alma.md`
- `docs/install/alma.md`
- a narrow Alma stanza in `harness/core/metadata/platforms.json`
- a narrow Alma root mapping in `harness/installer/lib/paths.mjs`
- Alma-specific tests only

Do not scatter Alma logic across runtime, hooks, or generic sync branching unless tests prove it is unavoidable.

### 2. Entry File Strategy
To preserve removability, prefer an Alma-local entry artifact over a shared generic file.

Candidate paths:
- workspace: `.alma/instructions.md`
- global: `~/.alma/instructions/harness.instructions.md`

Alternative:
- workspace: `ALMA.md`
- global: `~/.alma/ALMA.md`

Preferred direction: **`.alma/...`** because it is more self-contained and easier to remove cleanly.

### 3. Hooks Are Explicitly Deferred
Do not modify `harness/installer/lib/hook-projection.mjs` in P0.

The first version must:
- support entry projection only
- avoid generating hook config
- avoid copying hook scripts
- treat Alma hooks as unsupported / deferred

### 4. Skills Are Deferred to P1 Unless Forced by Sync Semantics
The current `sync` pipeline plans skill projections for every enabled target. That means a true installer-managed Alma target may eventually require minimal `skills/index.json` support.

For P0, keep the design assumption narrow:
- no Alma-specific skill patches
- no Alma-specific hook config
- no promise of full projected skill parity

If tests show the target cannot pass install/sync safely without skill metadata, add the smallest possible Alma entries in a separate P1.

## Tasks

### Task 1: Define Alma adapter scope and non-goals

**Files:**
- Modify: `docs/install/platform-support.md`
- Create: `docs/install/alma.md`

- [ ] **Step 1: Write the failing documentation expectation**

Add a checklist for the user-visible contract:
- Alma is installer-managed only as a thin adapter target
- Alma v1 does not support hooks
- Alma v1 does not promise full skill parity
- Alma support is removable without affecting other targets

- [ ] **Step 2: Draft the Alma support contract**

Document:
- supported scope
- no hooks in v1
- no special MCP write integration in v1
- removal path for deleting the Alma layer

- [ ] **Step 3: Define the deletion test**

The docs must state that removal requires only:
- deleting `harness/adapters/alma/**`
- removing `alma` from `platforms.json`
- removing Alma mapping from `paths.mjs`
- deleting Alma template/override/docs/tests

- [ ] **Step 4: Review docs for the plugin guarantee**

Check that docs do not imply:
- Alma is mandatory
- Alma changes current targets
- Alma introduces shared hook state

- [ ] **Step 5: Commit**

```bash
git add docs/install/platform-support.md docs/install/alma.md
git commit -m "docs: define alma adapter scope and non-goals"
```

### Task 2: Register Alma as a supported thin target

**Files:**
- Modify: `harness/core/metadata/platforms.json`
- Test: `tests/installer/metadata.test.mjs`

- [ ] **Step 1: Write the failing metadata test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlatforms, normalizeTargets } from '../../harness/installer/lib/metadata.mjs';

test('metadata includes alma as supported target', async () => {
  const rootDir = process.cwd();
  const metadata = await loadPlatforms(rootDir);

  assert.equal(Boolean(metadata.platforms.alma), true);
  assert.equal(metadata.platforms.alma.supportsGlobal, true);
  assert.equal(metadata.platforms.alma.supportsWorkspace, true);
  assert.deepEqual(normalizeTargets(metadata, ['alma']), ['alma']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm test -- tests/installer/metadata.test.mjs
```

Expected:
- FAIL because Alma is not yet registered

- [ ] **Step 3: Add minimal Alma metadata**

Add only:
- `displayName`
- `entryFiles` or `entryFilesByScope`
- `skillRoots`
- `hookRoots`
- `supportsGlobal: true`
- `supportsWorkspace: true`
- `skillsStrategy: "materialize-preferred"`

Constraint:
- do not modify existing targets

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm test -- tests/installer/metadata.test.mjs
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add harness/core/metadata/platforms.json tests/installer/metadata.test.mjs
git commit -m "feat: register alma as thin supported target"
```

### Task 3: Add Alma path resolution without touching existing semantics

**Files:**
- Modify: `harness/installer/lib/paths.mjs`
- Modify: `tests/installer/paths.test.mjs`
- Create: `tests/installer/alma-paths.test.mjs`

- [ ] **Step 1: Write the failing Alma path test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  resolveTargetPaths,
  resolveSkillRoots,
  resolveHookRoots
} from '../../harness/installer/lib/paths.mjs';

test('alma target paths resolve for workspace and global scopes', () => {
  const rootDir = '/repo';
  const homeDir = '/home/user';

  assert.deepEqual(resolveTargetPaths(rootDir, homeDir, 'workspace', 'alma'), [
    path.join(rootDir, '.alma', 'instructions.md')
  ]);

  assert.deepEqual(resolveTargetPaths(rootDir, homeDir, 'user-global', 'alma'), [
    path.join(homeDir, '.alma', 'instructions', 'harness.instructions.md')
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm test -- tests/installer/paths.test.mjs
```

Expected:
- FAIL with `Unknown target: alma`

- [ ] **Step 3: Add Alma roots in `paths.mjs`**

Add only the minimal `targetRoots.alma` mapping needed for:
- workspace entry projection
- user-global entry projection
- optional Alma-local skill/hook roots

Constraints:
- no target-specific branching beyond the mapping
- no semantic changes for other targets

- [ ] **Step 4: Run tests to verify all path behavior passes**

Run:
```bash
npm test -- tests/installer/paths.test.mjs tests/installer/alma-paths.test.mjs
```

Expected:
- PASS for Alma and all existing targets

- [ ] **Step 5: Commit**

```bash
git add harness/installer/lib/paths.mjs tests/installer/paths.test.mjs tests/installer/alma-paths.test.mjs
git commit -m "feat: add alma path resolution"
```

### Task 4: Introduce an isolated Alma adapter manifest

**Files:**
- Create: `harness/adapters/alma/manifest.json`
- Test: `tests/installer/alma-adapter.test.mjs`

- [ ] **Step 1: Write the failing adapter-load test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAdapter } from '../../harness/installer/lib/adapters.mjs';

test('loadAdapter loads alma manifest', async () => {
  const adapter = await loadAdapter(process.cwd(), 'alma');

  assert.equal(adapter.target, 'alma');
  assert.equal(typeof adapter.template, 'string');
  assert.equal(typeof adapter.override, 'string');
  assert.ok(Array.isArray(adapter.workspaceEntries));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm test -- tests/installer/alma-adapter.test.mjs
```

Expected:
- FAIL because the manifest does not exist yet

- [ ] **Step 3: Create the Alma manifest**

Define only:
- `target: "alma"`
- `template`
- `override`
- workspace/global entries
- skill declarations only if required by adapter conventions

Constraint:
- keep the manifest purely data-driven

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm test -- tests/installer/alma-adapter.test.mjs
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add harness/adapters/alma/manifest.json tests/installer/alma-adapter.test.mjs
git commit -m "feat: add alma adapter manifest"
```

### Task 5: Create an Alma-specific entry template and platform override

**Files:**
- Create: `harness/core/templates/ALMA.md.hbs`
- Create: `harness/core/policy/platform-overrides/alma.md`
- Modify: `tests/installer/alma-adapter.test.mjs`

- [ ] **Step 1: Write the failing render test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderEntry } from '../../harness/installer/lib/adapters.mjs';

test('renderEntry renders alma entry with platform override', async () => {
  const content = await renderEntry(process.cwd(), 'alma', ['always-on-core']);

  assert.match(content, /Harness Policy For Alma/);
  assert.match(content, /planning\/active\/<task-id>\//);
  assert.match(content, /Alma-specific notes/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm test -- tests/installer/alma-adapter.test.mjs
```

Expected:
- FAIL because template/override is missing

- [ ] **Step 3: Create the template and override**

Template requirements:
- mirror existing target templates structurally
- keep content thin
- avoid claiming unsupported hook/skill integration
- include explicit non-goal notes

Override requirements:
- explain Alma does not auto-consume `AGENTS.md` / `CLAUDE.md`
- explain Alma support is adapter-scoped and removable
- explain tracked tasks still use `planning/active/<task-id>/`

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm test -- tests/installer/alma-adapter.test.mjs
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add harness/core/templates/ALMA.md.hbs harness/core/policy/platform-overrides/alma.md tests/installer/alma-adapter.test.mjs
git commit -m "feat: add alma entry template and policy override"
```

### Task 6: Verify install/sync recognizes Alma without changing other targets

**Files:**
- Modify: `tests/installer/commands.test.mjs`

- [ ] **Step 1: Write the failing command-path test**

Add a test that checks:
- `install` accepts `--targets=alma`
- sync dry-run includes Alma entry projection
- non-Alma targets remain unchanged when Alma is not selected

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm test -- tests/installer/commands.test.mjs
```

Expected:
- FAIL because Alma is not yet valid end-to-end

- [ ] **Step 3: Make the minimum changes needed for installer recognition**

Allowed:
- reuse metadata/adapter/path mechanisms
- fix one small generic assumption if tests prove it blocks Alma

Not allowed:
- Alma-specific branching in sync/install unless unavoidable
- hook support in v1

- [ ] **Step 4: Run tests to verify it passes**

Run:
```bash
npm test -- tests/installer/commands.test.mjs tests/installer/metadata.test.mjs tests/installer/paths.test.mjs tests/installer/alma-adapter.test.mjs
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add tests/installer/commands.test.mjs
git commit -m "test: verify alma target install and sync flow"
```

### Task 7: Add documentation for safe removal

**Files:**
- Modify: `docs/install/platform-support.md`
- Create: `docs/install/alma.md`

- [ ] **Step 1: Write the removal checklist**

Document exact removal steps:
1. remove `alma` from `platforms.json`
2. remove Alma mapping from `paths.mjs`
3. delete `harness/adapters/alma/`
4. delete Alma template/override
5. delete Alma docs/tests

- [ ] **Step 2: Document runtime limitations**

State clearly:
- no Alma hook projection in v1
- no Alma-specific skill patching in v1
- no guarantee of Alma-native auto-consumption beyond projected entry artifact
- Alma support is optional

- [ ] **Step 3: Document the upgrade path**

Describe future phases:
- P1: skill projection compatibility
- P2: hooks
- P3: MCP full / richer integration

- [ ] **Step 4: Review docs for cleanliness**

Check that docs never imply:
- Alma is a core dependency
- other targets depend on Alma files
- Alma files are required when target is not selected

- [ ] **Step 5: Commit**

```bash
git add docs/install/platform-support.md docs/install/alma.md
git commit -m "docs: add alma usage and removal guide"
```

### Task 8: Optional P1 — add Alma skill projection compatibility

**Files:**
- Modify: `harness/core/skills/index.json`
- Modify: `tests/installer/alma-adapter.test.mjs`
- Modify: `tests/installer/commands.test.mjs`

- [ ] **Step 1: Write the failing skill projection test**

Add a test verifying Alma can plan skill projections without throwing.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm test -- tests/installer/alma-adapter.test.mjs tests/installer/commands.test.mjs
```

Expected:
- FAIL if `planSkillProjections()` cannot tolerate Alma cleanly

- [ ] **Step 3: Add minimal Alma entries to `skills/index.json`**

For each relevant skill:
- add `alma: "materialize"` only if tests require it
- avoid Alma-specific patches
- do not add hook config

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm test -- tests/installer/alma-adapter.test.mjs tests/installer/commands.test.mjs
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add harness/core/skills/index.json tests/installer/alma-adapter.test.mjs tests/installer/commands.test.mjs
git commit -m "feat: add minimal alma skill projection support"
```

## Review Focus

Before execution, review these three decisions:
1. Should P0 remain a thin adapter only, with no hooks and no deep skill parity?
2. Should the Alma entry path use `.alma/...` or a top-level `ALMA.md`?
3. Should Task 8 stay out of the first PR and remain a follow-up P1?

## Conclusion on the “true minimal version”

**Conclusion:** the true minimal version is **not enough by itself** to make Alma reliably use `planning-with-files` for all tracked tasks and `superpowers` for deep-reasoning tasks.

What the true minimal version *can* do:
- make Alma globally aware of harness state via MCP read-only
- let Alma inspect task summaries, doctor output, verify output, and sync dry-run state
- provide enough information for Alma to *follow* the intended workflow when explicitly instructed

What it *cannot* do by itself:
- force Alma to always classify tasks into quick / tracked / deep-reasoning using harness rules
- guarantee that all tracked tasks will create and maintain `planning/active/<task-id>/` automatically
- guarantee that only deep tasks invoke `superpowers`
- replace Alma’s own higher-priority system/tool/skill policies

So if the goal is:
- **“Alma can understand and often follow the harness workflow”** → true minimal version is enough
- **“Alma will robustly and consistently execute planning-with-files for all tracked tasks and superpowers only for deep tasks”** → true minimal version is **not enough**; you need at least an Alma-aware adapter/policy layer, and likely a small amount of skill integration after that

---

Plan complete and saved to `docs/superpowers/plans/2026-05-15-alma-thin-adapter-implementation-plan.md`.
