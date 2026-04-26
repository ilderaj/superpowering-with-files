# Cross-IDE Single-Source Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate Harness onto a single authoring-source model by sharing the Codex/Copilot skill roots where official support overlaps, while keeping platform-native projection for instructions, hooks, and Claude/Cursor-specific discovery contracts.

**Architecture:** Keep `harness/core/policy/base.md` and vendored upstream skills as the only authored content sources. Change Copilot skill projection to reuse the same `.agents/skills` / `~/.agents/skills` roots as Codex, add projection coalescing so shared roots are written once, and generalize the Copilot `planning-with-files` patch so it works from the shared root without changing workflow semantics.

**Tech Stack:** Node.js ESM, `node:test`, JSON metadata, Markdown docs, Harness CLI state/projection manifest.

---

**Authoritative task memory:** `planning/active/cross-ide-single-source-consolidation/`

- Active task path: `planning/active/cross-ide-single-source-consolidation/`

**Companion plan:** `docs/superpowers/plans/2026-04-20-cross-ide-single-source-consolidation.md`

## Scope and Non-Goals

- Do change:
  - skill root metadata
  - Copilot-specific skill patching
  - sync planning/coalescing for shared skill targets
  - docs and platform-note wording that currently contradict official docs
- Do not change:
  - `harness/core/policy/base.md`
  - `harness/core/policy/entry-profiles.json`
  - hook event selection or hook merge semantics
  - the task-scoped planning workflow itself
  - Claude Code or Cursor skill root behavior in this pass

## File Map

- `harness/core/metadata/platforms.json`
  Controls entry file roots, skill roots, and hook roots per target. This is the source-of-truth for path resolution.
- `harness/core/policy/platform-overrides/copilot.md`
  Copilot-specific rendered instruction note. It currently contains the outdated “do not assume `.agents/skills`” statement.
- `harness/installer/lib/paths.mjs`
  Resolves entry, skill, and hook roots from platform metadata. It should change only through metadata expectations, not hardcoded target-specific branches.
- `harness/installer/lib/skill-projection.mjs`
  Expands skill metadata into per-target projection plans and patches. This is the right place to add projection coalescing helpers.
- `harness/installer/commands/sync.mjs`
  Applies entry/skill/hook projections and writes `.harness/projections.json`. Shared skill roots must be written once here.
- `harness/installer/lib/copilot-planning-patch.mjs`
  Rewrites `planning-with-files` so Copilot can resolve helper scripts. It currently assumes `.github/skills` and `~/.copilot/skills`.
- `README.md`
  Public projection map and install guidance.
- `docs/architecture.md`
  Source-of-truth architecture narrative. Must explain shared roots and unchanged hook/entry boundaries.
- `docs/install/copilot.md`
  Copilot install/runtime path docs.
- `docs/install/codex.md`
  Codex install/runtime path docs.
- `docs/compatibility/copilot-planning-with-files.md`
  Explains why `planning-with-files` is materialized and what runtime root it expects.
- `tests/installer/paths.test.mjs`
  Protects entry/skill/hook root resolution.
- `tests/adapters/skill-profile.test.mjs`
  Protects allow-listed profile routing into the expected root.
- `tests/adapters/skill-projection.test.mjs`
  Protects per-target skill paths and patch markers.
- `tests/adapters/sync-skills.test.mjs`
  Protects actual projected output, stale cleanup, and shared skill content.
- `tests/installer/health.test.mjs`
  Protects `readHarnessHealth` behavior and reported root health.
- `tests/adapters/templates.test.mjs`
  Protects rendered entry-file shape and thin-profile behavior.
- `tests/installer/policy-render.test.mjs`
  Protects profile rendering and avoids changing always-on sections by accident.
- `tests/adapters/hook-projection.test.mjs`
  Protects hook projection targets and config formats.
- `tests/adapters/sync-hooks.test.mjs`
  Protects hook merge/write behavior.
