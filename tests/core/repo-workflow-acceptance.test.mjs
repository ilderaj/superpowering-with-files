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

test('repo workflow acceptance replay also covers cross-target sync dry-run previews before any projection is written', async () => {
  const report = await runRepoWorkflowAcceptanceReplay({ variant: 'sync-preview' });

  assert.deepEqual(report.summary, {
    scenarioCount: 3,
    passed: 3,
    failed: 0
  });

  const scenarioMap = new Map(report.scenarios.map((scenario) => [scenario.id, scenario]));
  assert.deepEqual([...scenarioMap.keys()], [
    'sync-dry-run-both-all-targets-from-state',
    'sync-dry-run-both-copilot-hooks-from-state',
    'sync-dry-run-workspace-claude-hooks-from-state'
  ]);

  assert.deepEqual(scenarioMap.get('sync-dry-run-both-all-targets-from-state').dryRunReport.targets.sort(), [
    'claude-code',
    'codex',
    'copilot',
    'cursor'
  ]);
  assert.equal(
    scenarioMap.get('sync-dry-run-both-all-targets-from-state').dryRunState.lastSyncBefore,
    null
  );
  assert.equal(
    scenarioMap.get('sync-dry-run-both-all-targets-from-state').dryRunState.lastSyncAfter,
    null
  );
  assert.equal(
    scenarioMap.get('sync-dry-run-both-all-targets-from-state').dryRunReport.summary.create > 0,
    true
  );
  assert.deepEqual(
    scenarioMap.get('sync-dry-run-both-all-targets-from-state').dryRunReport.createKinds.sort(),
    ['entry', 'skill']
  );
  assert.equal(
    scenarioMap.get('sync-dry-run-both-all-targets-from-state').filesystem.copilotEntryExists,
    false
  );
  assert.equal(
    scenarioMap.get('sync-dry-run-both-all-targets-from-state').filesystem.projectionsManifestExists,
    false
  );

  assert.deepEqual(
    scenarioMap.get('sync-dry-run-both-copilot-hooks-from-state').dryRunReport.targets,
    ['copilot']
  );
  assert.equal(
    scenarioMap.get('sync-dry-run-both-copilot-hooks-from-state').dryRunState.lastSyncAfter,
    null
  );
  assert.equal(
    scenarioMap.get('sync-dry-run-both-copilot-hooks-from-state').dryRunReport.summary.create > 0,
    true
  );
  assert.equal(
    scenarioMap
      .get('sync-dry-run-both-copilot-hooks-from-state')
      .dryRunReport.createKinds.includes('hook-config'),
    true
  );
  assert.equal(
    scenarioMap
      .get('sync-dry-run-both-copilot-hooks-from-state')
      .dryRunReport.createKinds.includes('hook-script'),
    true
  );
  assert.deepEqual(
    scenarioMap.get('sync-dry-run-both-copilot-hooks-from-state').dryRunReport.hookConfigFormats,
    ['hooks']
  );
  assert.equal(
    scenarioMap
      .get('sync-dry-run-both-copilot-hooks-from-state')
      .dryRunReport.hookConfigTargets.some((target) => target.endsWith('.github/hooks/planning-with-files.json')),
    true
  );
  assert.equal(
    scenarioMap
      .get('sync-dry-run-both-copilot-hooks-from-state')
      .dryRunReport.hookConfigTargets.some((target) => target.endsWith('.copilot/hooks/planning-with-files.json')),
    true
  );

  assert.deepEqual(
    scenarioMap.get('sync-dry-run-workspace-claude-hooks-from-state').dryRunReport.targets,
    ['claude-code']
  );
  assert.equal(
    scenarioMap.get('sync-dry-run-workspace-claude-hooks-from-state').dryRunState.lastSyncAfter,
    null
  );
  assert.equal(
    scenarioMap.get('sync-dry-run-workspace-claude-hooks-from-state').dryRunReport.summary.create > 0,
    true
  );
  assert.equal(
    scenarioMap
      .get('sync-dry-run-workspace-claude-hooks-from-state')
      .dryRunReport.createKinds.includes('hook-config'),
    true
  );
  assert.equal(
    scenarioMap
      .get('sync-dry-run-workspace-claude-hooks-from-state')
      .dryRunReport.createKinds.includes('hook-script'),
    true
  );
  assert.deepEqual(
    scenarioMap.get('sync-dry-run-workspace-claude-hooks-from-state').dryRunReport.hookConfigFormats,
    ['settings']
  );
  assert.equal(
    scenarioMap
      .get('sync-dry-run-workspace-claude-hooks-from-state')
      .dryRunReport.hookConfigTargets.some((target) => target.endsWith('.claude/settings.json')),
    true
  );
  assert.equal(
    scenarioMap.get('sync-dry-run-workspace-claude-hooks-from-state').filesystem.claudeEntryExists,
    false
  );
});

