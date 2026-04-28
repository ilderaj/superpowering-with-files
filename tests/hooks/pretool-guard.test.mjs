import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function runGuard(scriptPath, cwd, payload, env = {}) {
  const stdout = execFileSync('bash', [scriptPath, 'codex'], {
    cwd,
    input: `${JSON.stringify(payload)}\n`,
    env: { ...process.env, ...env }
  }).toString();
  return JSON.parse(stdout);
}

function runGuardRawInput(scriptPath, cwd, stdinText, platform = 'copilot', env = {}) {
  const stdout = execFileSync('bash', [scriptPath, platform], {
    cwd,
    input: stdinText,
    env: { ...process.env, ...env }
  }).toString();
  return JSON.parse(stdout);
}

function initGitRepo(cwd) {
  execFileSync('git', ['init'], { cwd });
  execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd });
  execFileSync('git', ['config', 'user.email', 'harness@example.com'], { cwd });
  execFileSync('git', ['add', '.'], { cwd });
  execFileSync('git', ['commit', '-m', 'init'], { cwd });
}

function addUpstream(cwd, remoteDir) {
  execFileSync('git', ['init', '--bare', remoteDir]);
  execFileSync('git', ['remote', 'add', 'origin', remoteDir], { cwd });
  execFileSync('git', ['push', '-u', 'origin', 'HEAD'], { cwd });
}

async function writeTaskPlan(rootDir, withRiskAssessment) {
  const taskDir = path.join(rootDir, 'planning/active/safety-test');
  await mkdir(taskDir, { recursive: true });
  const lines = [
    '# Safety test',
    '',
    '## Current State',
    'Status: active',
    'Archive Eligible: no',
    'Close Reason:',
    '',
    '## Risk Assessment',
    '',
    '| 风险 | 影响 | 缓解 |',
    '|---|---|---|'
  ];

  if (withRiskAssessment) {
    lines.push('| DerivedData cleanup | local build artifacts | restore from checkpoint |');
  }

  await writeFile(path.join(taskDir, 'task_plan.md'), `${lines.join('\n')}\n`);
}

async function writePlaceholderRiskAssessment(rootDir) {
  const taskDir = path.join(rootDir, 'planning/active/safety-test');
  await mkdir(taskDir, { recursive: true });
  await writeFile(
    path.join(taskDir, 'task_plan.md'),
    [
      '# Safety test',
      '',
      '## Current State',
      'Status: active',
      'Archive Eligible: no',
      'Close Reason:',
      '',
      '## Risk Assessment',
      '',
      '| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |',
      '|---|---|---|---|',
      '|    |          |          |                          |'
    ].join('\n')
  );
}