- `tests/installer/commands.test.mjs`
  Protects CLI semantics such as `--dry-run`, `--check`, and report generation.
- `tests/core/no-personal-paths.test.mjs`
  Protects against checking in author-specific absolute paths.

## Execution Preflight

- [ ] Run the Harness base-branch preflight:

```bash
./scripts/harness worktree-preflight
```

Expected: reports `Recommended base: dev` and `Base SHA: 5873831e48e5dacdd3081a448bf2bc9b82e2d263`.

- [ ] Create the implementation worktree from the reported base:

```bash
git worktree add "$HOME/.config/superpowers/worktrees/HarnessTemplate/codex-cross-ide-single-source-exec" -b codex/cross-ide-single-source-exec dev
```

Expected: a clean isolated worktree on `codex/cross-ide-single-source-exec`.

- [ ] In the new worktree, record the base in `planning/active/cross-ide-single-source-consolidation/progress.md`:

```md
Worktree base: dev @ 5873831e48e5dacdd3081a448bf2bc9b82e2d263
```

- [ ] Run the baseline verification suite before any edits:

```bash
npm run verify
```

Expected: all current tests pass before the migration starts.

### Task 1: Move Copilot Skill Roots to the Shared `.agents/skills` Paths

**Files:**
- Modify: `harness/core/metadata/platforms.json`
- Modify: `tests/installer/paths.test.mjs`
- Modify: `tests/adapters/skill-profile.test.mjs`
- Modify: `tests/adapters/skill-projection.test.mjs`

- [ ] **Step 1: Write the failing path and projection tests**

Update the Copilot expectations so the shared root is the only projected skill root:

```js
test('resolveSkillRoots returns workspace skill root for Copilot', () => {
  assert.deepEqual(resolveSkillRoots('/repo', '/home/user', 'workspace', 'copilot'), [
    '/repo/.agents/skills'
  ]);
});

test('resolveSkillRoots returns user-global skill root for Copilot', () => {
  assert.deepEqual(resolveSkillRoots('/repo', '/home/user', 'user-global', 'copilot'), [
    '/home/user/.agents/skills'
  ]);
});
```

Update the Copilot skill-projection target expectations:

```js
test('planSkillProjections materializes Copilot planning-with-files into the shared root', async () => {
  const plan = await planSkillProjections({
    rootDir: process.cwd(),
    homeDir: '/home/user',
    scope: 'workspace',
    target: 'copilot'
  });

  const planning = plan.find((entry) => entry.skillName === 'planning-with-files');
  assert.equal(planning.strategy, 'materialize');
  assert.match(planning.targetPath, /\.agents\/skills\/planning-with-files$/);
});
```

Update the profile test so Copilot’s allow-listed global profile also lands in `~/.agents/skills/`:

```js
assert.ok(
  plan.every((projection) => projection.targetPath.startsWith('/home/user/.agents/skills/'))
);
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
node --test tests/installer/paths.test.mjs tests/adapters/skill-profile.test.mjs tests/adapters/skill-projection.test.mjs
```

Expected: Copilot skill-root assertions fail because metadata still points to `.github/skills` / `~/.copilot/skills`.

- [ ] **Step 3: Change Copilot skill root metadata**

Edit `harness/core/metadata/platforms.json` so Copilot resolves skills through the shared roots:

```json
"copilot": {
  "displayName": "GitHub Copilot",
  "entryFiles": ["copilot-instructions.md"],
  "entryFilesByScope": {
    "workspace": ["copilot-instructions.md"],
    "global": ["instructions/harness.instructions.md"]
  },
  "skillRoots": {
    "workspace": [".agents/skills"],
    "global": [".agents/skills"]
  },
  "hookRoots": {
    "workspace": [".github/hooks"],
    "global": [".copilot/hooks"]
  },
  "supportsGlobal": true,
  "supportsWorkspace": true,
  "skillsStrategy": "materialize-preferred"
}
```