test('repo workflow acceptance replay also covers reporting surfaces and read-only audit commands', async () => {
  const report = await runRepoWorkflowAcceptanceReplay({ variant: 'reporting' });

  assert.deepEqual(report.summary, {
    scenarioCount: 3,
    passed: 3,
    failed: 0
  });

  const scenarioMap = new Map(report.scenarios.map((scenario) => [scenario.id, scenario]));
  assert.deepEqual([...scenarioMap.keys()], [
    'sync-check-out-of-sync-from-leaf',
    'summary-task-route-line-with-multiple-active-tasks',
    'token-audit-weekly-summary'
  ]);

  assert.equal(scenarioMap.get('sync-check-out-of-sync-from-leaf').expectedFailure, true);
  assert.equal(
    scenarioMap
      .get('sync-check-out-of-sync-from-leaf')
      .error.message.includes('Harness sync check failed: projections are out of sync'),
    true
  );
  assert.equal(scenarioMap.get('sync-check-out-of-sync-from-leaf').filesystem.entryExists, false);
  assert.equal(
    scenarioMap.get('sync-check-out-of-sync-from-leaf').filesystem.projectionsManifestExists,
    false
  );

  assert.equal(
    scenarioMap
      .get('summary-task-route-line-with-multiple-active-tasks')
      .stdout.includes('Task: Demo Task (demo-task)'),
    true
  );
  assert.equal(
    scenarioMap
      .get('summary-task-route-line-with-multiple-active-tasks')
      .stdout.includes('Route: tracked-lean - durable task without deep reasoning'),
    true
  );

  assert.equal(scenarioMap.get('token-audit-weekly-summary').stdout.includes('# Weekly token audit'), true);
  assert.equal(scenarioMap.get('token-audit-weekly-summary').stdout.includes('Total tokens: 400'), true);
  assert.equal(
    scenarioMap.get('token-audit-weekly-summary').stdout.includes('goal-round-start-protocol (heuristic)'),
    true
  );
  assert.equal(
    scenarioMap
      .get('token-audit-weekly-summary')
      .stdout.includes('SuperpoweringWithFiles (/workspace/SuperpoweringWithFiles)'),
    true
  );
});

test('repo workflow acceptance replay also covers execution-receipt lifecycle governance on active-summary surfaces', async () => {
  const report = await runRepoWorkflowAcceptanceReplay({ variant: 'execution-lifecycle' });

  assert.deepEqual(report.summary, {
    scenarioCount: 3,
    passed: 3,
    failed: 0
  });

  const scenarioMap = new Map(report.scenarios.map((scenario) => [scenario.id, scenario]));
  assert.deepEqual([...scenarioMap.keys()], [
    'active-summary-blocked-execution-open-followup',
    'active-summary-failed-execution-unit',
    'active-summary-resolved-followup-closure'
  ]);

  const blockedReport = scenarioMap.get('active-summary-blocked-execution-open-followup').report;
  const blockedTask = blockedReport.tasks.find((task) => task.task_id === 'task-execution-blocked');
  assert.equal(blockedTask.executionSignals.receiptCount, 1);
  assert.equal(blockedTask.executionSignals.blockedUnits, 1);
  assert.equal(blockedTask.executionSignals.openFollowups, 1);
  assert.equal(
    blockedReport.anomalies.some(
      (anomaly) =>
        anomaly.taskId === 'task-execution-blocked' && anomaly.kind === 'execution_receipt_blocked'
    ),
    true
  );
  assert.equal(
    blockedReport.anomalies.some(
      (anomaly) =>
        anomaly.taskId === 'task-execution-blocked' && anomaly.kind === 'execution_followup_open'
    ),
    true
  );

  const failedReport = scenarioMap.get('active-summary-failed-execution-unit').report;
  const failedTask = failedReport.tasks.find((task) => task.task_id === 'task-execution-failed');
  assert.equal(failedTask.executionSignals.receiptCount, 1);
  assert.equal(failedTask.executionSignals.failedUnits, 1);
  assert.equal(
    failedReport.anomalies.some(
      (anomaly) =>
        anomaly.taskId === 'task-execution-failed' && anomaly.kind === 'execution_receipt_failed'
    ),
    true
  );

  const resolvedReport = scenarioMap.get('active-summary-resolved-followup-closure').report;
  const resolvedTask = resolvedReport.tasks.find((task) => task.task_id === 'task-followup-resolved');
  assert.equal(resolvedTask.executionSignals.openFollowups, 0);
  assert.equal(resolvedTask.executionSignals.resolvedFollowups, 1);
  assert.equal(resolvedTask.executionSignals.waivedFollowups, 0);
  assert.equal(
    resolvedReport.anomalies.some(
      (anomaly) =>
        anomaly.taskId === 'task-followup-resolved' && anomaly.kind === 'execution_followup_open'
    ),
    false
  );
});

