import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultState, readState, updateState, writeState } from '../../harness/installer/lib/state.mjs';

const retiredEnginePaths = [
  'harness/installer/lib/adapters.mjs',
  'harness/installer/lib/backup-archive.mjs',
  'harness/installer/lib/copilot-planning-patch.mjs',
  'harness/installer/lib/fs-ops.mjs',
  'harness/installer/lib/health.mjs',
  'harness/installer/lib/health-context-budgets.mjs',
  'harness/installer/lib/health-governance.mjs',
  'harness/installer/lib/health-planning-diagnostics.mjs',
  'harness/installer/lib/health-projection-inspection.mjs',
  'harness/installer/lib/hook-config.mjs',
  'harness/installer/lib/hook-projection.mjs',
  'harness/installer/lib/matt-coding-contracts-patch.mjs',
  'harness/installer/lib/metadata.mjs',
  'harness/installer/lib/paths.mjs',
  'harness/installer/lib/plan-locations.mjs',
  'harness/installer/lib/planning-hot-context.mjs',
  'harness/installer/lib/planning-with-files-companion-plan-patch.mjs',
  'harness/installer/lib/planning-with-files-risk-assessment-patch.mjs',
  'harness/installer/lib/planning-with-files-skill-root-patch.mjs',
  'harness/installer/lib/policy-render.mjs',
  'harness/installer/lib/projection-manifest.mjs',
  'harness/installer/lib/retired-skill-tombstone.mjs',
  'harness/installer/lib/runtime-hook-evidence.mjs',
  'harness/installer/lib/safety-projection.mjs',
  'harness/installer/lib/skill-projection.mjs',
  'harness/installer/lib/superpowers-coding-contracts-patch.mjs',
  'harness/installer/lib/superpowers-executing-plans-replan-patch.mjs',
  'harness/installer/lib/superpowers-finishing-a-development-branch-patch.mjs',
  'harness/installer/lib/superpowers-subagent-driven-development-budget-patch.mjs',
  'harness/installer/lib/superpowers-using-git-worktrees-patch.mjs',
  'harness/installer/lib/superpowers-using-superpowers-routing-patch.mjs',
  'harness/installer/lib/superpowers-verification-before-completion-patch.mjs',
  'harness/installer/lib/superpowers-writing-plans-patch.mjs',
  'harness/installer/lib/sync-apply.mjs',
  'harness/installer/lib/sync-plan.mjs',
  'harness/installer/lib/user-managed.mjs',
  'harness/core/skills/profiles.json',
  'harness/core/skills/index.json',
  'harness/core/policy/entry-profiles.json',
  'harness/core/policy/base.md',
  'harness/core/policy/safety.md',
  'harness/core/policy/cloud-safe.md',
  'harness/core/policy/platform-overrides/codex.md',
  'harness/core/policy/platform-overrides/copilot.md',
  'harness/core/policy/platform-overrides/cursor.md',
  'harness/core/policy/platform-overrides/claude-code.md',
  'harness/core/policy/snippets/shell-token-guidance.md',
  'harness/core/context-budget-policies.json',
  'harness/core/metadata/platforms.json',
  'harness/adapters/codex/manifest.json',
  'harness/adapters/copilot/manifest.json',
  'harness/adapters/cursor/manifest.json',
  'harness/adapters/claude-code/manifest.json',
  'harness/core/templates/AGENTS.md.hbs',
  'harness/core/templates/CLAUDE.md.hbs',
  'harness/core/templates/copilot-instructions.md.hbs',
  'harness/core/templates/cursor-rule.mdc.hbs',
  'tests/adapters/hook-projection.test.mjs',
  'tests/adapters/skill-profile.test.mjs',
  'tests/adapters/skill-projection.test.mjs',
  'tests/adapters/sync-hooks.test.mjs',
  'tests/adapters/sync-skills.test.mjs',
  'tests/adapters/sync.test.mjs',
  'tests/adapters/templates.test.mjs',
  'tests/installer/fs-ops.test.mjs',
  'tests/installer/health.test.mjs',
  'tests/installer/health-context-budgets.test.mjs',
  'tests/installer/health-governance.test.mjs',
  'tests/installer/health-hook-payload-dedupe.test.mjs',
  'tests/installer/health-planning-diagnostics.test.mjs',
  'tests/installer/health-projection-inspection.test.mjs',
  'tests/installer/hook-config.test.mjs',
  'tests/installer/matt-skill-patches.test.mjs',
  'tests/installer/metadata.test.mjs',
  'tests/installer/paths.test.mjs',
  'tests/installer/planning-hot-context.test.mjs',
  'tests/installer/policy-render.test.mjs',
  'tests/installer/retired-skill-tombstone.test.mjs',
  'tests/installer/runtime-hook-evidence.test.mjs',
  'tests/installer/sync-boundary.test.mjs',
  'tests/installer/sync-retired-skill-cleanup.test.mjs',
  'tests/core/skill-index.test.mjs',
  'tests/safety/projection.test.mjs',
  'harness/core/safety/cloud-protected-paths.txt',
  'harness/core/safety/dangerous-patterns.txt',
  'harness/core/safety/protected-paths.txt',
  'harness/core/safety/safe-commands.txt',
  'harness/core/templates/safety/vscode-settings.safety.jsonc',
  'docs/safety/architecture.md'
];

