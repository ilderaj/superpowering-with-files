import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, access, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  PRODUCT_CONFIG_SCHEMA_VERSION,
  TASK_BINDING_SCHEMA_VERSION,
  detectDuplicateProductKeys,
  validateProductConfig,
  validateTaskBinding,
  verifyRepoFamily
} from '../../harness/core/skills/linear-work-control/lib/linear-product-binding.mjs';
import { validateBinding } from '../../harness/core/skills/linear-work-control/lib/linear-work-control.mjs';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const cli = path.join(projectRoot, 'harness/core/skills/linear-work-control/scripts/linear-work-control.mjs');

const product = {
  schemaVersion: PRODUCT_CONFIG_SCHEMA_VERSION,
  kind: 'product-config',
  productKey: 'swf',
  workspaceId: 'workspace-1',
  teamId: 'team-1',
  allowedProjectIds: ['project-1'],
  hostProjectId: null,
  executionMode: 'manual',
  labelIds: { managed: 'label-managed' },
  statusIds: { ready: 'status-ready' }
};

const task = {
  schemaVersion: TASK_BINDING_SCHEMA_VERSION,
  kind: 'task-binding',
  productKey: 'swf',
  taskId: 'example-task',
  configVersion: 2,
  workspaceId: 'workspace-1',
  teamId: 'team-1',
  projectId: 'project-1',
  issueId: 'issue-1',
  statusCommentId: 'comment-1',
  rootRegistrationId: 'root-1'
};

const rootRegistration = {
  schemaVersion: 2,
  kind: 'repo-root-registration',
  registrationId: 'root-1',
  productKey: 'swf',
  canonicalRepoId: 'repo-1',
  canonicalRoot: '/unfilled',
  gitCommonDir: '/unfilled/.git'
};

async function runCli(args, options = {}) {
  try {
    const result = await execFileAsync(process.execPath, [cli, ...args], {
      cwd: projectRoot,
      input: options.input,
      env: { ...process.env, ...(options.env || {}) },
      maxBuffer: 1024 * 1024
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout || '', stderr: error.stderr || '' };
  }
}

async function git(cwd, ...args) {
  await execFileAsync('git', args, { cwd });
}

async function fixture(t) {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'swf-lmp02-repo-'));
  t.after(() => rm(repo, { recursive: true, force: true }));
  await mkdir(path.join(repo, '.harness/linear'), { recursive: true });
  await mkdir(path.join(repo, 'planning/active/example-task'), { recursive: true });
  await mkdir(path.join(repo, 'reports/linear/example-task'), { recursive: true });
  await git(repo, 'init', '-q');
  await git(repo, 'config', 'user.email', 'test@example.test');
  await git(repo, 'config', 'user.name', 'Test');
  await writeFile(path.join(repo, 'README.md'), 'fixture\n');
  await git(repo, 'add', 'README.md');
  await git(repo, 'commit', '-qm', 'fixture');
  const common = await execFileAsync('git', ['rev-parse', '--git-common-dir'], { cwd: repo });
  rootRegistration.canonicalRoot = repo;
  rootRegistration.gitCommonDir = path.resolve(repo, common.stdout.trim());
  await writeFile(path.join(repo, '.harness/linear/project.json'), JSON.stringify(product, null, 2));
  await writeFile(path.join(repo, '.harness/linear/root-registration.json'), JSON.stringify(rootRegistration, null, 2));
  await writeFile(path.join(repo, 'reports/linear/example-task/linear.json'), JSON.stringify(task, null, 2));
  await writeFile(path.join(repo, 'planning/active/example-task/linear.json'), JSON.stringify({
    schemaVersion: 1,
    enabled: true,
    workspace: { name: 'legacy' }
  }, null, 2));
  return { repo };
}

test('v2 product and task schemas are strict while v1 remains readable by the old validator', () => {
  assert.equal(validateProductConfig(product).ok, true);
  assert.equal(validateTaskBinding(task).ok, true);
  assert.equal(validateBinding({ schemaVersion: 1, enabled: true, workspace: { name: 'legacy' } }).ok, true);
  assert.equal(validateProductConfig({ ...product, unexpected: true }).ok, false);
  assert.equal(validateTaskBinding({ ...task, token: 'forbidden' }).ok, false);
});

test('duplicate product identity is rejected', () => {
  const result = detectDuplicateProductKeys([product, { ...product, teamId: 'team-2' }]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /duplicate productKey.*swf/i);
});

