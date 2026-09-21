import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { planProjectBootstrap } from '../../harness/core/skills/linear-work-control/lib/project-bootstrap.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = () => ({
  request: { productKey: 'loffi', productName: 'Löffi', explicitEnrollment: true },
  policy: { workspaceId: id(1), teamId: id(2), defaultProjectId: null },
  rootEvidence: { canonicalRoot: '/repo', gitCommonDir: '/repo/.git' },
  catalog: {
    complete: true, paginationComplete: true, projectOwnershipComplete: true,
    workspaceId: id(1),
    teams: [{ id: id(2), workspaceId: id(1), fullyRead: true }],
    projects: []
  }
});
const project = (overrides = {}) => ({
  id: id(3), workspaceId: id(1), teamId: id(2), fullyRead: true,
  statusType: 'started', archived: false,
  description: 'productKey: loffi; projectKey: main', ...overrides
});

test('zero match plans one default Project with exact ownership and no writes', () => {
  const result = planProjectBootstrap(base());
  assert.equal(result.ok, true);
  assert.equal(result.action, 'create');
  assert.equal(result.projectKey, 'main');
  assert.equal(result.name, 'Löffi — Work');
  assert.equal(result.description, 'productKey: loffi; projectKey: main');
  assert.deepEqual(result.write, { api: false, rootRegistration: false });
});

test('one unique active match is reused and existing default preserves routing', () => {
  const input = base();
  input.catalog.projects = [project()];
  input.policy.defaultProjectId = id(3);
  const result = planProjectBootstrap(input);
  assert.deepEqual({ ok: result.ok, action: result.action, projectId: result.projectId }, { ok: true, action: 'reuse', projectId: id(3) });
});

test('duplicate marker, selected foreign project, and closed project fail closed', () => {
  for (const projects of [
    [project(), project({ id: id(4) })],
    [project({ statusType: 'completed' })]
  ]) {
    const input = base(); input.catalog.projects = projects;
    assert.equal(planProjectBootstrap(input).ok, false);
  }
});

test('partial catalogs, unknown roots, and missing explicit enrollment fail closed', () => {
  for (const change of [
    { catalog: { ...base().catalog, paginationComplete: false } },
    { rootEvidence: { canonicalRoot: 'unknown', gitCommonDir: '/repo/.git' } },
    { request: { ...base().request, explicitEnrollment: false } },
    { catalog: { ...base().catalog, teams: [] } }
  ]) assert.equal(planProjectBootstrap({ ...base(), ...change }).ok, false);
});

test('new delivery stream requires explicit key and never creates implicit extra streams', () => {
  const input = base();
  input.request.stream = { requested: true, key: 'ops', name: 'Operations' };
  const result = planProjectBootstrap(input);
  assert.equal(result.ok, true);
  assert.equal(result.action, 'create');
  assert.equal(result.projectKey, 'ops');
  assert.equal(planProjectBootstrap(base()).projectKey, 'main');
});

test('foreign product ownership and incomplete selected metadata fail closed', () => {
  for (const p of [project({ description: 'productKey: other; projectKey: main' }), project({ fullyRead: false })]) {
    const input = base(); input.policy.defaultProjectId = id(3); input.catalog.projects = [p];
    assert.equal(planProjectBootstrap(input).ok, false);
  }
});

test('existing policy default is reused only when its exact marker and active state agree', () => {
  const input = base();
  input.policy.defaultProjectId = id(3);
  input.catalog.projects = [project({ id: id(4) })];
  assert.equal(planProjectBootstrap(input).ok, false);
  input.catalog.projects = [project({ statusType: 'completed' })];
  assert.equal(planProjectBootstrap(input).ok, false);
});

test('existing default core is reused without a stream, while an explicit stream is independent', () => {
  const input = base();
  input.request.productKey = 'swf';
  input.policy.defaultProjectId = id(3);
  input.catalog.projects = [project({ description: 'productKey: swf; projectKey: core' })];
  assert.deepEqual(planProjectBootstrap(input).projectKey, 'core');
  input.request.stream = { requested: true, key: 'render' };
  assert.deepEqual(planProjectBootstrap(input), { ok: true, action: 'create', projectKey: 'render', name: 'Löffi — Work', description: 'productKey: swf; projectKey: render', workspaceId: id(1), teamId: id(2), write: { api: false, rootRegistration: false } });
});

