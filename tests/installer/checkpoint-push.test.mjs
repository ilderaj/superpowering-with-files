import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  createHarnessFixture,
  removeHarnessFixture
} from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);

function git(cwd, ...args) {
  return execFileAsync('git', args, { cwd });
}

function harness(cwd, ...args) {
  return execFileAsync('node', [path.join(cwd, 'harness/installer/commands/harness.mjs'), ...args], {
    cwd
  });
}

async function initRepo(root, branch = 'dev') {
  await git(root, 'init', `--initial-branch=${branch}`);
  await git(root, 'config', 'user.name', 'Harness Test');
  await git(root, 'config', 'user.email', 'harness@example.com');
  await writeFile(path.join(root, 'fixture.txt'), 'initial\n');
  await git(root, 'add', '.');
  await git(root, 'commit', '-m', 'init');
}

async function createBareRemote() {
  const remote = await mkdtemp(path.join(os.tmpdir(), 'harness-checkpoint-remote-'));
  await git(remote, 'init', '--bare');
  return remote;
}

async function addOrigin(root, remote) {
  await git(root, 'remote', 'add', 'origin', remote);
}

async function addRemote(root, name, remote) {
  await git(root, 'remote', 'add', name, remote);
}

async function pushCurrentBranch(root) {
  await git(root, 'push', '-u', 'origin', 'HEAD');
}

async function createLinkedWorktree(root, branch) {
  const worktree = await mkdtemp(path.join(os.tmpdir(), 'harness-checkpoint-worktree-'));
  await git(root, 'worktree', 'add', '-b', branch, worktree, 'HEAD');
  await git(worktree, 'config', 'user.name', 'Harness Test');
  await git(worktree, 'config', 'user.email', 'harness@example.com');
  return worktree;
}

async function writeVerifyScript(root, fileName, source) {
  const scriptPath = path.join(root, 'scripts', fileName);
  await writeFile(scriptPath, source);
  return `node scripts/${fileName}`;
}

