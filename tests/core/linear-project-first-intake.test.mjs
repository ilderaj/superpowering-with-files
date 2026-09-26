import test from 'node:test';
import assert from 'node:assert/strict';
import { planProjectBootstrap } from '../../harness/core/skills/linear-work-control/lib/project-bootstrap.mjs';
import { planIntake } from '../../harness/core/skills/linear-work-control/lib/project-routing.mjs';

// Fault-injection locks for LMP-04 first-time enrollment of a brand-new product/repo.
// The helpers are pure: these tests exercise the caller-visible protocol when the
// Linear create response is lost, when Team/Project creation is incomplete, and when
// coverage or permission evidence is missing. Nothing here calls Linear or Git.

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const WS = id(1), TEAM = id(2), PROJECT = id(3), FOREIGN_TEAM = id(9);

const policy = () => ({
  schemaVersion: 1,
  workspaceId: WS,
  teamId: TEAM,
  productKey: 'loffi',
  canonicalRoot: '/repo',
  gitCommonDir: '/repo/.git',
  defaultProjectId: PROJECT,
  projects: [{ id: PROJECT, key: 'main', workstreamLabel: 'workstream:main' }],
  managedLabel: 'swf-managed',
  executorLabel: 'executor:codex-local'
});

const marker = 'productKey: loffi; projectKey: main';

/** Enrollment planner input for a brand-new product with no Project yet. */
const bootstrapInput = (overrides = {}) => {
  const input = {
    request: { productKey: 'loffi', productName: 'Löffi', explicitEnrollment: true },
    policy: { workspaceId: WS, teamId: TEAM, defaultProjectId: null },
    rootEvidence: { canonicalRoot: '/repo', gitCommonDir: '/repo/.git' },
    catalog: {
      complete: true, paginationComplete: true, projectOwnershipComplete: true,
      workspaceId: WS,
      teams: [{ id: TEAM, workspaceId: WS, fullyRead: true }],
      projects: []
    }
  };
  return { ...input, ...overrides, catalog: { ...input.catalog, ...(overrides.catalog || {}) } };
};

const createdProject = (overrides = {}) => ({
  id: PROJECT, workspaceId: WS, teamId: TEAM, fullyRead: true,
  statusType: 'started', archived: false, description: marker, ...overrides
});

/** Intake snapshot for the new product; `projectExists:false` models a lost Project create. */
const snapshot = ({ projectExists = true, issues = [], projectCatalog } = {}) => ({
  workspaceId: WS, teamId: TEAM,
  complete: true, paginationComplete: true, markerSearchComplete: true,
  projectOwnershipComplete: true,
  projectCatalog: projectCatalog || (projectExists ? [{ id: PROJECT, workspaceId: WS, fullyRead: true, description: marker }] : []),
  projects: projectExists
    ? [{ id: PROJECT, workspaceId: WS, teamId: TEAM, fullyRead: true, description: marker, statusType: 'started', archived: false }]
    : [],
  issues
});

const taskMarker = 'harness-task: loffi/demo-task';
const existingIssue = (overrides = {}) => ({
  issueId: id(20), identifier: 'LOF-1', workspaceId: WS, teamId: TEAM, projectId: PROJECT,
  fullyRead: true, parent: null, taskMarker, statusType: 'unstarted', queued: false,
  labels: ['swf-managed', 'executor:codex-local', 'workstream:main'], ...overrides
});

test('brand-new product: zero match creates once, and a lost create response reuses the recorded Project', () => {
  const first = planProjectBootstrap(bootstrapInput());
  assert.equal(first.ok, true);
  assert.equal(first.action, 'create');
  assert.equal(first.projectKey, 'main');
  assert.equal(first.description, marker);
  // No external write is implied by the proposal itself.
  assert.deepEqual(first.write, { api: false, rootRegistration: false });

  // The create response was lost; the retry sees the Project that now exists.
  const retry = planProjectBootstrap(bootstrapInput({ catalog: { projects: [createdProject()] } }));
  assert.equal(retry.ok, true);
  assert.equal(retry.action, 'reuse');
  assert.equal(retry.projectId, PROJECT);
});