test('unrelated workspace projects may be foreign-team or empty, while selected evidence is strict', () => {
  const input = base();
  input.catalog.projects = [
    { id: id(8), workspaceId: id(1), teamId: id(9), fullyRead: true, description: '' },
    project()
  ];
  assert.equal(planProjectBootstrap(input).action, 'reuse');
  input.catalog.projects[1].statusType = 'unknown';
  assert.equal(planProjectBootstrap(input).ok, false);
  input.catalog.projects[1].statusType = 'started';
  input.catalog.projects[1].description = ' productKey: loffi; projectKey: main\nextra';
  assert.equal(planProjectBootstrap(input).action, 'create');
  input.catalog.projects[1].description = 'productKey: loffi; projectKey: main\nproductKey: loffi; projectKey: duplicate';
  assert.equal(planProjectBootstrap(input).action, 'reuse');
});

test('catalog completeness is global and other-team ownership conflicts block creation', () => {
  const input = base();
  input.catalog.projects = [{ id: id(8), workspaceId: id(1), teamId: id(9), fullyRead: true, description: '' }];
  assert.equal(planProjectBootstrap(input).action, 'create');
  input.request.stream = { requested: true, key: 'render' };
  input.catalog.projects[0].description = 'productKey: loffi; projectKey: render';
  assert.equal(planProjectBootstrap(input).ok, false);
  input.catalog.projects[0].description = '';
  input.catalog.projects[0].fullyRead = false;
  assert.equal(planProjectBootstrap(input).ok, false);
  input.catalog.projects[0].fullyRead = true;
  input.catalog.projects[0].workspaceId = id(9);
  assert.equal(planProjectBootstrap(input).ok, false);
});

test('default Project must be exact owned target and duplicate keys are rejected before selection', () => {
  const input = base();
  input.policy.defaultProjectId = id(3);
  input.catalog.projects = [project({ description: 'productKey: loffi; projectKey: main' }), project({ id: id(4) })];
  assert.equal(planProjectBootstrap(input).ok, false);
  input.catalog.projects = [project({ teamId: id(9) })];
  assert.equal(planProjectBootstrap(input).ok, false);
  input.catalog.projects = [project({ description: '' })];
  assert.equal(planProjectBootstrap(input).ok, false);
});

test('only selected Project status is checked and accepted active types are bounded', () => {
  const input = base();
  input.catalog.projects = [project({ statusType: 'completed' }), project({ id: id(4), description: 'productKey: loffi; projectKey: ops', statusType: 'backlog' })];
  input.request.stream = { requested: true, key: 'ops' };
  assert.equal(planProjectBootstrap(input).action, 'reuse');
  for (const statusType of ['unknown', 'unstarted', 'triage']) {
    input.catalog.projects[1].statusType = statusType;
    assert.equal(planProjectBootstrap(input).ok, false);
  }
});

test('canonical CLI reads --input and emits the same pure proposal', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'project-bootstrap-'));
  const file = path.join(dir, 'input.json');
  try {
    await writeFile(file, JSON.stringify(base()));
    const result = spawnSync(process.execPath, ['harness/core/skills/linear-work-control/scripts/project-routing.mjs', 'bootstrap-project', '--input', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), planProjectBootstrap(base()));
    const help = spawnSync(process.execPath, ['harness/core/skills/linear-work-control/scripts/project-routing.mjs', '--help'], { encoding: 'utf8' });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /bootstrap-project --input/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('ownership keys are product scoped; same product under another team denies duplication',()=>{
 const x=base();x.request.stream={requested:true,key:'main'};x.catalog.projects=[project({description:'productKey: other; projectKey: main'})];
 assert.equal(planProjectBootstrap(x).ok,true);
 x.catalog.projects=[project({teamId:id(9)})];assert.equal(planProjectBootstrap(x).ok,false);
 delete x.request.stream;assert.equal(planProjectBootstrap(x).ok,false);
 for(const field of ['complete','paginationComplete','projectOwnershipComplete']) {const y=base();y.catalog[field]='true';assert.equal(planProjectBootstrap(y).ok,false);}
});
