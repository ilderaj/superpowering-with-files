import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runRepoWorkflowAcceptanceReplay } from '../evals/repo-workflow-replays/lib/run-repo-workflow-acceptance.mjs';

test('repo workflow acceptance replay covers the main user-visible workflow families on a fresh fixture', async () => {
  const report = await runRepoWorkflowAcceptanceReplay();

  assert.deepEqual(report.summary, {
    scenarioCount: 6,
    passed: 6,
    failed: 0
  });

  const scenarioMap = new Map(report.scenarios.map((scenario) => [scenario.id, scenario]));
  assert.deepEqual([...scenarioMap.keys()], [
    'workspace-install-from-leaf',
    'sync-dry-run',
    'verify-report',
    'doctor-check-only',
    'active-summary-json',
    'adopt-global-status'
  ]);

  assert.equal(
    scenarioMap.get('workspace-install-from-leaf').stdout.includes(
      'Installed Harness state for codex using workspace scope.'
    ),
    true
  );
  assert.equal(scenarioMap.get('sync-dry-run').stdout.includes('"mode": "dry-run"'), true);
  assert.equal(
    scenarioMap.get('verify-report').verificationReport.markdown.includes('# Harness Verification Report'),
    true
  );
  assert.equal(scenarioMap.get('verify-report').verificationReport.healthProblems, 0);
  assert.equal(scenarioMap.get('doctor-check-only').stdout.includes('Harness check passed.'), true);
  assert.equal(scenarioMap.get('active-summary-json').report.tasks.length, 1);
  assert.equal(scenarioMap.get('active-summary-json').report.tasks[0].task_id, 'workflow-task');
  assert.equal(scenarioMap.get('adopt-global-status').status.status, 'in_sync');
  assert.equal(scenarioMap.get('adopt-global-status').status.scope, 'user-global');
});

test('repo workflow acceptance replay also covers degraded and expected-failure workflow variants', async () => {
  const report = await runRepoWorkflowAcceptanceReplay({ variant: 'degraded' });

  assert.deepEqual(report.summary, {
    scenarioCount: 3,
    passed: 3,
    failed: 0
  });

  const scenarioMap = new Map(report.scenarios.map((scenario) => [scenario.id, scenario]));
  assert.deepEqual([...scenarioMap.keys()], [
    'verify-copilot-overlap-warning',
    'doctor-personal-path-problem',
    'adopt-global-rejects-workspace-state'
  ]);

  assert.equal(
    scenarioMap.get('verify-copilot-overlap-warning').stdout.includes('Scope overlap verdict: warning'),
    true
  );
  assert.equal(
    scenarioMap.get('verify-copilot-overlap-warning').stdout.includes('Recommended action: choose one canonical scope for Copilot'),
    true
  );
  assert.equal(scenarioMap.get('doctor-personal-path-problem').expectedFailure, true);
  assert.equal(
    scenarioMap.get('doctor-personal-path-problem').error.message.includes('personal path found in'),
    true
  );
  assert.equal(scenarioMap.get('adopt-global-rejects-workspace-state').expectedFailure, true);
  assert.equal(
    scenarioMap.get('adopt-global-rejects-workspace-state').error.message.includes('user-global-only'),
    true
  );
});

test('repo workflow acceptance replay also covers lifecycle drift and reconciliation-open variants', async () => {
  const report = await runRepoWorkflowAcceptanceReplay({ variant: 'lifecycle' });

  assert.deepEqual(report.summary, {
    scenarioCount: 3,
    passed: 3,
    failed: 0
  });

  const scenarioMap = new Map(report.scenarios.map((scenario) => [scenario.id, scenario]));
  assert.deepEqual([...scenarioMap.keys()], [
    'active-summary-reconciliation-open',
    'adoption-status-state-mismatch',
    'adoption-status-copilot-overlap'
  ]);

  assert.equal(scenarioMap.get('active-summary-reconciliation-open').report.counts.byReconciliationStatus.open, 1);
  assert.equal(scenarioMap.get('active-summary-reconciliation-open').report.tasks[0].reconciliationStatus, 'open');
  assert.equal(
    scenarioMap
      .get('active-summary-reconciliation-open')
      .report.anomalies.some((anomaly) => anomaly.kind === 'reconciliation_open'),
    true
  );

  assert.equal(scenarioMap.get('adoption-status-state-mismatch').status.status, 'state_mismatch');
  assert.equal(
    scenarioMap
      .get('adoption-status-state-mismatch')
      .status.reasons.some((reason) => /policyProfile/i.test(reason)),
    true
  );
  assert.equal(
    scenarioMap.get('adoption-status-state-mismatch').status.reasons.length >= 1,
    true
  );

  assert.equal(scenarioMap.get('adoption-status-copilot-overlap').status.status, 'needs_apply');
  assert.equal(
    scenarioMap
      .get('adoption-status-copilot-overlap')
      .status.reasons.some((reason) => /workspace copilot projection overlaps user-global/i.test(reason)),
    true
  );
});