test('lost create response: a duplicated or foreign-team marker fails closed instead of creating a second Project', () => {
  const duplicated = planProjectBootstrap(bootstrapInput({
    catalog: { projects: [createdProject(), createdProject({ id: id(4) })] }
  }));
  assert.equal(duplicated.ok, false);

  // The created Project landed under another Team: ownership conflicts, no second create.
  const foreign = planProjectBootstrap(bootstrapInput({
    catalog: { projects: [createdProject({ teamId: FOREIGN_TEAM })] }
  }));
  assert.equal(foreign.ok, false);
  assert.match(foreign.errors.join(' '), /another team/);
});

test('incomplete Team creation leaves nothing to write into: bootstrap denies and issue intake has no Project', () => {
  // Team membership unverified or absent -> no Project proposal at all.
  for (const teams of [[{ id: TEAM, workspaceId: WS, fullyRead: false }], [], [{ id: FOREIGN_TEAM, workspaceId: WS, fullyRead: true }]]) {
    const result = planProjectBootstrap(bootstrapInput({ catalog: { teams } }));
    assert.equal(result.ok, false);
    assert.equal(result.action, undefined);
  }

  // Project not created yet (Team creation unfinished): the issue plan is denied too,
  // so the caller cannot write an issue before the Project exists.
  const notYet = planIntake({ policy: policy(), snapshot: snapshot({ projectExists: false }), taskId: 'demo-task', taskMarker });
  assert.equal(notYet.ok, false);
  assert.equal(notYet.decision, 'DENY');
});

test('setup-needed: partial coverage, unknown root, or non-explicit enrollment produces no create', () => {
  const cases = [
    { catalog: { paginationComplete: false } },
    { catalog: { projectOwnershipComplete: false } },
    { catalog: { complete: false } },
    { rootEvidence: { canonicalRoot: 'unknown', gitCommonDir: '/repo/.git' } },
    { request: { productKey: 'loffi', productName: 'Löffi', explicitEnrollment: false } }
  ];
  for (const change of cases) {
    const result = planProjectBootstrap(bootstrapInput(change));
    assert.equal(result.ok, false, JSON.stringify(change));
    assert.equal(result.action, undefined);
  }
});

test('plain questions and folder discovery alone never trigger enrollment or intake', () => {
  // No explicit enrollment intent -> the planner refuses even with a perfect catalog.
  const qa = planProjectBootstrap(bootstrapInput({
    request: { productKey: 'loffi', productName: 'Löffi', explicitEnrollment: false },
    catalog: { projects: [createdProject()] }
  }));
  assert.equal(qa.ok, false);

  // Intake needs the exact ownership marker; "quick work" carries none.
  const noMarker = planIntake({ policy: policy(), snapshot: snapshot(), taskId: 'demo-task', taskMarker: null });
  assert.equal(noMarker.ok, false);
  assert.equal(noMarker.decision, 'DENY');
});

test('issue intake for a brand-new Project: first create carries the exact marker, a lost response reuses the same issue', () => {
  const plan = { policy: policy(), snapshot: snapshot(), taskId: 'demo-task', taskMarker };
  const first = planIntake(plan);
  assert.equal(first.ok, true);
  assert.equal(first.planOnly, true);
  assert.equal(first.action, 'create');
  assert.equal(first.projectId, PROJECT);
  assert.equal(first.taskMarker, taskMarker);
  assert.deepEqual(first.labels, ['swf-managed', 'executor:codex-local', 'workstream:main']);

  // Lost issue create response: the retry reads the exact marker back and reuses it.
  const retry = planIntake({ ...plan, snapshot: snapshot({ issues: [existingIssue()] }) });
  assert.equal(retry.ok, true);
  assert.equal(retry.action, 'reuse');
  assert.equal(retry.issueId, id(20));
});

test('recovery readback rejects duplicate markers instead of guessing which object to reuse', () => {
  const duplicated = planIntake({
    policy: policy(),
    snapshot: snapshot({ issues: [existingIssue(), existingIssue({ issueId: id(21), identifier: 'LOF-2' })] }),
    taskId: 'demo-task', taskMarker
  });
  assert.equal(duplicated.ok, false);
  assert.equal(duplicated.decision, 'DENY');
});

test('a binding that disagrees with the marker-covered issue is rejected, never silently re-pointed', () => {
  const mismatched = planIntake({
    policy: policy(),
    snapshot: snapshot({ issues: [existingIssue({ issueId: id(22) })] }),
    taskId: 'demo-task', taskMarker,
    binding: { issueId: id(20), projectId: PROJECT, teamId: TEAM }
  });
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.decision, 'DENY');
});