Do not change Copilot entry paths or hook roots in this task.

- [ ] **Step 4: Re-run the focused tests**

Run:

```bash
node --test tests/installer/paths.test.mjs tests/adapters/skill-profile.test.mjs tests/adapters/skill-projection.test.mjs
```

Expected: the path/projection tests pass, but later sync tests are still allowed to fail until the Copilot patch is updated.

- [ ] **Step 5: Commit the metadata-only root move**

```bash
git add harness/core/metadata/platforms.json tests/installer/paths.test.mjs tests/adapters/skill-profile.test.mjs tests/adapters/skill-projection.test.mjs
git commit -m "refactor: point Copilot skills at shared agents roots"
```

### Task 2: Make the Copilot `planning-with-files` Patch Work from the Shared Root

**Files:**
- Modify: `harness/installer/lib/copilot-planning-patch.mjs`
- Modify: `tests/adapters/skill-projection.test.mjs`
- Modify: `tests/adapters/sync-skills.test.mjs`
- Modify: `docs/compatibility/copilot-planning-with-files.md`

- [ ] **Step 1: Write the failing Copilot patch and sync tests**

Update the patch test so it expects the shared skill root fallback before the legacy Copilot root:

```js
assert.match(skill, /\.agents\/skills\/planning-with-files/);
assert.match(skill, /\$HOME\/\.agents\/skills\/planning-with-files/);
```

Add a sync assertion that Copilot now materializes into `.agents/skills` and does not create `.github/skills/planning-with-files`:

```js
const copilotPlanning = await readFile(
  path.join(root, '.agents/skills/planning-with-files/SKILL.md'),
  'utf8'
);
assert.match(copilotPlanning, /Harness Copilot planning-with-files patch/);
await assert.rejects(
  readFile(path.join(root, '.github/skills/planning-with-files/SKILL.md'), 'utf8'),
  /ENOENT/
);
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
node --test tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs
```

Expected: failures because the patch still resolves `.github/skills` / `~/.copilot/skills`.

- [ ] **Step 3: Generalize the Copilot root-resolution patch**

Replace the current Copilot root snippet with a shared-first fallback chain:

```js
function copilotSkillRootSnippet() {
  return [
    'COPILOT_PLANNING_WITH_FILES_ROOT="${HARNESS_AGENT_SKILL_ROOT:-${GITHUB_COPILOT_SKILL_ROOT:-.agents/skills/planning-with-files}}"',
    'if [ ! -f "$COPILOT_PLANNING_WITH_FILES_ROOT/scripts/session-catchup.py" ] && [ -n "${HOME:-}" ]; then',
    '  COPILOT_PLANNING_WITH_FILES_ROOT="$HOME/.agents/skills/planning-with-files"',
    'fi',
    'if [ ! -f "$COPILOT_PLANNING_WITH_FILES_ROOT/scripts/session-catchup.py" ]; then',
    '  COPILOT_PLANNING_WITH_FILES_ROOT=".github/skills/planning-with-files"',
    '  if [ ! -f "$COPILOT_PLANNING_WITH_FILES_ROOT/scripts/session-catchup.py" ] && [ -n "${HOME:-}" ]; then',
    '    COPILOT_PLANNING_WITH_FILES_ROOT="$HOME/.copilot/skills/planning-with-files"',
    '  fi',
    'fi'
  ].join("\\n");
}
```

Keep the rest of the patch behavior intact:

```js
const patched = original
  .replaceAll('${CLAUDE_PLUGIN_ROOT}', '$COPILOT_PLANNING_WITH_FILES_ROOT')
  .replace(
    '# Planning with Files',
    original.includes(MARKER)
      ? '# Planning with Files'
      : [
          `# ${MARKER}`,
          '',
          'This materialized copy is maintained by Harness for GitHub Copilot.',
          'It keeps task state under `planning/active/<task-id>/` and resolves helper scripts from the Copilot skill directory.',
          '',
          '```bash',
          copilotSkillRootSnippet(),
          '```',
          '',
          '# Planning with Files'
        ].join('\n')
  );
