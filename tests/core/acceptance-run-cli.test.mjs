import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptPath = path.resolve('tests/evals/ponytail-borrowings/scripts/evaluate-acceptance-runs.mjs');

test('acceptance-run CLI prints the default text report', async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath], {
    cwd: path.resolve('.')
  });

  assert.equal(stderr, '');
  assert.match(stdout, /Ponytail Acceptance Run: 5\/5 scenarios favor the borrowed side/);
  assert.match(stdout, /Verdict: PASS/);
});

test('acceptance-run CLI renders markdown when requested', async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath, '--markdown'], {
    cwd: path.resolve('.')
  });

  assert.equal(stderr, '');
  assert.match(stdout, /# Ponytail Borrowings Acceptance Scorecard/);
  assert.match(stdout, /- Verdict: \*\*PASS\*\*/);
});

test('acceptance-run CLI exits non-zero for a failing custom run file', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'acceptance-run-cli-'));

  try {
    await writeFile(
      path.join(tempRoot, 'failing.json'),
      JSON.stringify(
        {
          runId: 'failing-cli-sample',
          scenarios: [
            {
              id: 'only-one',
              title: 'Single weak scenario',
              category: 'implementation',
              winner: 'baseline',
              metrics: {
                baseline: {
                  newDependencies: 0,
                  filesChanged: 1,
                  diffLines: 5,
                  validationPreserved: true,
                  simplerWithoutSloppier: false
                },
                borrowed: {
                  newDependencies: 0,
                  filesChanged: 1,
                  diffLines: 5,
                  validationPreserved: false,
                  simplerWithoutSloppier: false
                }
              },
              winReasons: []
            }
          ]
        },
        null,
        2
      ),
      'utf8'
    );

    await assert.rejects(
      execFileAsync(
        process.execPath,
        [scriptPath, '--eval-root', tempRoot, '--file', 'failing.json'],
        {
          cwd: path.resolve('.')
        }
      ),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /Verdict: FAIL/);
        assert.match(error.stdout, /need at least 5 scenarios/);
        assert.equal(error.stderr, '');
        return true;
      }
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('acceptance-run CLI rejects unknown arguments', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [scriptPath, '--wat'], {
      cwd: path.resolve('.')
    }),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(error.stdout, '');
      assert.match(error.stderr, /Unknown argument: --wat/);
      return true;
    }
  );
});
