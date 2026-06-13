import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { evaluateAutonomousReleaseClosureFixtures } from '../../harness/core/skills/autonomous-release-closure/lib/evaluate-autonomous-release-closure.mjs';

const execFileAsync = promisify(execFile);
const skillRoot = path.resolve('harness/core/skills/autonomous-release-closure');
const scriptPath = path.resolve(
  'harness/core/skills/autonomous-release-closure/scripts/evaluate-autonomous-release-closure.mjs'
);

test('autonomous-release-closure fixtures pass hard checks', async () => {
  const report = await evaluateAutonomousReleaseClosureFixtures();

  assert.equal(report.summary.total, 5);
  assert.equal(report.summary.passed, 5);
  assert.equal(report.summary.failed, 0);
  assert.deepEqual(
    report.results.map((result) => result.id),
    [
      'disjoint-pr-ambiguity',
      'finishing-handoff',
      'loop-budget-fallback',
      'pr-closure',
      'stacked-promotion-chain'
    ]
  );

  for (const result of report.results) {
    assert.equal(result.pass, true, `${result.id}: ${result.notes.join('; ')}`);
  }

  assert.deepEqual(report.contract.requiredArtifacts, ['SKILL.md', 'template.md', 'examples.md']);
  assert.equal(report.contract.passed, 3);
  assert.equal(report.contract.failed, 0);
  assert.deepEqual(report.contract.scenarioCoverage.missing, []);
  assert.deepEqual(report.contract.scenarioCoverage.required, [
    'stacked promotion chain',
    'disjoint PR ambiguity',
    'finishing handoff',
    'loop budget / fallback'
  ]);

  const artifactMap = new Map(report.contract.results.map((result) => [result.id, result]));
  assert.deepEqual([...artifactMap.keys()].sort(), ['SKILL.md', 'examples.md', 'template.md']);

  for (const [artifactId, result] of artifactMap) {
    assert.equal(result.pass, true, `${artifactId}: ${result.notes.join('; ')}`);
    assert.ok(result.requiredSections.length > 0, `${artifactId} must declare required sections`);
    assert.deepEqual(result.missingSections, [], `${artifactId} should not miss required sections`);
  }

  assert.deepEqual(artifactMap.get('SKILL.md').coveredScenarios.sort(), [
    'disjoint PR ambiguity',
    'finishing handoff',
    'loop budget / fallback',
    'stacked promotion chain'
  ]);
  assert.deepEqual(artifactMap.get('template.md').coveredScenarios.sort(), [
    'disjoint PR ambiguity',
    'finishing handoff',
    'loop budget / fallback',
    'stacked promotion chain'
  ]);
  assert.deepEqual(artifactMap.get('examples.md').coveredScenarios.sort(), [
    'disjoint PR ambiguity',
    'finishing handoff',
    'stacked promotion chain'
  ]);
});

test('autonomous-release-closure CLI exits non-zero on contract-only failure', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'autonomous-release-closure-eval-'));

  try {
    const tempSkillRoot = path.join(tempRoot, 'autonomous-release-closure');
    await cp(skillRoot, tempSkillRoot, { recursive: true });

    await writeFile(
      path.join(tempSkillRoot, 'template.md'),
      '# Broken Template\n\nThis file intentionally removes required contract sections.\n',
      'utf8'
    );

    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath, '--json'], {
        cwd: path.resolve('.'),
        env: {
          ...process.env,
          HARNESS_AUTONOMOUS_RELEASE_CLOSURE_SKILL_ROOT: tempSkillRoot
        }
      }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /"failed": 1/);
        return true;
      }
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