const retiredPwfHookPaths = [
  'harness/core/hooks/planning-with-files/claude-hooks.json',
  'harness/core/hooks/planning-with-files/codex-hooks.json',
  'harness/core/hooks/planning-with-files/copilot-hooks.json',
  'harness/core/hooks/planning-with-files/cursor-hooks.json',
  'harness/core/hooks/planning-with-files/scripts/planning-brief-context.mjs',
  'harness/core/hooks/planning-with-files/scripts/planning-hot-context.mjs',
  'harness/core/hooks/planning-with-files/scripts/render-brief-context.mjs',
  'harness/core/hooks/planning-with-files/scripts/render-hot-context.mjs',
  'harness/core/hooks/planning-with-files/scripts/render-routing-decision.mjs',
  'harness/core/hooks/planning-with-files/scripts/render-session-summary.mjs',
  'harness/core/hooks/planning-with-files/scripts/session-summary.mjs',
  'harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh',
  'harness/core/hooks/runtime-hook-evidence.sh',
  'harness/installer/lib/session-summary.mjs',
  'tests/hooks/session-summary.test.mjs',
  'tests/hooks/task-scoped-hook.test.mjs',
  'tests/installer/goal-4-completion.test.mjs',
  'docs/compatibility/hooks.md'
];

const retiredHookEvidenceSummaryPaths = [
  'harness/installer/lib/hook-evidence-summary.mjs'
];

const retiredContextBudgetPaths = [
  'harness/core/context-budgets.json',
  'harness/installer/lib/context-budget.mjs',
  'tests/installer/context-budget.test.mjs',
  'tests/installer/copilot-usage-budget.test.mjs'
];

test('defaultState creates only the narrow v1 compatibility envelope', () => {
  assert.deepEqual(defaultState(), {
    schemaVersion: 1,
    scope: 'workspace',
    targets: {},
    upstream: {}
  });
});