test('resolver rejects duplicate product identity in the local product registry', async (t) => {
  const { repo } = await fixture(t);
  await mkdir(path.join(repo, '.harness/linear/products'), { recursive: true });
  await writeFile(path.join(repo, '.harness/linear/products/duplicate.json'), JSON.stringify({ ...product, teamId: 'team-2' }));
  const result = await runCli(['resolve-product-binding', '--repo-root', repo, '--json']);
  assert.equal(result.code, 1);
  assert.match(JSON.parse(result.stdout).error, /duplicate productKey.*swf/i);
});

test('resolver prefers reports/linear and refuses malformed preferred metadata instead of falling back', async (t) => {
  const { repo } = await fixture(t);
  const resolved = await runCli(['resolve-product-binding', '--repo-root', repo, '--json']);
  assert.equal(resolved.code, 0, resolved.stderr);
  assert.equal(JSON.parse(resolved.stdout).source, 'reports/linear/example-task/linear.json');

  await writeFile(path.join(repo, 'reports/linear/example-task/linear.json'), '{');
  const refused = await runCli(['resolve-product-binding', '--repo-root', repo, '--json']);
  assert.equal(refused.code, 1);
  const payload = JSON.parse(refused.stdout);
  assert.match(payload.error, /not valid JSON|parse/i);
  assert.match(payload.source, /reports\/linear/);
});

test('resolver refuses a task A binding when the requested task is task B', async (t) => {
  const { repo } = await fixture(t);
  const result = await runCli(['resolve-product-binding', '--repo-root', repo, '--task-id', 'task-b', '--task-binding', path.join(repo, 'reports/linear/example-task/linear.json'), '--json']);
  assert.equal(result.code, 1);
  assert.match(JSON.parse(result.stdout).error, /taskId|task.*match/i);
});

test('root registration accepts a worktree in the same git family and rejects an unrelated repo', async (t) => {
  const { repo } = await fixture(t);
  const worktree = await mkdtemp(path.join(os.tmpdir(), 'swf-lmp02-worktree-'));
  const unrelated = await mkdtemp(path.join(os.tmpdir(), 'swf-lmp02-unrelated-'));
  t.after(() => Promise.all([
    rm(worktree, { recursive: true, force: true }),
    rm(unrelated, { recursive: true, force: true })
  ]));
  await rm(worktree, { recursive: true, force: true });
  await git(repo, 'worktree', 'add', '-q', worktree);
  await git(unrelated, 'init', '-q');

  const registration = JSON.parse(await readFile(path.join(repo, '.harness/linear/root-registration.json'), 'utf8'));
  assert.equal((await verifyRepoFamily(worktree, registration, 'swf')).ok, true);
  const refused = await runCli(['resolve-product-binding', '--repo-root', unrelated, '--product-config', path.join(repo, '.harness/linear/project.json'), '--task-binding', path.join(repo, 'reports/linear/example-task/linear.json'), '--root-registration', path.join(repo, '.harness/linear/root-registration.json'), '--json']);
  assert.equal(refused.code, 1);
  assert.match(JSON.parse(refused.stdout).error, /root|git|family/i);
});

test('root registration canonicalRoot must itself resolve to the registered Git family', async (t) => {
  const { repo } = await fixture(t);
  const corruptedRoot = await mkdtemp(path.join(os.tmpdir(), 'swf-lmp02-corrupt-root-'));
  t.after(() => rm(corruptedRoot, { recursive: true, force: true }));
  await git(corruptedRoot, 'init', '-q');
  const registrationFile = path.join(repo, '.harness/linear/root-registration.json');
  const registration = JSON.parse(await readFile(registrationFile, 'utf8'));
  registration.canonicalRoot = corruptedRoot;
  await writeFile(registrationFile, JSON.stringify(registration, null, 2));
  const result = await runCli(['resolve-product-binding', '--repo-root', repo, '--json']);
  assert.equal(result.code, 1);
  assert.match(JSON.parse(result.stdout).error, /canonical|root|family/i);
});

test('invalid atomic write leaves the original config intact', async (t) => {
  const { repo } = await fixture(t);
  const target = path.join(repo, '.harness/linear/project.json');
  const before = await readFile(target, 'utf8');
  const invalidInput = path.join(repo, 'invalid.json');
  await writeFile(invalidInput, JSON.stringify({ ...product, productKey: '' }));
  const result = await runCli(['write-product-config', '--file', target, '--input', invalidInput, '--json']);
  assert.equal(result.code, 1);
  assert.equal(await readFile(target, 'utf8'), before);
  assert.deepEqual((await readdir(path.dirname(target))).sort(), ['project.json', 'root-registration.json']);
});