test('pretool-guard denies destructive commands from HOME-like directories', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-home-'));
  try {
    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuard(
      scriptPath,
      root,
      { cwd: root, tool: 'Bash', command: 'rm -rf ./tmp' },
      { HOME: root }
    );

    assert.equal(result.permissionDecision, 'deny');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pretool-guard allows safe commands inside a repository', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-safe-'));
  try {
    await writeFile(path.join(root, 'README.md'), '# fixture\n');
    initGitRepo(root);

    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuard(scriptPath, root, { cwd: root, tool: 'Bash', command: 'git status' });

    assert.equal(result.permissionDecision, 'allow');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pretool-guard keeps malformed Copilot payload text from aborting', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-copilot-malformed-'));
  try {
    await writeFile(path.join(root, 'README.md'), '# fixture\n');
    initGitRepo(root);

    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuardRawInput(
      scriptPath,
      root,
      'copilot pretool payload\n{"cwd":".","tool":"Bash","command":"git status"}\n'
    );

    assert.match(result.permissionDecision, /allow|ask/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pretool-guard returns a parse-failure allow reason when no executable command is detected', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-copilot-prose-'));
  try {
    await writeFile(path.join(root, 'README.md'), '# fixture\n');
    initGitRepo(root);

    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuardRawInput(
      scriptPath,
      root,
      'This is just some random English prose that mentions nothing executable.\n'
    );

    assert.equal(result.permissionDecision, 'allow');
    assert.equal(
      result.permissionDecisionReason,
      'Hook payload could not be parsed, but no executable command was detected.'
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pretool-guard parses wrapped JSON payload and allows git status', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-copilot-wrapped-'));
  try {
    await writeFile(path.join(root, 'README.md'), '# fixture\n');
    initGitRepo(root);

    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuardRawInput(
      scriptPath,
      root,
      'some surrounding text\n{"cwd":".","tool":"Bash","command":"git status"}\nmore surrounding text\n'
    );

    assert.equal(result.permissionDecision, 'allow');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pretool-guard keeps raw dangerous command fallback on ask', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-copilot-fallback-'));
  try {
    await writeFile(path.join(root, 'README.md'), '# fixture\n');
    initGitRepo(root);

    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuardRawInput(
      scriptPath,
      root,
      'rm -rf ./DerivedData\n'
    );

    assert.equal(result.permissionDecision, 'ask');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pretool-guard asks when multiline raw Copilot input carries a dangerous later line', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-copilot-multiline-'));
  try {
    await writeFile(path.join(root, 'README.md'), '# fixture\n');
    initGitRepo(root);

    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuardRawInput(
      scriptPath,
      root,
      'Here is my explanation\nrm -rf ./DerivedData\n'
    );

    assert.equal(result.permissionDecision, 'ask');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pretool-guard asks when malformed Copilot JSON-like text contains a dangerous command field', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-copilot-malformed-command-'));
  try {
    await writeFile(path.join(root, 'README.md'), '# fixture\n');
    initGitRepo(root);

    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuardRawInput(
      scriptPath,
      root,
      '{"command": "rm -rf ./build", incomplete\n'
    );

    assert.equal(result.permissionDecision, 'ask');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pretool-guard denies absolute destructive targets outside the workspace', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-abs-'));
  try {
    await writeFile(path.join(root, 'README.md'), '# fixture\n');
    initGitRepo(root);

    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuard(scriptPath, root, {
      cwd: root,
      tool: 'Bash',
      command: 'rm -rf /Users/example/test'
    });

    assert.equal(result.permissionDecision, 'deny');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pretool-guard asks for destructive commands without a recorded risk assessment', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-ask-'));
  try {
    await writeFile(path.join(root, 'README.md'), '# fixture\n');
    await writeTaskPlan(root, false);
    initGitRepo(root);

    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuard(scriptPath, root, {
      cwd: root,
      tool: 'Bash',
      command: 'rm -rf ./DerivedData'
    });

    assert.equal(result.permissionDecision, 'ask');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pretool-guard treats placeholder risk assessment rows as missing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-placeholder-'));
  try {
    await writeFile(path.join(root, 'README.md'), '# fixture\n');
    await writePlaceholderRiskAssessment(root);
    initGitRepo(root);

    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuard(scriptPath, root, {
      cwd: root,
      tool: 'Bash',
      command: 'rm -rf ./DerivedData'
    });

    assert.equal(result.permissionDecision, 'ask');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pretool-guard allows destructive commands with risk assessment and upstream branch', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-allow-'));
  const remote = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-remote-'));
  try {
    await writeFile(path.join(root, 'README.md'), '# fixture\n');
    await writeTaskPlan(root, true);
    initGitRepo(root);
    addUpstream(root, remote);

    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuard(scriptPath, root, {
      cwd: root,
      tool: 'Bash',
      command: 'rm -rf ./DerivedData'
    });

    assert.equal(result.permissionDecision, 'allow');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(remote, { recursive: true, force: true });
  }
});

test('pretool-guard asks for dangerous commands outside a worktree when no upstream is configured', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-no-upstream-'));
  try {
    await writeFile(path.join(root, 'README.md'), '# fixture\n');
    await writeTaskPlan(root, true);
    initGitRepo(root);

    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuard(scriptPath, root, {
      cwd: root,
      tool: 'Bash',
      command: 'rm -rf ./DerivedData'
    });

    assert.equal(result.permissionDecision, 'ask');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pretool-guard denies git reset --hard on the main repo dev branch', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-dev-deny-'));
  try {
    await writeFile(path.join(root, 'README.md'), '# fixture\n');
    await writeTaskPlan(root, true);
    initGitRepo(root);
    execFileSync('git', ['checkout', '-b', 'dev'], { cwd: root });

    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuard(scriptPath, root, {
      cwd: root,
      tool: 'Bash',
      command: 'git reset --hard'
    });

    assert.equal(result.permissionDecision, 'deny');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pretool-guard asks for dangerous commands on detached HEAD', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-pretool-detached-'));
  try {
    await writeFile(path.join(root, 'README.md'), '# fixture\n');
    await writeTaskPlan(root, true);
    initGitRepo(root);
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
    execFileSync('git', ['checkout', head], { cwd: root });

    const scriptPath = path.join(process.cwd(), 'harness/core/hooks/safety/scripts/pretool-guard.sh');
    const result = runGuard(scriptPath, root, {
      cwd: root,
      tool: 'Bash',
      command: 'git reset --hard'
    });

    assert.equal(result.permissionDecision, 'ask');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