```

Update `docs/compatibility/copilot-planning-with-files.md` so the target paths match the shared root:

```md
Target paths:

- Workspace: `.agents/skills/planning-with-files`
- User-global: `~/.agents/skills/planning-with-files`
```

- [ ] **Step 4: Re-run the focused tests**

Run:

```bash
node --test tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs
```

Expected: patch tests and Copilot sync tests pass from the shared root.

- [ ] **Step 5: Commit the shared-root patch change**

```bash
git add harness/installer/lib/copilot-planning-patch.mjs tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs docs/compatibility/copilot-planning-with-files.md
git commit -m "refactor: make Copilot planning patch shared-root aware"
```

### Task 3: Coalesce Shared Codex/Copilot Skill Projections into One Write and One Manifest Entry

**Files:**
- Modify: `harness/installer/lib/skill-projection.mjs`
- Modify: `harness/installer/commands/sync.mjs`
- Modify: `tests/adapters/sync-skills.test.mjs`

- [ ] **Step 1: Write the failing shared-projection sync test**

Add a test that enables both Codex and Copilot, runs sync once, and expects one physical shared projection plus one manifest entry:

```js
test('sync coalesces shared Codex and Copilot skill targets into one manifest entry', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] },
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    const manifest = JSON.parse(await readFile(path.join(root, '.harness/projections.json'), 'utf8'));
    const entries = manifest.entries.filter((entry) =>
      entry.kind === 'skill' && entry.targetPath.endsWith('.agents/skills/planning-with-files')
    );

    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0].targets, ['codex', 'copilot']);
  } finally {
    await removeHarnessFixture(root);
  }
});
```

- [ ] **Step 2: Run the focused sync test to verify it fails**

Run:

```bash
node --test tests/adapters/sync-skills.test.mjs
```

Expected: the new test fails because sync still plans and writes duplicate projections for the same target path.

- [ ] **Step 3: Add projection coalescing and use it in sync**

In `harness/installer/lib/skill-projection.mjs`, add a coalescing helper:

```js
function patchKey(patch) {
  return `${patch.type}:${patch.marker ?? ''}`;
}

export function coalesceSkillProjections(projections) {
  const grouped = new Map();

  for (const projection of projections) {
    const key = path.resolve(projection.targetPath);
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        ...projection,
        targets: [projection.target]
      });
      continue;
    }

    if (existing.sourcePath !== projection.sourcePath) {
      throw new Error(`Shared skill root conflict for ${projection.targetPath}`);
    }

    existing.targets = [...new Set([...existing.targets, projection.target])].sort();
    existing.patches = [
      ...new Map([...(existing.patches ?? []), ...(projection.patches ?? [])].map((patch) => [patchKey(patch), patch])).values()
    ];
  }

  return [...grouped.values()].sort((left, right) => left.targetPath.localeCompare(right.targetPath));
}
```

In `harness/installer/commands/sync.mjs`, coalesce the planned skills before applying them and before emitting manifest entries:

```js
import { coalesceSkillProjections, planSkillProjections } from '../lib/skill-projection.mjs';

// ...
const rawSkillWrites = [];

// existing per-target loop pushes into rawSkillWrites

const skillWrites = coalesceSkillProjections(rawSkillWrites);

