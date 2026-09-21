import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = resolve(new URL('../..', import.meta.url).pathname);
const module = join(root, 'harness/core/upstream-overlays/planning-with-files/scripts/linear_lifecycle_sync.py');

async function stage(project, task, dir, event) {
  const code = `import json,sys; sys.path.insert(0, ${JSON.stringify(join(root, 'harness/core/upstream-overlays/planning-with-files/scripts'))}); from linear_lifecycle_sync import stage_lifecycle_sync; print(json.dumps(stage_lifecycle_sync(sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4])))`;
  return exec('python3', ['-c', code, project, task, dir, event]);
}

async function ack(project, task, eventId) {
  const code = `import json,sys; sys.path.insert(0, ${JSON.stringify(join(root, 'harness/core/upstream-overlays/planning-with-files/scripts'))}); from linear_lifecycle_sync import ack_lifecycle_sync; print(json.dumps(ack_lifecycle_sync(sys.argv[1],sys.argv[2],sys.argv[3])))`;
  return exec('python3', ['-c', code, project, task, eventId]);
}

test('stages existing preferred v1 mapping and preserves sync debt', async () => {
  const project = await mkdtemp(join(tmpdir(), 'pwf-sync-'));
  const dir = join(project, 'planning/active/task-a');
  const binding = join(project, 'reports/linear/task-a/linear.json');
  await mkdir(dir, { recursive: true }); await mkdir(join(project, 'reports/linear/task-a'), { recursive: true });
  await writeFile(join(dir, 'progress.md'), 'progress\n'); await writeFile(join(dir, 'task_plan.md'), 'Task ID: task-a\n## Current State\nStatus: closed\n');
  await writeFile(binding, JSON.stringify({ schemaVersion: 1, enabled: true, workspace: {name:'test'}, team: {id:'team'}, project:{id:'project'}, goalIssue:{id:'i'}, executor:'executor:codex-local', taskMap: { 'task-a': { issueId: 'i' } }, sync: { lifecycle: [], pendingRetry: false, lastResult: 'ok' } }));
  const result = JSON.parse((await stage(project, 'task-a', dir, 'close')).stdout);
  assert.equal(result.pendingRetry, true);
  const payload = JSON.parse(await readFile(binding, 'utf8'));
  assert.equal(payload.sync.lastResult, 'failed'); assert.equal(payload.sync.pendingRetry, true);
  assert.equal(payload.sync.lifecycle.event, 'close');
  const acknowledged = JSON.parse((await ack(project, 'task-a', payload.sync.lifecycle.eventId)).stdout);
  assert.equal(acknowledged.ok, true); assert.equal(acknowledged.pendingRetry, false);
});

test('ack clears lifecycle debt only when no prior retry debt existed', async () => {
  const project = await mkdtemp(join(tmpdir(), 'pwf-sync-'));
  const dir = join(project, 'planning/active/task-a'); const binding = join(project, 'reports/linear/task-a/linear.json');
  await mkdir(dir, { recursive: true }); await mkdir(join(project, 'reports/linear/task-a'), { recursive: true }); await writeFile(join(dir, 'progress.md'), ''); await writeFile(join(dir, 'task_plan.md'), 'Task ID: task-a\n## Current State\nStatus: active\n');
  await writeFile(binding, JSON.stringify({ schemaVersion: 1, enabled: true, workspace: {name:'test'}, team: {id:'team'}, project:{id:'project'}, goalIssue:{id:'i'}, executor:'executor:codex-local', taskMap: { 'task-a': {issueId:'i'} }, sync: { pendingRetry: true, lastResult: 'failed' } }));
  const staged = JSON.parse((await stage(project, 'task-a', dir, 'reopen')).stdout); const payload = JSON.parse(await readFile(binding, 'utf8'));
  const result = JSON.parse((await ack(project, 'task-a', payload.sync.lifecycle.eventId)).stdout);
  assert.equal(staged.ok, false); assert.equal(result.pendingRetry, true);
});

