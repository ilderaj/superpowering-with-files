import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runRepoWorkflowAcceptanceReplay } from '../evals/repo-workflow-replays/lib/run-repo-workflow-acceptance.mjs';

function successfulScenarios(report, scenarioCount = 1) {
  assert.deepEqual(report.summary, {
    scenarioCount,
    passed: scenarioCount,
    failed: 0
  });
  return report.scenarios;
}

test('repo workflow acceptance replay creates fresh V2 workspace Codex state from a nested leaf', async () => {
  const [scenario] = successfulScenarios(await runRepoWorkflowAcceptanceReplay());

  assert.equal(scenario.id, 'fresh-v2-install-from-leaf');
  assert.equal(scenario.state.schemaVersion, 2);
  assert.equal(scenario.state.runtime, 'trio');
  assert.equal(scenario.state.scope, 'workspace');
  assert.deepEqual(scenario.state.targets, ['codex']);
  assert.equal(scenario.state.entryPath.endsWith('AGENTS.md'), true);
  assert.equal(scenario.filesystem.rootEntryExists, true);
  assert.equal(scenario.filesystem.leafEntryExists, false);
});

test('repo workflow acceptance replay keeps a fresh V2 reinstall in the single Codex workspace shape', async () => {
  const [scenario] = successfulScenarios(
    await runRepoWorkflowAcceptanceReplay({ variant: 'fresh-reinstall' })
  );

  assert.equal(scenario.id, 'fresh-v2-reinstall-preserves-single-codex-shape');
  assert.equal(scenario.install.mode, 'reinstall');
  assert.equal(scenario.state.schemaVersion, 2);
  assert.deepEqual(scenario.state.targets, ['codex']);
});

test('repo workflow acceptance replay keeps sync dry-run byte-stable after fresh V2 install', async () => {
  const [scenario] = successfulScenarios(
    await runRepoWorkflowAcceptanceReplay({ variant: 'sync-dry-run' })
  );

  assert.equal(scenario.id, 'fresh-v2-sync-dry-run-no-write');
  assert.equal(scenario.dryRun.schemaVersion, 2);
  assert.equal(scenario.dryRun.runtime, 'trio');
  assert.equal(scenario.dryRun.mode, 'dry-run');
  assert.equal(scenario.noWrite, true);
});

test('repo workflow acceptance replay verifies a fresh V2 install from a nested leaf', async () => {
  const [scenario] = successfulScenarios(await runRepoWorkflowAcceptanceReplay({ variant: 'verify' }));

  assert.equal(scenario.id, 'fresh-v2-verify');
  assert.equal(scenario.report.schemaVersion, 2);
  assert.equal(scenario.report.runtime, 'trio');
  assert.equal(scenario.report.opened, true);
  assert.equal(scenario.report.rendered, false);
  assert.equal(scenario.report.descriptorCount > 0, true);
  assert.deepEqual(scenario.report.conflicts, []);
  assert.equal(scenario.noWrite, true);
});

test('repo workflow acceptance replay accepts verify stdout without creating a report directory', async () => {
  const [scenario] = successfulScenarios(
    await runRepoWorkflowAcceptanceReplay({ variant: 'verify-stdout' })
  );

  assert.equal(scenario.id, 'fresh-v2-verify-stdout');
  assert.equal(scenario.report.runtime, 'trio');
  assert.equal(scenario.report.opened, true);
  assert.equal(scenario.noWrite, true);
});

test('repo workflow acceptance replay runs doctor check-only on a healthy fresh V2 install', async () => {
  const [scenario] = successfulScenarios(await runRepoWorkflowAcceptanceReplay({ variant: 'doctor' }));

  assert.equal(scenario.id, 'fresh-v2-doctor-check-only');
  assert.equal(scenario.report.schemaVersion, 2);
  assert.equal(scenario.report.runtime, 'trio');
  assert.equal(scenario.report.readable, true);
  assert.equal(scenario.report.descriptorCount > 0, true);
  assert.deepEqual(scenario.report.conflicts, []);
  assert.equal(scenario.report.mode, 'check-only');
  assert.equal(scenario.noWrite, true);
});

test('repo workflow acceptance replay rejects persisted V1 state on every V2 command without writes', async () => {
  const scenarios = successfulScenarios(
    await runRepoWorkflowAcceptanceReplay({ variant: 'v1-rejection' }),
    4
  );

  assert.deepEqual(
    scenarios.map((scenario) => scenario.id),
    [
      'v1-install-requires-upgrade-recovery',
      'v1-sync-requires-upgrade-recovery',
      'v1-verify-requires-upgrade-recovery',
      'v1-doctor-requires-upgrade-recovery'
    ]
  );
  for (const scenario of scenarios) {
    assert.equal(scenario.expectedFailure, true);
    assert.equal(scenario.errorMatches, true);
    assert.equal(scenario.noWrite, true);
  }
});

test('repo workflow acceptance replay rejects every removed V1 install option before writes', async () => {
  const scenarios = successfulScenarios(
    await runRepoWorkflowAcceptanceReplay({ variant: 'removed-options' }),
    4
  );

  assert.deepEqual(
    scenarios.map((scenario) => scenario.id),
    [
      'install-rejects-scope-workspace',
      'install-rejects-targets-codex',
      'install-rejects-profile-safety',
      'install-rejects-hooks-on'
    ]
  );
  for (const scenario of scenarios) {
    assert.equal(scenario.expectedFailure, true);
    assert.equal(scenario.errorMatches, true);
    assert.equal(scenario.noWrite, true);
  }
});

test('repo workflow acceptance replay makes drifted V2 sync check fail without repairing the entry', async () => {
  const [scenario] = successfulScenarios(
    await runRepoWorkflowAcceptanceReplay({ variant: 'drift-check' })
  );

  assert.equal(scenario.id, 'fresh-v2-sync-check-drift-no-write');
  assert.equal(scenario.expectedFailure, true);
  assert.equal(scenario.errorMatches, true);
  assert.equal(scenario.noWrite, true);
});

test('repo workflow acceptance replay rejects incompatible V2 sync flags without writes', async () => {
  const [scenario] = successfulScenarios(
    await runRepoWorkflowAcceptanceReplay({ variant: 'incompatible-sync' })
  );

  assert.equal(scenario.id, 'fresh-v2-sync-rejects-dry-run-check-combination-no-write');
  assert.equal(scenario.expectedFailure, true);
  assert.equal(scenario.errorMatches, true);
  assert.equal(scenario.noWrite, true);
});

test('repo workflow acceptance replay routes linked nested-leaf V2 operations only to the parent authority root', async () => {
  const [scenario] = successfulScenarios(
    await runRepoWorkflowAcceptanceReplay({ variant: 'workspace-link' })
  );

  assert.equal(scenario.id, 'workspace-link-routes-v2-install-sync-and-verify-to-parent');
  assert.equal(scenario.sync.mode, 'dry-run');
  assert.equal(scenario.report.runtime, 'trio');
  assert.deepEqual(scenario.state.targets, ['codex']);
  assert.deepEqual(scenario.filesystem, {
    rootStateExists: true,
    rootEntryExists: true,
    leafStateExists: false,
    leafEntryExists: false,
    leafAuthorityLinkExists: true
  });
});