for (const projection of skillWrites) {
  const strategy =
    projection.strategy === 'link' && state.projectionMode === 'portable'
      ? 'materialize'
      : projection.strategy;

  manifestEntries.push({
    ...projection,
    strategy
  });
}
```

Do not coalesce entry writes or hook writes in this change.

- [ ] **Step 4: Re-run the focused sync test**

Run:

```bash
node --test tests/adapters/sync-skills.test.mjs
```

Expected: the shared-root sync test passes and `.harness/projections.json` records one shared skill entry with `targets: ['codex', 'copilot']`.

- [ ] **Step 5: Commit the projection-coalescing change**

```bash
git add harness/installer/lib/skill-projection.mjs harness/installer/commands/sync.mjs tests/adapters/sync-skills.test.mjs
git commit -m "refactor: coalesce shared Codex and Copilot skill projections"
```

### Task 4: Update Policy Notes and Installation Docs Without Changing Core Workflow Instructions

**Files:**
- Modify: `harness/core/policy/platform-overrides/copilot.md`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/install/copilot.md`
- Modify: `docs/install/codex.md`
- Modify: `tests/adapters/templates.test.mjs`
- Modify: `tests/installer/policy-render.test.mjs`

- [ ] **Step 1: Write the failing render/policy assertions**

Add a focused assertion that the Copilot platform note now reflects shared skill roots while the always-on profile stays thin:

```js
test('renderEntry keeps Copilot entry behavior thin while updating the shared skill-root note', async () => {
  const rendered = await renderEntry(process.cwd(), 'copilot');
  assert.match(rendered, /^---\napplyTo: "\*\*"\n---\n/);
  assert.match(rendered, /shared `\.agents\/skills` roots/);
  assert.doesNotMatch(rendered, /Complex Task Orchestration/);
  assert.doesNotMatch(rendered, /Companion Plan Model/);
});
```

- [ ] **Step 2: Run the focused render tests to verify they fail**

Run:

```bash
node --test tests/adapters/templates.test.mjs tests/installer/policy-render.test.mjs
```

Expected: the new Copilot wording assertion fails because the override still says not to assume `.agents/skills`.

- [ ] **Step 3: Update only the platform-note and docs wording**

Replace the Copilot override with neutral shared-root wording:

```md
# Copilot Override

GitHub Copilot supports the shared open Agent Skills roots used by Harness.

Render `copilot-instructions.md` for Copilot instruction entrypoints. Materialize projected skills into the shared `.agents/skills` roots so Codex and Copilot can reuse one on-disk skill copy when their content is compatible. Keep the patched `planning-with-files` content because Copilot skill and hook behavior differs from Codex and Claude Code.
```

Update the projection tables in `README.md`, `docs/architecture.md`, `docs/install/copilot.md`, and `docs/install/codex.md` so they read:

```md
| Codex | `.agents/skills` | `~/.agents/skills` | materialized |
| GitHub Copilot | `.agents/skills` | `~/.agents/skills` | materialized |
```

In the surrounding prose, explicitly keep these boundaries:

```md
- shared root applies only to Codex + Copilot skills
- Claude Code remains `.claude/skills`
- Cursor stays on `.cursor/skills` until its official skill-directory contract is re-verified
- hooks and entry files remain platform-native
```

Do not edit `harness/core/policy/base.md` or `harness/core/policy/entry-profiles.json`.

- [ ] **Step 4: Re-run the render and doc-safety tests**

Run:

```bash
node --test tests/adapters/templates.test.mjs tests/installer/policy-render.test.mjs tests/core/no-personal-paths.test.mjs
```

Expected: render behavior stays thin, the Copilot platform note is updated, and no personal absolute paths are introduced.

- [ ] **Step 5: Commit the wording/docs sync**

```bash
git add harness/core/policy/platform-overrides/copilot.md README.md docs/architecture.md docs/install/copilot.md docs/install/codex.md tests/adapters/templates.test.mjs tests/installer/policy-render.test.mjs
git commit -m "docs: document shared Codex and Copilot skill roots"
```

### Task 5: Run the Full Regression Matrix and Prove No Decision-Path or Tool-Call Drift

**Files:**
- Modify: `planning/active/cross-ide-single-source-consolidation/progress.md`

- [ ] **Step 1: Run the shared-root projection regression suite**