test('state bridge preserves legacy profile-shaped fields opaquely while fetch metadata updates', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-state-'));
  try {
    const legacyState = {
      schemaVersion: 1,
      scope: 'both',
      projectionMode: 'portable',
      hookMode: 'on',
      deploymentProfile: 'vendor-deployment',
      policyProfile: 'safety',
      workspacePolicyOverlay: 'cloud-safe',
      skillProfile: 'second-opinion-advisory',
      legacyProfileMetadata: {
        profile: 'unrecognized-by-v2',
        selectors: ['policy', 'hook', 'deployment']
      },
      targets: { codex: { enabled: true, paths: ['AGENTS.md'] } },
      upstream: { planning: { candidatePath: 'candidate' } },
      lastSync: '2026-04-13T00:00:00.000Z'
    };
    const stateFile = path.join(dir, '.harness', 'state.json');
    await mkdir(path.dirname(stateFile), { recursive: true });
    await writeFile(stateFile, JSON.stringify(legacyState), 'utf8');

    assert.deepEqual(await readState(dir), legacyState);

    await updateState(dir, (state) => ({
      ...state,
      lastFetch: '2026-04-14T00:00:00.000Z'
    }));
    assert.deepEqual(await readState(dir), {
      ...legacyState,
      lastFetch: '2026-04-14T00:00:00.000Z'
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('state schema describes a tolerant legacy envelope without profile contracts', async () => {
  const schema = JSON.parse(await readFile('harness/core/state-schema/state.schema.json', 'utf8'));

  assert.deepEqual(schema.required, ['schemaVersion', 'scope', 'targets', 'upstream']);
  assert.equal(schema.additionalProperties, true);
  for (const retiredContract of [
    'projectionMode',
    'hookMode',
    'deploymentProfile',
    'policyProfile',
    'workspacePolicyOverlay',
    'skillProfile'
  ]) {
    assert.equal(schema.properties[retiredContract], undefined);
  }
});

test('state bridge retains integrity checks for the V1 envelope', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-state-'));
  try {
    const invalidStates = [
      [{ schemaVersion: 0, scope: 'workspace', targets: {}, upstream: {} }, /schemaVersion must be 1/],
      [{ schemaVersion: 1, scope: 'invalid', targets: {}, upstream: {} }, /scope must be workspace/],
      [{ schemaVersion: 1, scope: 'workspace', targets: { unknown: {} }, upstream: {} }, /unsupported target/],
      [{ schemaVersion: 1, scope: 'workspace', targets: {}, upstream: [] }, /upstream must be a JSON object/],
      [{ schemaVersion: 1, scope: 'workspace', targets: {}, upstream: {}, lastUpdate: 7 }, /lastUpdate must be a string/]
    ];

    for (const [state, expectation] of invalidStates) {
      await assert.rejects(writeState(dir, state), expectation);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('C3 physically retires the profile projection engine and its CI boundary', async () => {
  for (const retiredPath of retiredEnginePaths) {
    await assert.rejects(access(retiredPath));
  }

  const [stateSource, upstreamRefreshVerifier, upstreamRefreshLib] = await Promise.all([
    readFile('harness/installer/lib/state.mjs', 'utf8'),
    readFile('scripts/ci/verify-upstream-refresh.mjs', 'utf8'),
    readFile('scripts/ci/lib/upstream-refresh.mjs', 'utf8')
  ]);
  assert.doesNotMatch(stateSource, /safety-projection|normalizePolicySelection|effectiveEntryPolicyProfiles|activeSafetyPolicyProfile|normalizeRetiredSkillProfile/);
  const retiredCiReference = /harness\/installer\/lib\/(?:safety|skill)-projection\.mjs|tests\/(?:adapters\/(?:skill-projection|sync-skills|sync-hooks)|installer\/(?:matt-skill-patches|policy-render))\.test\.mjs/;
  assert.doesNotMatch(upstreamRefreshVerifier, retiredCiReference);
  assert.doesNotMatch(upstreamRefreshLib, retiredCiReference);
});

test('PWF hook source, helper, bridge, and dedicated test paths are physically retired', async () => {
  for (const retiredPath of retiredPwfHookPaths) {
    await assert.rejects(access(retiredPath), { code: 'ENOENT' });
  }
});

test('hook evidence summary helper is physically retired', async () => {
  for (const retiredPath of retiredHookEvidenceSummaryPaths) {
    await assert.rejects(access(retiredPath), { code: 'ENOENT' });
  }
});

test('context budget config, helper, and dedicated tests are physically retired', async () => {
  for (const retiredPath of retiredContextBudgetPaths) {
    await assert.rejects(access(retiredPath), { code: 'ENOENT' });
  }
});