test('a stale close acknowledgement cannot clear a newer reopen event', async () => {
  const project = await mkdtemp(join(tmpdir(), 'pwf-sync-'));
  const dir = join(project, 'planning/active/task-a'); const binding = join(project, 'reports/linear/task-a/linear.json');
  await mkdir(dir, { recursive: true }); await mkdir(join(project, 'reports/linear/task-a'), { recursive: true }); await writeFile(join(dir, 'progress.md'), ''); await writeFile(join(dir, 'task_plan.md'), 'Task ID: task-a\n## Current State\nStatus: active\n');
  await writeFile(binding, JSON.stringify({ schemaVersion: 1, enabled: true, workspace: {name:'test'}, team: {id:'team'}, project:{id:'project'}, goalIssue:{id:'i'}, executor:'executor:codex-local', taskMap: { 'task-a': {issueId:'i'} }, sync: { pendingRetry: false, lastResult: 'ok' } }));
  await writeFile(join(dir,'task_plan.md'),'Task ID: task-a\n## Current State\nStatus: closed\n');
  await stage(project, 'task-a', dir, 'close'); const first = JSON.parse(await readFile(binding, 'utf8'));
  const staleId = first.sync.lifecycle.eventId;
  await writeFile(join(dir,'task_plan.md'),'Task ID: task-a\n## Current State\nStatus: active\n');
  await stage(project, 'task-a', dir, 'reopen');
  const result = JSON.parse((await ack(project, 'task-a', staleId)).stdout);
  assert.equal(result.ok, false);
  const latest = JSON.parse(await readFile(binding, 'utf8'));
  assert.equal(latest.sync.lifecycle.event, 'reopen'); assert.equal(latest.sync.pendingRetry, true);
  assert.equal(JSON.parse((await ack(project,'task-a',latest.sync.lifecycle.eventId)).stdout).pendingRetry,false);
});

test('preferred corruption fails closed and records visible diagnostic', async () => {
  const project = await mkdtemp(join(tmpdir(), 'pwf-sync-'));
  const dir = join(project, 'planning/archive/20260101-task-a');
  await mkdir(dir, { recursive: true }); await mkdir(join(project, 'reports/linear/task-a'), { recursive: true });
  await writeFile(join(dir, 'progress.md'), 'progress\n'); await writeFile(join(dir, 'task_plan.md'), 'Task ID: task-a\n## Current State\nStatus: closed\n'); await writeFile(join(project, 'reports/linear/task-a/linear.json'), '{');
  const result = JSON.parse((await stage(project, 'task-a', dir, 'archive')).stdout);
  assert.equal(result.pendingRetry, true);
  assert.match(await readFile(join(dir, 'progress.md'), 'utf8'), /Lifecycle sync staging failed/);
});

test('rejects symlinked metadata and does not fall back', async () => {
  const project = await mkdtemp(join(tmpdir(), 'pwf-sync-'));
  const dir = join(project, 'planning/active/task-a');
  await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'progress.md'), 'progress\n'); await writeFile(join(dir, 'task_plan.md'), 'Task ID: task-a\n## Current State\nStatus: active\n');
  await mkdir(join(project, 'reports/linear'), { recursive: true }); await symlink(dir, join(project, 'reports/linear/task-a'));
  const result = JSON.parse((await stage(project, 'task-a', dir, 'reopen')).stdout);
  assert.equal(result.pendingRetry, true);
});

test('malformed matching binding is never changed by staging',async()=>{
 const project=await mkdtemp(join(tmpdir(),'pwf-invalid-'));const dir=join(project,'planning/active/task-a');const file=join(project,'reports/linear/task-a/linear.json');await mkdir(dir,{recursive:true});await mkdir(join(project,'reports/linear/task-a'),{recursive:true});
 await writeFile(join(dir,'task_plan.md'),'Task ID: task-a\n## Current State\nStatus: closed\n');await writeFile(join(dir,'progress.md'),'');
 for(const payload of [{schemaVersion:2,taskId:'task-a'},{schemaVersion:1,taskMap:{'task-a':{}}}]) {
  const raw=JSON.stringify(payload);await writeFile(file,raw);const r=JSON.parse((await stage(project,'task-a',dir,'close')).stdout);assert.equal(r.ok,false);assert.equal(await readFile(file,'utf8'),raw);
 }
});
