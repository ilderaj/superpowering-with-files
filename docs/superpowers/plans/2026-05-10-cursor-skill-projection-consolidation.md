# Cursor Skill Projection Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate Cursor, GitHub Copilot, and Codex skill projections onto the shared `.agents/skills` and `~/.agents/skills` roots now that Cursor officially supports them.

**Architecture:** Keep platform-native entry files and hooks unchanged: Cursor rules stay in `.cursor/rules`, Cursor hooks stay under `.cursor`, Copilot entries stay under `.github`, and Codex entries stay at `AGENTS.md`. Move only Cursor skill roots to the shared skill roots already used by Codex and Copilot, then rely on the existing `coalesceSkillProjections` path-based merge to write one shared materialized skill directory per skill. Keep Claude Code separate on `.claude/skills` because the existing health checks explicitly reject shared Claude skill root symlinks.

**Tech Stack:** Node.js ESM installer code, JSON platform metadata, Node test runner, markdown docs, Harness projection manifest.

**Active task path:** `planning/active/cursor-skill-projection-consolidation/`

**Lifecycle state:** implementation executed, merged into `dev` locally, and re-audited before push.

**Sync-back status:** synced to `planning/active/cursor-skill-projection-consolidation/{task_plan.md,findings.md,progress.md}`; final implementation committed as `5fc4d2d`, merged into `dev` as `522e7ae`, temporary worktree removed, and final audit verification passed before push.

---

## Official Cursor Facts Used

Only Cursor official docs are used for Cursor behavior decisions:

- `https://cursor.com/docs/skills` says Cursor automatically discovers Agent Skills from skill directories at startup.
- `https://cursor.com/docs/skills` lists `.agents/skills/` and `.cursor/skills/` as Project-level skill directories.
- `https://cursor.com/docs/skills` lists `~/.agents/skills/` and `~/.cursor/skills/` as User-level skill directories.
- `https://cursor.com/docs/skills` says Cursor also loads compatibility skill directories including `.codex/skills/` and `~/.codex/skills/`.
- `https://cursor.com/docs/skills` says each skill is a folder containing `SKILL.md`, with required `name` and `description` frontmatter.
- `https://cursor.com/docs/skills` says Cursor walks skill roots recursively and picks up any `SKILL.md` it finds.
- `https://cursor.com/docs/rules` says Cursor Project Rules live in `.cursor/rules`, so this plan does not move Cursor rule entries.

Conclusion: Cursor officially supports `.agents/skills`; therefore Cursor, Copilot, and Codex can share the same projected skill root without relying on unofficial behavior.

## Current Code Shape

- `harness/core/metadata/platforms.json` defines all target skill roots.
- Codex currently uses `.agents/skills` and `~/.agents/skills`.
- GitHub Copilot currently uses `.agents/skills` and `~/.agents/skills`, with a `github-cloud` workspace override to `.github/skills`.
- Cursor currently uses `.cursor/skills` and `~/.cursor/skills`.
- `harness/installer/lib/paths.mjs` resolves skill roots only from metadata.
- `harness/installer/lib/skill-projection.mjs` already coalesces projections with the same `targetPath`.
- `harness/installer/commands/sync.mjs` already coalesces raw skill writes after collecting all enabled targets.
- Tracked generated projections currently include both `.agents/skills/**` and `.cursor/skills/**`; leaving both after this change would cause Cursor to discover duplicate skills.

## Implementation Tasks

### Task 1: Encode the New Cursor Shared Root Contract in Tests

**Files:**
- Modify: `tests/installer/paths.test.mjs`
- Modify: `tests/adapters/skill-projection.test.mjs`
- Modify: `tests/adapters/sync-skills.test.mjs`
- Modify: `tests/installer/health.test.mjs`

- [ ] **Step 1: Update path resolver expectations for Cursor**

In `tests/installer/paths.test.mjs`, change the Cursor skill target test so `resolveSkillTargetPaths('/repo', '/home/user', 'both', 'cursor', ...)` expects:

```js
[
  '/repo/.agents/skills/planning-with-files',
  '/home/user/.agents/skills/planning-with-files'
]
```

Also rename the test to make the contract explicit:

```js
test('resolveSkillTargetPaths maps Cursor skills into shared Agent Skills roots', () => {
```

Run:

```bash
node --test tests/installer/paths.test.mjs
```