test('migration is dry-run only and performs no write', async (t) => {
  const { repo } = await fixture(t);
  const legacy = path.join(repo, 'legacy.json');
  const output = path.join(repo, 'reports/linear/example-task/migrated.json');
  await writeFile(legacy, JSON.stringify({
    schemaVersion: 1,
    enabled: true,
    workspace: { name: 'legacy' },
    team: { id: 'team-1' },
    project: { id: 'project-1' },
    statusComment: { id: 'comment-1' },
    taskMap: { 'example-task': { issueId: 'issue-1' } }
  }));
  const result = await runCli(['migrate-binding', '--input', legacy, '--product-config', path.join(repo, '.harness/linear/project.json'), '--root-registration', path.join(repo, '.harness/linear/root-registration.json'), '--task-id', 'example-task', '--output', output, '--dry-run', '--json']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).dryRun, true);
  await assert.rejects(access(output));
});

test('migration dry-run refuses root/product and legacy team/project identity mismatches', async (t) => {
  const { repo } = await fixture(t);
  const legacy = path.join(repo, 'legacy-mismatch.json');
  await writeFile(legacy, JSON.stringify({
    schemaVersion: 1,
    enabled: true,
    workspace: { name: 'legacy' },
    team: { id: 'wrong-team' },
    project: { id: 'wrong-project' },
    statusComment: { id: 'comment-1' },
    taskMap: { 'example-task': { issueId: 'issue-1' } }
  }));
  const rootFile = path.join(repo, '.harness/linear/root-registration.json');
  const root = JSON.parse(await readFile(rootFile, 'utf8'));
  root.productKey = 'other-product';
  await writeFile(rootFile, JSON.stringify(root, null, 2));
  const result = await runCli(['migrate-binding', '--input', legacy, '--product-config', path.join(repo, '.harness/linear/project.json'), '--root-registration', rootFile, '--task-id', 'example-task', '--dry-run', '--json']);
  assert.equal(result.code, 1);
  assert.match(JSON.parse(result.stdout).errors.join(' '), /productKey|teamId|projectId/i);
});

test('registry .json directories and dangling symlinks fail closed', async (t) => {
  const { repo } = await fixture(t);
  await mkdir(path.join(repo, '.harness/linear/products/bad.json'), { recursive: true });
  let result = await runCli(['resolve-product-binding', '--repo-root', repo, '--json']);
  assert.equal(result.code, 1);
  assert.match(JSON.parse(result.stdout).error, /read|inspect|directory|product registry/i);
  await rm(path.join(repo, '.harness/linear/products'), { recursive: true, force: true });
  await mkdir(path.join(repo, '.harness/linear/products'), { recursive: true });
  await symlink(path.join(repo, '.harness/linear/products/missing-target.json'), path.join(repo, '.harness/linear/products/dangling.json'));
  result = await runCli(['resolve-product-binding', '--repo-root', repo, '--json']);
  assert.equal(result.code, 1);
  assert.match(JSON.parse(result.stdout).error, /read|inspect|ENOENT|product registry/i);
});

test('archive taskDir resolves stable identity and rejects conflicting selector', async t=>{
 const {repo}=await fixture(t);const dir=path.join(repo,'planning/archive/20260921-example-task');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'task_plan.md'),'Task ID: example-task\n');
 const {resolveProductBinding}=await import('../../harness/core/skills/linear-work-control/lib/linear-product-binding.mjs');
 const r=await resolveProductBinding({repoRoot:repo,taskDir:dir});assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal((await resolveProductBinding({repoRoot:repo,taskDir:dir,taskId:'other'})).ok,false);
 await writeFile(path.join(dir,'task_plan.md'),'# missing identity');assert.equal((await resolveProductBinding({repoRoot:repo,taskDir:dir})).ok,false);
});

test('task binding accepts lifecycle debt only for its exact task',()=>{
 const lifecycle={eventId:'event',event:'reopen',taskId:task.taskId,trioPath:'/repo/planning/active/example-task',recordedAt:'2026-09-21'};
 assert.equal(validateTaskBinding({...task,sync:{pendingRetry:true,lastResult:'failed',lifecycle}}).ok,true);
 assert.equal(validateTaskBinding({...task,sync:{lifecycle:{...lifecycle,taskId:'wrong'}}}).ok,false);
 assert.equal(validateTaskBinding({...task,sync:{lifecycle:[]}}).ok,false);
});