Run:

```bash
node --test tests/installer/paths.test.mjs tests/adapters/skill-profile.test.mjs tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs tests/installer/health.test.mjs
```

Expected: PASS. This proves the new shared root resolves, syncs, and reports healthy.

- [ ] **Step 2: Run the invariant suite for decision-path and tool-call stability**

Run:

```bash
node --test tests/adapters/templates.test.mjs tests/installer/policy-render.test.mjs tests/adapters/hook-projection.test.mjs tests/adapters/sync-hooks.test.mjs tests/installer/commands.test.mjs tests/core/no-personal-paths.test.mjs
```

Expected: PASS. This protects the following invariants:

```text
templates.test.mjs + policy-render.test.mjs
  => no new always-on policy sections are injected into rendered entry files
  => no tracked-task or deep-reasoning instructions are accidentally added to startup payloads

hook-projection.test.mjs + sync-hooks.test.mjs
  => hook config targets, event lists, and merge behavior are unchanged
  => tool lifecycle automation remains platform-native

commands.test.mjs
  => CLI dry-run/check/report semantics are unchanged

no-personal-paths.test.mjs
  => no local absolute paths leak into committed docs/templates
```

- [ ] **Step 3: Run the full repository verification suite**

Run:

```bash
npm run verify
```

Expected: PASS across all `tests/core/*.test.mjs`, `tests/installer/*.test.mjs`, and `tests/adapters/*.test.mjs`.

- [ ] **Step 4: Record the verification summary in task progress**

Append this exact structure to `planning/active/cross-ide-single-source-consolidation/progress.md`:

```md
### Implementation verification
- Shared-root projection suite: PASS
- Entry/hook/command invariant suite: PASS
- `npm run verify`: PASS
- Decision-path drift check: no change to `harness/core/policy/base.md`, `harness/core/policy/entry-profiles.json`, `harness/installer/lib/hook-projection.mjs`, or `harness/installer/lib/hook-config.mjs`
```

- [ ] **Step 5: Commit the verified implementation**

```bash
git add planning/active/cross-ide-single-source-consolidation/progress.md
git commit -m "test: verify shared root consolidation preserves behavior"
```

## Regression Validation Checklist

Use this checklist during implementation review:

- [ ] `AGENTS.md`, `.github/copilot-instructions.md`, `CLAUDE.md`, and `.cursor/rules/harness.mdc` still render from the same thin profile.
- [ ] `harness/core/policy/base.md` is unchanged.
- [ ] `harness/core/policy/entry-profiles.json` is unchanged.
- [ ] `harness/installer/lib/hook-projection.mjs` is unchanged unless a test proves a change is necessary.
- [ ] `harness/installer/lib/hook-config.mjs` is unchanged unless a test proves a change is necessary.
- [ ] `Copilot` now reads shared skills from `.agents/skills` / `~/.agents/skills`.
- [ ] `Codex` still reads the same shared roots.
- [ ] `Claude Code` still reads `.claude/skills`.
- [ ] `Cursor` still reads `.cursor/skills`.
- [ ] `planning-with-files` under the shared root still contains both patch markers:
  - `Harness planning-with-files companion-plan patch`
  - `Harness Copilot planning-with-files patch`
- [ ] `.harness/projections.json` records one shared skill projection for shared Codex/Copilot target paths.
- [ ] `npm run verify` passes from a clean worktree after the last commit.

## Self-Review

- Spec coverage: this plan covers the agreed convergence direction (`single authoring source + multi-platform projection`), the Codex/Copilot shared skill-root migration, projection-efficiency work, docs synchronization, and the requested regression validation focused on decision-path and tool-call stability.
- Placeholder scan: no `TBD`, `TODO`, or implicit “write tests later” placeholders remain.
- Type consistency: the same paths, target names (`codex`, `copilot`, `cursor`, `claude-code`), and file names are used consistently across tasks.