function parseJson(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function parseCheckpointPushPayload(stdout, stderr) {
  return parseJson(stdout) ?? parseJson(stderr);
}

function sectionBody(markdown, title) {
  const pattern = new RegExp(`## ${title}\\n([\\s\\S]*?)(?:\\n## |$)`);
  const match = markdown.match(pattern);
  return match ? match[1] : '';
}

function resolveOutputPath(root, targetPath) {
  return path.isAbsolute(targetPath) ? targetPath : path.join(root, targetPath);
}

async function runCheckpointPush(root, ...args) {
  try {
    const result = await harness(root, 'checkpoint-push', '--json', ...args);
    return {
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      payload: parseCheckpointPushPayload(result.stdout, result.stderr)
    };
  } catch (error) {
    return {
      exitCode: typeof error.code === 'number' ? error.code : 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      payload: parseCheckpointPushPayload(error.stdout ?? '', error.stderr ?? '')
    };
  }
}

async function expectCheckpointPushResult(root, options) {
  const execution = await runCheckpointPush(root, `--message=${options.message ?? 'chore: checkpoint push'}`, ...(options.args ?? []));

  assert.ok(
    execution.payload,
    `Expected checkpoint-push JSON output.\nSTDOUT:\n${execution.stdout}\nSTDERR:\n${execution.stderr}`
  );
  assert.equal(typeof execution.payload.resultPath, 'string');
  assert.equal(typeof execution.payload.reviewArtifactPath, 'string');

  const resultPath = resolveOutputPath(root, execution.payload.resultPath);
  await access(resultPath);

  const result = JSON.parse(await readFile(resultPath, 'utf8'));
  assert.equal(result.status, options.status);
  assert.equal(result.resultPath, execution.payload.resultPath);
  assert.equal(result.reviewArtifactPath, execution.payload.reviewArtifactPath);
  if ('exitCode' in options) {
    assert.equal(execution.exitCode, options.exitCode);
  }

  if (options.blockedReason instanceof RegExp) {
    assert.match(result.blockedReason ?? '', options.blockedReason);
  } else {
    assert.equal(result.blockedReason ?? '', options.blockedReason ?? '');
  }

  await access(resolveOutputPath(root, result.reviewArtifactPath));

  return { execution, result };
}

async function cleanupFixture(root, worktree, remote) {
  if (worktree) {
    await rm(worktree, { recursive: true, force: true });
  }
  await removeHarnessFixture(root);
  if (remote) {
    await rm(remote, { recursive: true, force: true });
  }
}

test('checkpoint-push blocks detached HEAD checkouts', async () => {
  const root = await createHarnessFixture();
  const remote = await createBareRemote();
  try {
    await initRepo(root);
    await addOrigin(root, remote);
    await pushCurrentBranch(root);
    await git(root, 'checkout', '--detach', 'HEAD');
    await writeFile(path.join(root, 'detached.txt'), 'change\n');

    await expectCheckpointPushResult(root, {
      status: 'blocked',
      blockedReason: /detached HEAD/i,
      exitCode: 1
    });
  } finally {
    await cleanupFixture(root, null, remote);
  }
});

test('checkpoint-push blocks main branches', async () => {
  const root = await createHarnessFixture();
  const remote = await createBareRemote();
  try {
    await initRepo(root, 'main');
    await addOrigin(root, remote);
    await pushCurrentBranch(root);
    await writeFile(path.join(root, 'main-change.txt'), 'change\n');

    await expectCheckpointPushResult(root, {
      status: 'blocked',
      blockedReason: /\bmain\b/i,
      exitCode: 1
    });
  } finally {
    await cleanupFixture(root, null, remote);
  }
});

test('checkpoint-push blocks the main checkout dev branch without a linked worktree', async () => {
  const root = await createHarnessFixture();
  const remote = await createBareRemote();
  try {
    await initRepo(root, 'dev');
    await addOrigin(root, remote);
    await pushCurrentBranch(root);
    await writeFile(path.join(root, 'dev-change.txt'), 'change\n');

    await expectCheckpointPushResult(root, {
      status: 'blocked',
      blockedReason: /worktree/i,
      exitCode: 1
    });
  } finally {
    await cleanupFixture(root, null, remote);
  }
});

test('checkpoint-push blocks repositories without an origin remote', async () => {
  const root = await createHarnessFixture();
  let worktree;
  try {
    await initRepo(root, 'dev');
    worktree = await createLinkedWorktree(root, 'feature/no-origin');
    await writeFile(path.join(worktree, 'feature.txt'), 'change\n');

    await expectCheckpointPushResult(worktree, {
      status: 'blocked',
      blockedReason: /origin/i,
      exitCode: 1
    });
  } finally {
    await cleanupFixture(root, worktree, null);
  }
});

test('checkpoint-push reports no_changes for eligible clean worktrees', async () => {
  const root = await createHarnessFixture();
  const remote = await createBareRemote();
  let worktree;
  try {
    await initRepo(root, 'dev');
    await addOrigin(root, remote);
    await pushCurrentBranch(root);
    worktree = await createLinkedWorktree(root, 'feature/no-changes');

    await expectCheckpointPushResult(worktree, {
      status: 'no_changes',
      blockedReason: '',
      exitCode: 0
    });
  } finally {
    await cleanupFixture(root, worktree, remote);
  }
});

test('checkpoint-push records verification_failed when the fresh verify command fails', async () => {
  const root = await createHarnessFixture();
  const remote = await createBareRemote();
  let worktree;
  try {
    await initRepo(root, 'dev');
    await addOrigin(root, remote);
    await pushCurrentBranch(root);
    worktree = await createLinkedWorktree(root, 'feature/verify-fail');
    await writeFile(path.join(worktree, 'verify-fail.txt'), 'change\n');
    const verifyCommand = await writeVerifyScript(
      worktree,
      'verify-fail.mjs',
      "process.stderr.write('verify failed\\n');\nprocess.exit(1);\n"
    );

    await expectCheckpointPushResult(worktree, {
      status: 'verification_failed',
      blockedReason: '',
      args: [`--verify-cmd=${verifyCommand}`],
      exitCode: 1
    });
  } finally {
    await cleanupFixture(root, worktree, remote);
  }
});

test('checkpoint-push failure artifacts record diff evidence without claiming diff-check ran', async () => {
  const root = await createHarnessFixture();
  const remote = await createBareRemote();
  let worktree;
  try {
    await initRepo(root, 'dev');
    await addOrigin(root, remote);
    await pushCurrentBranch(root);
    worktree = await createLinkedWorktree(root, 'feature/failure-artifacts');
    await writeFile(path.join(worktree, 'fixture.txt'), 'staged change\n');
    await git(worktree, 'add', 'fixture.txt');
    await writeFile(path.join(worktree, 'new-file.txt'), 'unstaged change\n');
    const verifyCommand = 'node -e "process.stderr.write(\'verify failed\\n\'); process.exit(1)"';

    const { result } = await expectCheckpointPushResult(worktree, {
      status: 'verification_failed',
      blockedReason: '',
      args: [`--verify-cmd=${verifyCommand}`],
      exitCode: 1
    });

    const reviewMarkdown = await readFile(resolveOutputPath(worktree, result.reviewArtifactPath), 'utf8');
    assert.match(sectionBody(reviewMarkdown, 'Git Diff --check'), /not run/i);
    assert.match(sectionBody(reviewMarkdown, 'Git Diff --stat'), /fixture\.txt/);
    assert.match(sectionBody(reviewMarkdown, 'Git Diff --stat'), /new-file\.txt/);
  } finally {
    await cleanupFixture(root, worktree, remote);
  }
});

test('checkpoint-push blocks when diff --check fails on newly added files', async () => {
  const root = await createHarnessFixture();
  const remote = await createBareRemote();
  let worktree;
  try {
    await initRepo(root, 'dev');
    await addOrigin(root, remote);
    await pushCurrentBranch(root);
    worktree = await createLinkedWorktree(root, 'feature/diff-check-fail');
    await writeFile(path.join(worktree, 'bad-whitespace.txt'), 'broken  \n');
    const verifyCommand = await writeVerifyScript(
      worktree,
      'verify-pass.mjs',
      "process.stdout.write('verify ok\\n');\n"
    );

    await expectCheckpointPushResult(worktree, {
      status: 'blocked',
      blockedReason: /git diff --check failed/i,
      args: [`--verify-cmd=${verifyCommand}`],
      exitCode: 1
    });
  } finally {
    await cleanupFixture(root, worktree, remote);
  }
});

test('checkpoint-push still writes result artifacts when package.json is malformed', async () => {
  const root = await createHarnessFixture();
  const remote = await createBareRemote();
  let worktree;
  try {
    await initRepo(root, 'dev');
    await addOrigin(root, remote);
    await pushCurrentBranch(root);
    worktree = await createLinkedWorktree(root, 'feature/bad-package-json');
    await writeFile(path.join(worktree, 'fixture.txt'), 'changed\n');
    await writeFile(path.join(worktree, 'package.json'), '{\n');

    await expectCheckpointPushResult(worktree, {
      status: 'blocked',
      blockedReason: /package\.json/i,
      exitCode: 1
    });
  } finally {
    await cleanupFixture(root, worktree, remote);
  }
});

test('checkpoint-push dry-run preserves the caller index and records diff stat for the staged commit set', async () => {
  const root = await createHarnessFixture();
  const remote = await createBareRemote();
  let worktree;
  try {
    await initRepo(root, 'dev');
    await addOrigin(root, remote);
    await pushCurrentBranch(root);
    worktree = await createLinkedWorktree(root, 'feature/dry-run-state');
    await writeFile(path.join(worktree, 'fixture.txt'), 'staged change\n');
    await git(worktree, 'add', 'fixture.txt');
    await writeFile(path.join(worktree, 'new-file.txt'), 'new content\n');
    const verifyCommand = await writeVerifyScript(
      worktree,
      'verify-pass.mjs',
      "process.stdout.write('verify ok\\n');\n"
    );

    const { result } = await expectCheckpointPushResult(worktree, {
      status: 'success',
      blockedReason: '',
      args: ['--dry-run', `--verify-cmd=${verifyCommand}`],
      exitCode: 0
    });

    const { stdout: statusAfter } = await git(worktree, 'status', '--short');
    assert.match(statusAfter, /^M  fixture\.txt$/m);
    assert.match(statusAfter, /^\?\? new-file\.txt$/m);

    const reviewMarkdown = await readFile(resolveOutputPath(worktree, result.reviewArtifactPath), 'utf8');
    assert.match(reviewMarkdown, /## Git Diff --stat\n[\s\S]*fixture\.txt/);
    assert.match(reviewMarkdown, /## Git Diff --stat\n[\s\S]*new-file\.txt/);
  } finally {
    await cleanupFixture(root, worktree, remote);
  }
});

test('checkpoint-push dry-run preserves intent-to-add index entries', async () => {
  const root = await createHarnessFixture();
  const remote = await createBareRemote();
  let worktree;
  try {
    await initRepo(root, 'dev');
    await addOrigin(root, remote);
    await pushCurrentBranch(root);
    worktree = await createLinkedWorktree(root, 'feature/intent-to-add');
    await writeFile(path.join(worktree, 'intent.txt'), 'intent to add\n');
    await git(worktree, 'add', '-N', 'intent.txt');
    const verifyCommand = 'node -e "process.stdout.write(\'verify ok\\n\')"';

    await expectCheckpointPushResult(worktree, {
      status: 'success',
      blockedReason: '',
      args: ['--dry-run', `--verify-cmd=${verifyCommand}`],
      exitCode: 0
    });

    const { stdout: statusAfter } = await git(worktree, 'status', '--short');
    assert.match(statusAfter, /^ A intent\.txt$/m);
  } finally {
    await cleanupFixture(root, worktree, remote);
  }
});

test('checkpoint-push blocks branches whose upstream does not point to origin/current-branch', async () => {
  const root = await createHarnessFixture();
  const origin = await createBareRemote();
  const fork = await createBareRemote();
  let worktree;
  try {
    await initRepo(root, 'dev');
    await addOrigin(root, origin);
    await addRemote(root, 'fork', fork);
    await pushCurrentBranch(root);
    worktree = await createLinkedWorktree(root, 'feature/upstream-mismatch');
    await writeFile(path.join(worktree, 'fixture.txt'), 'changed\n');
    const verifyCommand = await writeVerifyScript(
      worktree,
      'verify-pass.mjs',
      "process.stdout.write('verify ok\\n');\n"
    );
    await git(worktree, 'push', '-u', 'fork', 'HEAD');

    await expectCheckpointPushResult(worktree, {
      status: 'blocked',
      blockedReason: /origin/i,
      args: [`--verify-cmd=${verifyCommand}`],
      exitCode: 1
    });
  } finally {
    await cleanupFixture(root, worktree, origin);
    await rm(fork, { recursive: true, force: true });
  }
});

test('checkpoint-push review evidence includes files generated during verify', async () => {
  const root = await createHarnessFixture();
  const remote = await createBareRemote();
  let worktree;
  try {
    await initRepo(root, 'dev');
    await addOrigin(root, remote);
    await pushCurrentBranch(root);
    worktree = await createLinkedWorktree(root, 'feature/verify-generated-file');
    await writeFile(path.join(worktree, 'fixture.txt'), 'changed\n');
    const verifyCommand = 'node -e "require(\'node:fs\').writeFileSync(\'generated.txt\', \'generated\\\\n\')"';

    const { result } = await expectCheckpointPushResult(worktree, {
      status: 'success',
      blockedReason: '',
      args: ['--dry-run', `--verify-cmd=${verifyCommand}`],
      exitCode: 0
    });

    const reviewMarkdown = await readFile(resolveOutputPath(worktree, result.reviewArtifactPath), 'utf8');
    assert.match(sectionBody(reviewMarkdown, 'Changed Files'), /generated\.txt/);
    assert.match(sectionBody(reviewMarkdown, 'Git Status --short'), /generated\.txt/);
  } finally {
    await cleanupFixture(root, worktree, remote);
  }
});

test('checkpoint-push only pushes the current branch even when git push.default is matching', async () => {
  const root = await createHarnessFixture();
  const remote = await createBareRemote();
  let worktree;
  try {
    await initRepo(root, 'dev');
    await addOrigin(root, remote);
    await pushCurrentBranch(root);

    await git(root, 'checkout', '-b', 'matching-target');
    await writeFile(path.join(root, 'matching.txt'), 'baseline\n');
    await git(root, 'add', 'matching.txt');
    await git(root, 'commit', '-m', 'matching baseline');
    await git(root, 'push', '-u', 'origin', 'matching-target');
    await writeFile(path.join(root, 'matching.txt'), 'local only\n');
    await git(root, 'add', 'matching.txt');
    await git(root, 'commit', '-m', 'matching local only');
    const { stdout: localMatchingHead } = await git(root, 'rev-parse', 'matching-target');
    const { stdout: remoteMatchingBefore } = await git(remote, 'rev-parse', 'refs/heads/matching-target');
    assert.notEqual(localMatchingHead.trim(), remoteMatchingBefore.trim());

    await git(root, 'checkout', 'dev');
    worktree = await createLinkedWorktree(root, 'feature/explicit-push');
    await git(worktree, 'push', '-u', 'origin', 'HEAD');
    await git(worktree, 'config', 'push.default', 'matching');
    await writeFile(path.join(worktree, 'fixture.txt'), 'feature changed\n');
    const verifyCommand = await writeVerifyScript(
      worktree,
      'verify-pass.mjs',
      "process.stdout.write('verify ok\\n');\n"
    );

    await expectCheckpointPushResult(worktree, {
      status: 'success',
      blockedReason: '',
      args: [`--verify-cmd=${verifyCommand}`],
      exitCode: 0
    });

    const { stdout: remoteMatchingAfter } = await git(remote, 'rev-parse', 'refs/heads/matching-target');
    assert.equal(remoteMatchingAfter.trim(), remoteMatchingBefore.trim());
  } finally {
    await cleanupFixture(root, worktree, remote);
  }
});

test('checkpoint-push creates a review artifact, commit, and upstream push for eligible worktrees', async () => {
  const root = await createHarnessFixture();
  const remote = await createBareRemote();
  let worktree;
  try {
    await initRepo(root, 'dev');
    await addOrigin(root, remote);
    await pushCurrentBranch(root);
    worktree = await createLinkedWorktree(root, 'feature/happy-path');
    await writeFile(path.join(worktree, 'happy-path.txt'), 'change\n');
    const verifyCommand = await writeVerifyScript(
      worktree,
      'verify-pass.mjs',
      "process.stdout.write('verify ok\\n');\n"
    );

    const { result } = await expectCheckpointPushResult(worktree, {
      status: 'success',
      blockedReason: '',
      message: 'chore: save recovery point',
      args: [`--verify-cmd=${verifyCommand}`],
      exitCode: 0
    });

    assert.equal(result.branch, 'feature/happy-path');
    assert.equal(result.upstream, 'origin/feature/happy-path');
    assert.equal(result.isWorktree, true);
    assert.equal(result.verifyCommand, verifyCommand);
    assert.equal(result.message, 'chore: save recovery point');
    assert.notEqual(result.headBefore, result.headAfter);

    const { stdout: upstream } = await git(
      worktree,
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{u}'
    );
    assert.equal(upstream.trim(), 'origin/feature/happy-path');

    const { stdout: headSha } = await git(worktree, 'rev-parse', 'HEAD');
    assert.equal(headSha.trim(), result.headAfter);

    const { stdout: commitSubject } = await git(worktree, 'log', '-1', '--pretty=%s');
    assert.equal(commitSubject.trim(), 'chore: save recovery point');

    const { stdout: remoteHeads } = await git(remote, 'for-each-ref', '--format=%(refname:short)', 'refs/heads');
    assert.match(remoteHeads, /feature\/happy-path/);

    const { stdout: committedFiles } = await git(worktree, 'ls-tree', '--name-only', '-r', 'HEAD');
    assert.doesNotMatch(committedFiles, /\.harness\/checkpoint-push\//);

    const reviewMarkdown = await readFile(resolveOutputPath(worktree, result.reviewArtifactPath), 'utf8');
    assert.match(reviewMarkdown, /- Upstream before push: none/);
  } finally {
    await cleanupFixture(root, worktree, remote);
  }
});
