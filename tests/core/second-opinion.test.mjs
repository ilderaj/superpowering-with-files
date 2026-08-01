import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { materializeDirectoryProjection } from '../../harness/installer/lib/fs-ops.mjs';
import { planSkillProjections } from '../../harness/installer/lib/skill-projection.mjs';

const execFile = promisify(execFileCallback);
const builderPath = path.resolve('harness/core/skills/second-opinion/scripts/build-package.mjs');
const skillPath = path.resolve('harness/core/skills/second-opinion');

async function runBuilder(args) {
  try {
    return await execFile(process.execPath, [builderPath, ...args], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
  } catch (error) {
    throw new Error(`${error.message}\n${error.stderr ?? ''}`.trim());
  }
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

async function createBuilderFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'second-opinion-test-'));
  const promptPath = path.join(root, 'reviewed-prompt.md');
  const attachmentPath = path.join(root, 'context.txt');
  await writeFile(promptPath, 'Review the bounded fixture and identify unsupported assumptions.\n', 'utf8');
  await writeFile(attachmentPath, 'synthetic attachment\n', 'utf8');
  return {
    root,
    promptPath,
    attachmentPath,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    }
  };
}

test('second-opinion skill is explicit-only and documents fail-closed advisory boundaries', async () => {
  const skill = await readFile(path.join(skillPath, 'SKILL.md'), 'utf8');
  const interfaceYaml = await readFile(path.join(skillPath, 'agents/openai.yaml'), 'utf8');

  assert.match(skill, /explicitly invokes \$second-opinion/i);
  assert.match(skill, /review-existing/);
  assert.match(skill, /explore-from-context/);
  assert.match(skill, /18,000/);
  assert.match(skill, /included/i);
  assert.match(skill, /excluded/i);
  assert.match(skill, /redaction/i);
  assert.match(skill, /source pointer/i);
  assert.match(skill, /package-bound/i);
  assert.match(skill, /new tab/i);
  assert.match(skill, /new Chat/i);
  assert.match(skill, /not Work/i);
  assert.match(skill, /GPT-5\.6 Sol Pro/);
  assert.match(skill, /Extra High/);
  assert.match(skill, /ambiguous|partial submit/i);
  assert.match(skill, /list.*read|read.*list/i);
  assert.match(skill, /untrusted advisory evidence/i);
  assert.match(interfaceYaml, /default_prompt:.*\$second-opinion/);
  assert.match(interfaceYaml, /policy:\n\s+allow_implicit_invocation: false/);
});
test('second-opinion package builder creates a deterministic manifest and attachment hashes', async () => {
  const fixture = await createBuilderFixture();
  try {
    const outputOne = path.join(fixture.root, 'package-one');
    const outputTwo = path.join(fixture.root, 'package-two');
    await runBuilder([
      '--prompt', fixture.promptPath,
      '--mode', 'review-existing',
      '--output', outputOne,
      '--attachment', fixture.attachmentPath,
      '--source-pointer', 'request.md=fixture:reviewed-prompt',
      '--source-pointer', 'attachments/context.txt=fixture:context',
      '--excluded', 'unselected fixture context',
      '--redaction', 'synthetic secrets omitted'
    ]);
    await runBuilder([
      '--prompt', fixture.promptPath,
      '--mode', 'review-existing',
      '--output', outputTwo,
      '--attachment', fixture.attachmentPath,
      '--source-pointer', 'attachments/context.txt=fixture:context',
      '--source-pointer', 'request.md=fixture:reviewed-prompt',
      '--excluded', 'unselected fixture context',
      '--redaction', 'synthetic secrets omitted'
    ]);

    const manifestOne = JSON.parse(await readFile(path.join(outputOne, 'manifest.json'), 'utf8'));
    const manifestTwo = JSON.parse(await readFile(path.join(outputTwo, 'manifest.json'), 'utf8'));
    const request = await readFile(path.join(outputOne, 'request.md'));
    const attachment = await readFile(path.join(outputOne, 'attachments/context.txt'));

    assert.deepEqual(manifestOne, manifestTwo);
    assert.equal(manifestOne.schemaVersion, 1);
    assert.equal(manifestOne.mode, 'review-existing');
    assert.equal(manifestOne.promptCharCount, Array.from(request.toString('utf8')).length);
    assert.equal(manifestOne.prompt.sha256, sha256(request));
    assert.deepEqual(manifestOne.included, ['request.md', 'attachments/context.txt']);
    assert.deepEqual(manifestOne.excluded, ['unselected fixture context']);
    assert.deepEqual(manifestOne.redactions, ['synthetic secrets omitted']);
    assert.deepEqual(manifestOne.sourcePointers, [
      { path: 'request.md', pointer: 'fixture:reviewed-prompt' },
      { path: 'attachments/context.txt', pointer: 'fixture:context' }
    ]);
    assert.deepEqual(manifestOne.attachments, [{
      path: 'attachments/context.txt',
      filename: 'context.txt',
      sizeBytes: attachment.byteLength,
      sha256: sha256(attachment)
    }]);
    assert.equal(manifestOne.files.length, 2);
    assert.equal(manifestOne.files[0].path, 'request.md');
    assert.equal(manifestOne.files[1].path, 'attachments/context.txt');
    assert.match(manifestOne.packageHash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(await readFile(path.join(outputTwo, 'request.md'), 'utf8'), request.toString('utf8'));
    assert.deepEqual(await readFile(path.join(outputTwo, 'attachments/context.txt')), attachment);
  } finally {
    await fixture.cleanup();
  }
});

test('second-opinion package builder requires source pointer coverage for every included file', async () => {
  const fixture = await createBuilderFixture();
  try {
    const runFailureCase = async (outputName, extraArgs, expectedError) => {
      await assert.rejects(
        runBuilder([
          '--prompt', fixture.promptPath,
          '--mode', 'review-existing',
          '--output', path.join(fixture.root, outputName),
          '--attachment', fixture.attachmentPath,
          ...extraArgs
        ]),
        (error) => {
          assert.match(error.message, expectedError);
          return true;
        }
      );
    };

    await runFailureCase('no-pointers', [], /source pointer/i);
    await runFailureCase(
      'missing-attachment-pointer',
      ['--source-pointer', 'request.md=fixture:reviewed-prompt'],
      /Missing source pointer coverage.*attachments\/context\.txt/i
    );
    await runFailureCase(
      'unknown-package-path',
      [
        '--source-pointer', 'request.md=fixture:reviewed-prompt',
        '--source-pointer', 'attachments/context.txt=fixture:context',
        '--source-pointer', 'unknown.txt=fixture:unknown'
      ],
      /Unknown package path/i
    );
    await runFailureCase(
      'empty-pointer',
      [
        '--source-pointer', 'request.md=',
        '--source-pointer', 'attachments/context.txt=fixture:context'
      ],
      /non-empty source pointer|pointer.*empty/i
    );
  } finally {
    await fixture.cleanup();
  }
});

test('second-opinion package builder rejects unsafe modes, overflow, duplicate or missing attachments, and output conflicts', async () => {
  const fixture = await createBuilderFixture();
  try {
    const output = path.join(fixture.root, 'package');
    await assert.rejects(
      runBuilder(['--prompt', fixture.promptPath, '--mode', 'invalid', '--output', output]),
      /Invalid mode/
    );
    const oversizedPrompt = path.join(fixture.root, 'oversized.md');
    await writeFile(oversizedPrompt, 'x'.repeat(18_001), 'utf8');
    await assert.rejects(
      runBuilder(['--prompt', oversizedPrompt, '--mode', 'explore-from-context', '--output', output]),
      /18,000/
    );
    await assert.rejects(
      runBuilder([
        '--prompt', fixture.promptPath,
        '--mode', 'explore-from-context',
        '--output', output,
        '--attachment', fixture.attachmentPath,
        '--attachment', fixture.attachmentPath
      ]),
      /Duplicate attachment/
    );
    await assert.rejects(
      runBuilder([
        '--prompt', fixture.promptPath,
        '--mode', 'explore-from-context',
        '--output', output,
        '--attachment', path.join(fixture.root, 'missing.txt')
      ]),
      /Attachment not found/
    );
    await mkdir(output);
    await assert.rejects(
      runBuilder([
        '--prompt', fixture.promptPath,
        '--mode', 'explore-from-context',
        '--output', output,
        '--source-pointer', 'request.md=fixture:reviewed-prompt'
      ]),
      /Output directory already exists/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('second-opinion-global is opt-in and materializes the explicit skill metadata', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'second-opinion-home-'));
  try {
    const profilePlan = await planSkillProjections({
      rootDir: process.cwd(),
      homeDir,
      scope: 'user-global',
      target: 'codex',
      skillProfile: 'second-opinion-global'
    });
    const skillProjection = profilePlan.find((projection) => projection.skillName === 'second-opinion');
    assert.ok(skillProjection);
    assert.equal(skillProjection.strategy, 'materialize');
    assert.ok(profilePlan.some((projection) => projection.skillName === 'planning-with-files'));
    assert.ok(profilePlan.some((projection) => projection.skillName === 'tdd'));
    assert.ok(!profilePlan.some((projection) => projection.skillName === 'goal-writer'));

    await materializeDirectoryProjection({
      sourcePath: skillProjection.sourcePath,
      targetPath: skillProjection.targetPath,
      ownedTargets: new Set(),
      conflictMode: 'reject'
    });
    const materializedMetadata = path.join(skillProjection.targetPath, 'agents/openai.yaml');
    await access(materializedMetadata);
    assert.match(await readFile(materializedMetadata, 'utf8'), /allow_implicit_invocation: false/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