test('repo workflow acceptance replay also covers companion drift and placeholder reconciliation governance on active-summary surfaces', async () => {
  const report = await runRepoWorkflowAcceptanceReplay({ variant: 'companion-reconciliation' });

  assert.deepEqual(report.summary, {
    scenarioCount: 3,
    passed: 3,
    failed: 0
  });

  const scenarioMap = new Map(report.scenarios.map((scenario) => [scenario.id, scenario]));
  assert.deepEqual([...scenarioMap.keys()], [
    'active-summary-archive-ready-companion-blocker',
    'active-summary-active-companion-drift-warning',
    'active-summary-placeholder-reconciliation-open'
  ]);

  const blockedReport = scenarioMap.get('active-summary-archive-ready-companion-blocker').report;
  const readyTask = blockedReport.tasks.find((task) => task.task_id === 'task-ready');
  const blockedTask = blockedReport.tasks.find((task) => task.task_id === 'task-blocked');
  assert.equal(readyTask.archive_ready, true);
  assert.equal(blockedTask.archive_ready, false);
  assert.equal(blockedTask.companion.ok, false);
  assert.equal(
    blockedTask.companion.reasons.some((reason) => /Lifecycle state 'active' does not match expected 'closed'/.test(reason)),
    true
  );

  const driftReport = scenarioMap.get('active-summary-active-companion-drift-warning').report;
  const driftTask = driftReport.tasks.find((task) => task.task_id === 'task-active-drift');
  assert.equal(driftTask.archive_ready, false);
  assert.equal(driftTask.companion.has_companion, true);
  assert.equal(driftTask.companion.ok, false);
  assert.equal(
    driftReport.anomalies.some(
      (anomaly) => anomaly.taskId === 'task-active-drift' && anomaly.kind === 'companion_sync_warning'
    ),
    true
  );

  const placeholderReport = scenarioMap.get('active-summary-placeholder-reconciliation-open').report;
  const placeholderTasks = ['blank-artifact', 'template-artifact', 'placeholder-progress']
    .map((taskId) => placeholderReport.tasks.find((entry) => entry.task_id === taskId));
  assert.equal(
    placeholderTasks.filter((task) => task.reconciliationStatus === 'open').length,
    3
  );
  for (const taskId of ['blank-artifact', 'template-artifact', 'placeholder-progress']) {
    const task = placeholderReport.tasks.find((entry) => entry.task_id === taskId);
    assert.equal(task.reconciliationStatus, 'open');
    assert.equal(task.reconciliationReady, false);
    assert.equal(
      placeholderReport.anomalies.some(
        (anomaly) => anomaly.taskId === taskId && anomaly.kind === 'reconciliation_open'
      ),
      true
    );
  }
});

test('repo workflow acceptance replay also covers workspace-link recovery for nested git leaf workspaces', async () => {
  const report = await runRepoWorkflowAcceptanceReplay({ variant: 'workspace-link' });

  assert.deepEqual(report.summary, {
    scenarioCount: 3,
    passed: 3,
    failed: 0
  });

  const scenarioMap = new Map(report.scenarios.map((scenario) => [scenario.id, scenario]));
  assert.deepEqual([...scenarioMap.keys()], [
    'workspace-link-restores-parent-status-across-git-boundary',
    'workspace-link-rewrites-bogus-override-and-restores-summary',
    'workspace-link-routes-install-and-sync-back-to-parent-authority-root'
  ]);

  const statusReplay = scenarioMap.get('workspace-link-restores-parent-status-across-git-boundary');
  assert.equal(statusReplay.authority.beforeSource, 'git-top-level');
  assert.equal(statusReplay.authority.afterSource, 'override-file');
  assert.equal(statusReplay.status.beforeFailed, true);
  assert.equal(
    statusReplay.status.beforeFailureMessage.includes('platforms.json'),
    true
  );
  assert.equal(statusReplay.status.afterCodexEntryCount >= 1, true);
  assert.equal(statusReplay.status.afterCodexEntryPath.endsWith('AGENTS.md'), true);

  const summaryReplay = scenarioMap.get('workspace-link-rewrites-bogus-override-and-restores-summary');
  assert.equal(summaryReplay.authority.source, 'override-file');
  assert.equal(summaryReplay.summary.includes('Task: Workflow Task (workflow-task)'), true);

  const installReplay = scenarioMap.get(
    'workspace-link-routes-install-and-sync-back-to-parent-authority-root'
  );
  assert.equal(installReplay.authority.source, 'override-file');
  assert.equal(installReplay.state.scope, 'workspace');
  assert.deepEqual(installReplay.state.targets, ['cursor']);
  assert.equal(installReplay.state.leafStateExists, false);
  assert.equal(installReplay.state.cursorRuleRootExists, true);
  assert.equal(installReplay.state.cursorRuleLeafExists, false);
  assert.equal(installReplay.verificationReport.markdown.includes('Targets: cursor'), true);
});