test('repo workflow acceptance replay also covers additional targets and trust-boundary guardrails', async () => {
  const report = await runRepoWorkflowAcceptanceReplay({ variant: 'trust-boundary' });

  assert.deepEqual(report.summary, {
    scenarioCount: 3,
    passed: 3,
    failed: 0
  });

  const scenarioMap = new Map(report.scenarios.map((scenario) => [scenario.id, scenario]));
  assert.deepEqual([...scenarioMap.keys()], [
    'adoption-status-claude-code-runtime-reason',
    'install-rejects-user-global-safety-profile',
    'workspace-link-rejects-external-authority-root'
  ]);

  assert.equal(scenarioMap.get('adoption-status-claude-code-runtime-reason').status.status, 'in_sync');
  assert.equal(
    scenarioMap
      .get('adoption-status-claude-code-runtime-reason')
      .status.reasons.some((reason) => /Claude Code runtime hook invocation is not measured/i.test(reason)),
    true
  );

  assert.equal(scenarioMap.get('install-rejects-user-global-safety-profile').expectedFailure, true);
  assert.equal(
    scenarioMap
      .get('install-rejects-user-global-safety-profile')
      .error.message.includes('Safety profiles are workspace-only'),
    true
  );

  assert.equal(scenarioMap.get('workspace-link-rejects-external-authority-root').expectedFailure, true);
  assert.equal(
    scenarioMap
      .get('workspace-link-rejects-external-authority-root')
      .error.message.includes('ancestor authority root'),
    true
  );
});

test('repo workflow acceptance replay also covers additional target combinations and real mixed-scope installs', async () => {
  const report = await runRepoWorkflowAcceptanceReplay({ variant: 'mixed-scope' });

  assert.deepEqual(report.summary, {
    scenarioCount: 3,
    passed: 3,
    failed: 0
  });

  const scenarioMap = new Map(report.scenarios.map((scenario) => [scenario.id, scenario]));
  assert.deepEqual([...scenarioMap.keys()], [
    'workspace-install-cursor-from-leaf',
    'verify-copilot-overlap-after-real-both-install',
    'install-both-codex-defaults-minimal-global'
  ]);

  assert.equal(scenarioMap.get('workspace-install-cursor-from-leaf').state.scope, 'workspace');
  assert.deepEqual(scenarioMap.get('workspace-install-cursor-from-leaf').state.targets, ['cursor']);
  assert.equal(
    scenarioMap
      .get('workspace-install-cursor-from-leaf')
      .state.cursorRulePath.endsWith('.cursor/rules/harness.mdc'),
    true
  );
  assert.equal(
    scenarioMap.get('workspace-install-cursor-from-leaf').verificationReport.markdown.includes('Targets: cursor'),
    true
  );

  assert.equal(
    scenarioMap
      .get('verify-copilot-overlap-after-real-both-install')
      .verificationReport.markdown.includes('Scope overlap verdict: warning'),
    true
  );
  assert.equal(
    scenarioMap
      .get('verify-copilot-overlap-after-real-both-install')
      .verificationReport.markdown.includes('copilot -> workspace + user-global'),
    true
  );

  assert.equal(scenarioMap.get('install-both-codex-defaults-minimal-global').state.scope, 'both');
  assert.equal(
    scenarioMap.get('install-both-codex-defaults-minimal-global').state.skillProfile,
    'minimal-global'
  );
  assert.equal(
    scenarioMap.get('install-both-codex-defaults-minimal-global').verificationReport.markdown.includes('Scope: both'),
    true
  );
  assert.equal(
    scenarioMap.get('install-both-codex-defaults-minimal-global').verificationReport.markdown.includes('Targets: codex'),
    true
  );
});

test('repo workflow acceptance replay also covers additional target-specific install defaults and all-target replay', async () => {
  const report = await runRepoWorkflowAcceptanceReplay({ variant: 'additional-targets' });

  assert.deepEqual(report.summary, {
    scenarioCount: 3,
    passed: 3,
    failed: 0
  });

  const scenarioMap = new Map(report.scenarios.map((scenario) => [scenario.id, scenario]));
  assert.deepEqual([...scenarioMap.keys()], [
    'workspace-install-copilot-default-profile',
    'workspace-install-claude-code-with-hooks',
    'install-both-all-targets'
  ]);

  assert.equal(scenarioMap.get('workspace-install-copilot-default-profile').state.scope, 'workspace');
  assert.equal(
    scenarioMap.get('workspace-install-copilot-default-profile').state.skillProfile,
    'copilot-default'
  );
  assert.deepEqual(
    scenarioMap.get('workspace-install-copilot-default-profile').state.targets,
    ['copilot']
  );
  assert.equal(
    scenarioMap
      .get('workspace-install-copilot-default-profile')
      .verificationReport.markdown.includes('Targets: copilot'),
    true
  );

  assert.equal(scenarioMap.get('workspace-install-claude-code-with-hooks').state.scope, 'workspace');
  assert.equal(scenarioMap.get('workspace-install-claude-code-with-hooks').state.hookMode, 'on');
  assert.deepEqual(
    scenarioMap.get('workspace-install-claude-code-with-hooks').state.targets,
    ['claude-code']
  );
  assert.equal(
    scenarioMap
      .get('workspace-install-claude-code-with-hooks')
      .state.entryPath.endsWith('CLAUDE.md'),
    true
  );
  assert.equal(
    scenarioMap
      .get('workspace-install-claude-code-with-hooks')
      .verificationReport.markdown.includes('Targets: claude-code'),
    true
  );

  assert.equal(scenarioMap.get('install-both-all-targets').state.scope, 'both');
  assert.equal(scenarioMap.get('install-both-all-targets').state.skillProfile, 'minimal-global');
  assert.deepEqual(scenarioMap.get('install-both-all-targets').state.targets.sort(), [
    'claude-code',
    'codex',
    'copilot',
    'cursor'
  ]);
  assert.deepEqual(scenarioMap.get('install-both-all-targets').verificationReport.selectedTargets.sort(), [
    'claude-code',
    'codex',
    'copilot',
    'cursor'
  ]);
  assert.equal(
    scenarioMap.get('install-both-all-targets').verificationReport.markdown.includes('Scope: both'),
    true
  );
});