Expected now, before implementation: FAIL, because Cursor still resolves to `.cursor/skills`.

- [ ] **Step 2: Update per-target skill projection path expectations**

In `tests/adapters/skill-projection.test.mjs`, update the `expectations` objects in these tests so Cursor matches `.agents/skills/...`:

```js
cursor: /\.agents\/skills\/writing-plans$/,
```

Apply the same change for:

```js
cursor: /\.agents\/skills\/using-git-worktrees$/,
cursor: /\.agents\/skills\/finishing-a-development-branch$/,
```

Run:

```bash
node --test tests/adapters/skill-projection.test.mjs
```

Expected now, before implementation: FAIL on Cursor target path assertions.

- [ ] **Step 3: Add a three-target coalesce sync test**

In `tests/adapters/sync-skills.test.mjs`, update the existing `sync coalesces shared skill projections across codex and copilot` test to include Cursor:

```js
targets: {
  codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] },
  copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] },
  cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] }
}
```

Rename it:

```js
test('sync coalesces shared skill projections across codex, copilot, and cursor', async () => {
```

Update the assertion:

```js
assert.equal(planningEntries.length, 1);
assert.deepEqual(planningEntries[0].targets, ['codex', 'copilot', 'cursor']);
```

Run:

```bash
node --test tests/adapters/sync-skills.test.mjs
```

Expected now, before implementation: FAIL, because Cursor still writes `.cursor/skills`.

- [ ] **Step 4: Update all-target planning skill path expectations**

In `tests/adapters/sync-skills.test.mjs`, update the `targets` map in the all-target planning-with-files patch test so Cursor reads the same shared skill file:

```js
const targets = {
  codex: path.join(root, '.agents/skills/planning-with-files/SKILL.md'),
  copilot: path.join(root, '.agents/skills/planning-with-files/SKILL.md'),
  cursor: path.join(root, '.agents/skills/planning-with-files/SKILL.md'),
  'claude-code': path.join(root, '.claude/skills/planning-with-files/SKILL.md')
};
```

Add an assertion that a fresh sync does not create the old Cursor skill copy:

```js
await assert.rejects(lstat(path.join(root, '.cursor/skills/planning-with-files/SKILL.md')), /ENOENT/);
```

Run:

```bash
node --test tests/adapters/sync-skills.test.mjs
```

Expected now, before implementation: FAIL on the Cursor path and old-copy assertion.

- [ ] **Step 5: Add stale cleanup coverage for old Cursor skill projections**

In `tests/adapters/sync-skills.test.mjs`, add a test that simulates a previous Harness-managed `.cursor/skills` projection in `.harness/projections.json`, then verifies the next sync removes it after the desired projection moves to `.agents/skills`.

Use this shape:

```js
test('sync removes stale Harness-managed Cursor skill projections after shared root migration', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        cursor: { enabled: true, paths: [path.join(root, '.cursor/rules/harness.mdc')] }
      },
      upstream: {}
    });

    const staleSkill = path.join(root, '.cursor/skills/planning-with-files');
    await mkdir(staleSkill, { recursive: true });
    await writeFile(path.join(staleSkill, 'SKILL.md'), 'old cursor projection');
    await mkdir(path.join(root, '.harness'), { recursive: true });
    await writeFile(
      path.join(root, '.harness/projections.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        entries: [
          {
            kind: 'skill',
            parentSkillName: 'planning-with-files',
            skillName: 'planning-with-files',
            target: 'cursor',
            deploymentProfile: 'standard',
            strategy: 'materialize',
            sourcePath: path.join(root, 'harness/upstream/planning-with-files'),
            targetPath: staleSkill,
            patches: [
              {
                type: 'planning-with-files-companion-plan',
                marker: 'Harness planning-with-files companion-plan patch'
              }
            ]
          }
        ]
      }, null, 2)}\n`
    );

    await withCwd(root, () => sync([]));

    await assert.rejects(lstat(staleSkill), /ENOENT/);
    assert.equal((await lstat(path.join(root, '.agents/skills/planning-with-files'))).isDirectory(), true);
  } finally {
    await removeHarnessFixture(root);
  }
});
```

Run:

```bash
node --test tests/adapters/sync-skills.test.mjs
```

Expected after implementation: PASS.

- [ ] **Step 6: Add Cursor duplicate health coverage for shared workspace/global roots**

In `tests/installer/health.test.mjs`, add a Cursor variant of the Copilot display-duplicate test. It should install Cursor with `scope: 'both'`, replace workspace and user-global `.agents/skills/using-superpowers` with symlinks to the same canonical source, and assert the warning contains:

```js
'skill duplicate cursor using-superpowers: display-duplicate'
```

Run:

```bash
node --test tests/installer/health.test.mjs
```

Expected after implementation: PASS.

### Task 2: Move Cursor Skill Roots to Shared `.agents/skills`

**Files:**
- Modify: `harness/core/metadata/platforms.json`

- [ ] **Step 1: Change Cursor workspace and global skill roots**

Replace the Cursor `skillRoots` block:

```json
"skillRoots": {
  "workspace": [".cursor/skills"],
  "global": [".cursor/skills"]
}
```

with:

```json
"skillRoots": {
  "workspace": [".agents/skills"],
  "global": [".agents/skills"]
}
```

Do not change:

```json
"entryFiles": [".cursor/rules/harness.mdc"]
```

Do not change:

```json
"hookRoots": {
  "workspace": [".cursor"],
  "global": [".cursor"]
}
```

- [ ] **Step 2: Run targeted tests**

Run:

```bash
node --test tests/installer/paths.test.mjs tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs
```

Expected after implementation: PASS except for any tests intentionally updated in later tasks.

### Task 3: Generalize Planning Skill Root Resolution for Shared Skill Copies

**Files:**
- Create: `harness/installer/lib/planning-with-files-skill-root-patch.mjs`
- Modify: `harness/installer/commands/sync.mjs`
- Modify: `harness/core/skills/index.json`
- Modify: `tests/adapters/skill-projection.test.mjs`

Rationale: Once Cursor shares `.agents/skills` with Copilot and Codex, the materialized `planning-with-files/SKILL.md` should not gain more target-specific Copilot-only prose. The current Copilot patch already leaks into Codex when Codex and Copilot share a skill target. This task makes that shared copy target-neutral before adding Cursor to the same root.

- [ ] **Step 1: Create a shared planning skill-root patch helper**

Create `harness/installer/lib/planning-with-files-skill-root-patch.mjs`:

```js
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applyPlanningWithFilesCompanionPlanPatch } from './planning-with-files-companion-plan-patch.mjs';

const MARKER = 'Harness planning-with-files skill-root resolution patch';

function planningSkillRootSnippet({ preferGithubSkillRoot = false } = {}) {
  const preferredWorkspaceRoot = preferGithubSkillRoot
    ? '.github/skills/planning-with-files'
    : '.agents/skills/planning-with-files';
  const fallbackWorkspaceRoot = preferGithubSkillRoot
    ? '.agents/skills/planning-with-files'
    : '.github/skills/planning-with-files';

  return [
    `HARNESS_PLANNING_WITH_FILES_ROOT="${'${HARNESS_AGENT_SKILL_ROOT:-${GITHUB_COPILOT_SKILL_ROOT:-'}${preferredWorkspaceRoot}}}"`,
    'if [ ! -f "$HARNESS_PLANNING_WITH_FILES_ROOT/scripts/session-catchup.py" ] && [ -n "${HOME:-}" ]; then',
    '  HARNESS_PLANNING_WITH_FILES_ROOT="$HOME/.agents/skills/planning-with-files"',
    'fi',
    'if [ ! -f "$HARNESS_PLANNING_WITH_FILES_ROOT/scripts/session-catchup.py" ]; then',
    `  HARNESS_PLANNING_WITH_FILES_ROOT="${fallbackWorkspaceRoot}"`,
    'fi',
    'if [ ! -f "$HARNESS_PLANNING_WITH_FILES_ROOT/scripts/session-catchup.py" ] && [ -n "${HOME:-}" ]; then',
    '  for candidate in "$HOME/.cursor/skills/planning-with-files" "$HOME/.copilot/skills/planning-with-files" "$HOME/.claude/skills/planning-with-files"; do',
    '    if [ -f "$candidate/scripts/session-catchup.py" ]; then',
    '      HARNESS_PLANNING_WITH_FILES_ROOT="$candidate"',
    '      break',
    '    fi',
    '  done',
    'fi'
  ].join('\n');
}

