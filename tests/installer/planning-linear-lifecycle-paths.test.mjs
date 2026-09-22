import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, lstat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = resolve(new URL('../..', import.meta.url).pathname);
const scripts = join(root, 'harness/core/upstream-overlays/planning-with-files/scripts');
const plan = (id) => `# Task\n\n## Current State\nTask ID: ${id}\nStatus: active\nArchive Eligible: no\nReconcile: not_required\n\n## Goal\nKeep history.\n`;

async function run(file, ...args) {
  return exec(file.endsWith('.py') ? 'python3' : 'bash', [join(scripts, file), ...args], { cwd: root });
}

test('stable task id survives timestamp archive and exact reopen', async () => {
  const project = await mkdtemp(join(tmpdir(), 'pwf-lifecycle-'));
  await mkdir(join(project, 'planning/active/task-alpha'), { recursive: true });
  await writeFile(join(project, 'planning/active/task-alpha/task_plan.md'), plan('task-alpha'));
  await writeFile(join(project, 'planning/active/task-alpha/findings.md'), 'findings');
  await writeFile(join(project, 'planning/active/task-alpha/progress.md'), 'progress');
  await run('close-task.py', project, 'task-alpha', '--reason', 'done');
  const { stdout } = await run('archive-task.sh', project, 'task-alpha');
  const archive = stdout.match(/planning\/archive\/[^\n]+/)?.[0];
  assert.ok(archive);
  const archived = join(project, archive);
  assert.match(await readFile(join(archived, 'task_plan.md'), 'utf8'), /Task ID: task-alpha/);
  await run('reopen-task.py', project, archived);
  assert.match(await readFile(join(project, 'planning/active/task-alpha/task_plan.md'), 'utf8'), /Status: active/);
  assert.doesNotMatch(await readFile(join(project, 'planning/active/task-alpha/task_plan.md'), 'utf8'), /Archive Eligible: yes/);
});

test('reopen rejects ambiguous identity, unsafe paths, and symlinks', async () => {
  const project = await mkdtemp(join(tmpdir(), 'pwf-lifecycle-'));
  await mkdir(join(project, 'planning/active/task-alpha'), { recursive: true });
  await mkdir(join(project, 'planning/archive/20260101-task-alpha'), { recursive: true });
  await writeFile(join(project, 'planning/active/task-alpha/task_plan.md'), plan('task-alpha'));
  await writeFile(join(project, 'planning/archive/20260101-task-alpha/task_plan.md'), plan('task-alpha'));
  await assert.rejects(run('reopen-task.py', project, join(project, 'planning/archive/20260101-task-alpha')));
  await symlink(join(project, 'planning/active/task-alpha'), join(project, 'planning/archive/link'));
  await assert.rejects(run('reopen-task.py', project, join(project, 'planning/archive/link')));
});

test('reopen updates accepted Current State heading variants', async () => {
  const project = await mkdtemp(join(tmpdir(), 'pwf-reopen-heading-'));
  const archived = join(project, 'planning/archive/20260101-heading');
  await mkdir(archived, { recursive: true });
  await writeFile(join(archived, 'task_plan.md'), `# Task\n\n##  Current State\nTask ID: heading\nStatus: closed\nArchive Eligible: yes\nClose Reason: done\n\n## Goal\nKeep history.\n`);
  await writeFile(join(archived, 'findings.md'), 'findings');
  await writeFile(join(archived, 'progress.md'), 'progress');
  await run('reopen-task.py', project, archived);
  assert.match(await readFile(join(project, 'planning/active/heading/task_plan.md'), 'utf8'), /^Status: active$/m);
});

test('legacy archive validation does not mutate an unsafe task plan', async () => {
  const project = await mkdtemp(join(tmpdir(), 'pwf-legacy-'));
  const dir = join(project, 'planning/active/foo:bar');
  await mkdir(dir, { recursive: true });
  const original = `# Task\n\n## Current State\nStatus: active\nArchive Eligible: no\n\n## Goal\nKeep history.\n`;
  await writeFile(join(dir, 'task_plan.md'), original);
  await assert.rejects(run('archive-task.sh', project, 'foo:bar'));
  assert.equal(await readFile(join(dir, 'task_plan.md'), 'utf8'), original);
});

test('archived preferred metadata uses explicit stable id and corrupt preferred fails closed', async () => {
  const project = await mkdtemp(join(tmpdir(), 'pwf-linear-'));
  const archived = join(project, 'planning/archive/20260101-task-alpha');
  await mkdir(archived, { recursive: true });
  await writeFile(join(archived, 'task_plan.md'), plan('task-alpha'));
  await mkdir(join(project, 'reports/linear/task-alpha'), { recursive: true });
  await writeFile(join(project, 'reports/linear/task-alpha/linear.json'), '{');
  await assert.rejects(exec('node', [join(root, 'harness/core/skills/linear-work-control/scripts/linear-work-control.mjs'), 'resume-brief', '--dir', archived], { cwd: root }));
});

test('active binding resolver rejects mismatched or duplicate stable IDs', async()=>{
 const project=await mkdtemp(join(tmpdir(),'pwf-identity-'));const dir=join(project,'planning/active/task-b');await mkdir(dir,{recursive:true});
 const cli=join(root,'harness/core/skills/linear-work-control/scripts/linear-work-control.mjs');
 for(const text of [plan('task-a'),plan('task-b')+'\nTask ID: task-b\n']) {
  await writeFile(join(dir,'task_plan.md'),text);
  await assert.rejects(exec('node',[cli,'resume-brief','--dir',dir]));
 }
});