export async function applyPlanningWithFilesSkillRootPatch(targetDir, options = {}) {
  await applyPlanningWithFilesCompanionPlanPatch(targetDir);

  const skillPath = path.join(targetDir, 'SKILL.md');
  const original = await readFile(skillPath, 'utf8');
  const patched = original
    .replaceAll('${CLAUDE_PLUGIN_ROOT}', '$HARNESS_PLANNING_WITH_FILES_ROOT')
    .replace(
      '# Planning with Files',
      original.includes(MARKER)
        ? '# Planning with Files'
        : [
            `# ${MARKER}`,
            '',
            'This materialized copy is maintained by Harness for Agent Skills compatible tools.',
            'It keeps task state under `planning/active/<task-id>/` and resolves helper scripts from the projected skill directory.',
            '',
            '```bash',
            planningSkillRootSnippet(options),
            '```',
            '',
            '# Planning with Files'
          ].join('\n')
    );

  await writeFile(skillPath, patched);
}

export { MARKER as PLANNING_WITH_FILES_SKILL_ROOT_PATCH_MARKER };
```

- [ ] **Step 2: Wire the new patch type in sync**

In `harness/installer/commands/sync.mjs`, import the new helper:

```js
import { applyPlanningWithFilesSkillRootPatch } from '../lib/planning-with-files-skill-root-patch.mjs';
```

Add this branch in `applySkillPatches` before the Copilot legacy branch:

```js
if (patch.type === 'planning-with-files-skill-root') {
  await applyPlanningWithFilesSkillRootPatch(projection.targetPath, {
    preferGithubSkillRoot: projection.deploymentProfile === 'github-cloud'
  });
  continue;
}
```

Keep the old `copilot-planning-with-files` branch for backward compatibility during the transition, but stop assigning it in `harness/core/skills/index.json`.

- [ ] **Step 3: Assign the shared patch to Codex, Copilot, and Cursor**

In `harness/core/skills/index.json`, change `planning-with-files.patches` to:

```json
"patches": {
  "default": {
    "type": "planning-with-files-companion-plan",
    "marker": "Harness planning-with-files companion-plan patch"
  },
  "codex": {
    "type": "planning-with-files-skill-root",
    "marker": "Harness planning-with-files skill-root resolution patch"
  },
  "copilot": {
    "type": "planning-with-files-skill-root",
    "marker": "Harness planning-with-files skill-root resolution patch"
  },
  "cursor": {
    "type": "planning-with-files-skill-root",
    "marker": "Harness planning-with-files skill-root resolution patch"
  }
}
```

Do not add this patch to `claude-code` unless a separate Claude verification task proves it is needed.

- [ ] **Step 4: Update tests for the shared patch**

In `tests/adapters/skill-projection.test.mjs`:

- Replace assertions that expect `copilot-planning-with-files` in planned patch lists with `planning-with-files-skill-root` for Codex, Copilot, and Cursor.
- Keep assertions that Claude Code receives only the companion-plan patch.
- Replace the `applyCopilotPlanningPatch` helper tests with tests for `applyPlanningWithFilesSkillRootPatch`.
- Assert the patched skill includes `Harness planning-with-files skill-root resolution patch`.
- Assert the patched skill includes `$HARNESS_PLANNING_WITH_FILES_ROOT`.
- Assert the patched skill does not include `${CLAUDE_PLUGIN_ROOT}`.
- Assert the patched skill does not include `Harness Copilot planning-with-files patch`.

Run:

```bash
node --test tests/adapters/skill-projection.test.mjs
```

Expected after implementation: PASS.

### Task 4: Remove the Tracked Cursor Skill Projection Copy

**Files:**
- Delete: `.cursor/skills/**`
- Keep: `.cursor/rules/**`
- Keep: `.cursor/hooks*` and `.cursor/hooks/**` if present

- [ ] **Step 1: Confirm the delete target is only generated skill projection content**

Run:

```bash
git --no-pager ls-files .cursor/skills | wc -l
git --no-pager ls-files .cursor/rules .cursor/hooks .cursor/hooks.json
```

Expected: `.cursor/skills` has tracked generated skill files; `.cursor/rules` remains separate.

- [ ] **Step 2: Remove only the old Cursor skill projection tree**

Run:

```bash
git rm -r .cursor/skills
```

Do not delete `.cursor/rules`.

- [ ] **Step 3: Verify Cursor still gets skills through `.agents/skills`**

Run:

```bash
node --test tests/adapters/sync-skills.test.mjs tests/installer/paths.test.mjs
```

Expected after implementation: PASS.

### Task 5: Update Documentation and Rendered Policy Tests

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/install/cursor.md`
- Modify: `tests/installer/policy-render.test.mjs`

- [ ] **Step 1: Update README skill root table**

Change Cursor from:

```md
| Cursor | `.cursor/skills` | `~/.cursor/skills` | materialized |
```

to:

```md
| Cursor | `.agents/skills` | `~/.agents/skills` | materialized |
```

Update the paragraph below the table from “Shared skill roots are limited to Codex and GitHub Copilot” to say Codex, GitHub Copilot, and Cursor share `.agents/skills`; Claude Code remains on `.claude/skills`.

- [ ] **Step 2: Update architecture docs**

In `docs/architecture.md`, update the skill roots table:

```md
| Cursor | `.agents/skills` | `~/.agents/skills` |
```

Replace the stale re-verification paragraph with:

```md
Codex, GitHub Copilot, and Cursor share `.agents/skills` / `~/.agents/skills` for skill projection. Cursor keeps native `.cursor/rules` and `.cursor` hook roots; only skill projection is shared. Claude Code stays on `.claude/skills` because Harness health checks reject shared Claude skill root symlinks.
```

- [ ] **Step 3: Update Cursor install docs**

In `docs/install/cursor.md`, update the User-global scope block:

```text
~/.agents/skills
```

Replace the primary projection paragraph with:

```md
Cursor uses both rules and skills when available. Cursor's official docs list `.agents/skills` and `~/.agents/skills` as auto-discovered skill directories, so Harness uses the same shared skill roots as Codex and GitHub Copilot. Cursor's native `.cursor/skills` roots remain official compatibility discovery paths, but Harness no longer projects a duplicate Cursor-specific skill tree there.
```

Keep the list of official Cursor skill roots if useful, but label it as “Cursor official discovery roots”, not “Harness projection roots”.

- [ ] **Step 4: Update policy-render documentation assertions**

In `tests/installer/policy-render.test.mjs`, update Cursor assertions:

```js
assert.match(readme, /Cursor \| `\.agents\/skills` \| `~\/\.agents\/skills` \| materialized/);
assert.match(architecture, /Codex, GitHub Copilot, and Cursor share `\.agents\/skills`/i);
assert.doesNotMatch(architecture, /Cursor stays on `\.cursor\/skills`/);
```

Run:

```bash
node --test tests/installer/policy-render.test.mjs
```

Expected after implementation: PASS.

### Task 6: Full Verification

**Files:**
- No additional files expected.

- [ ] **Step 1: Run focused adapter and installer tests**

Run:

```bash
node --test tests/installer/paths.test.mjs tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs tests/installer/policy-render.test.mjs tests/installer/health.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run full project verification**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 3: Check workspace hygiene**

Run:

```bash
git diff --check
git status --short
```

Expected:

- No whitespace errors.
- Intended changes include metadata, tests, docs, new shared patch helper, removal of `.cursor/skills/**`, and regenerated/shared skill projection changes under `.agents/skills/**` only if sync materially changes them.
- No unrelated active task files are modified.

## Risks and Review Points

- Removing tracked `.cursor/skills/**` is a broad delete, but it is necessary to avoid Cursor discovering duplicate skills after `.agents/skills` becomes the Harness primary Cursor skill root.
- Existing users with a Harness projection manifest should get stale `.cursor/skills` cleanup through `sync` because stale manifest entries are removed by `cleanupStaleProjection`.
- User-managed `.cursor/skills` paths should still be protected by `isUserManagedTarget`; the stale cleanup test should cover only Harness-managed projections.
- Copilot `github-cloud` remains a special deployment profile: workspace skill root can still switch to `.github/skills`, while Cursor and Codex continue to use `.agents/skills` under the standard profile.
- The shared planning-with-files root patch is intentionally limited to Codex, Copilot, and Cursor. Claude Code remains on the upstream-compatible `.claude/skills` path until separately verified.

## Review Checklist

- Cursor official docs are sufficient to justify `.agents/skills` support.
- The plan changes only skill projection roots, not Cursor rules or hooks.
- The implementation avoids duplicate Cursor skill discovery by deleting the tracked `.cursor/skills` projection copy.
- Shared skill content is target-neutral enough for Codex, Copilot, and Cursor to read the same materialized files.
- Tests cover path resolution, sync coalescing, stale cleanup, docs, and health duplicate classification.
