import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { evaluateChangeQuality } from '../../scripts/ci/lib/pr-quality.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const evaluatorPath = path.join(repositoryRoot, 'scripts', 'ci', 'lib', 'pr-quality.mjs');
const runnerPath = path.join(repositoryRoot, 'scripts', 'ci', 'run-pr-quality-gate.mjs');

const HEAD_SHA = 'h'.repeat(40);

function validPacket(overrides = {}) {
  return {
    schema: 'swf/change-quality-gate-packet',
    version: 1,
    binding: {
      base: { ref: 'origin/dev', sha: 'b'.repeat(40) },
      taskOrSpec: { id: 'wave-5-change-quality-gate', reference: 'docs/coding-harness-sop.md' },
      head: { sha: HEAD_SHA }
    },
    changedPaths: ['scripts/ci/lib/pr-quality.mjs', 'tests/automation/pr-quality-lib.test.mjs'],
    behavior: {
      changed: true,
      description: 'Validate a read-only change-quality evidence packet.',
      specReference: 'docs/coding-harness-implementation-plan.md#acceptance-proof'
    },
    riskMatrix: [
      {
        id: 'normal-input',
        kind: 'normal',
        risk: 'A complete packet is accepted.',
        applicable: true,
        result: 'passed',
        evidence: 'acceptance fixture'
      },
      {
        id: 'invalid-boundary',
        kind: 'boundary',
        risk: 'Missing or unsafe evidence is rejected.',
        applicable: true,
        result: 'passed',
        evidence: 'rejection fixtures'
      }
    ],
    redGreen: {
      red: {
        observed: true,
        command: 'node --test tests/automation/pr-quality-lib.test.mjs',
        exitCode: 1,
        failure: 'Module was missing before implementation.'
      },
      green: {
        observed: true,
        smallest: true,
        command: 'node --test tests/automation/pr-quality-lib.test.mjs',
        exitCode: 0,
        result: 'focused fixture suite passed'
      }
    },
    defect: {
      triggered: false,
      regression: null,
      siblingScan: null
    },
    focusedVerification: [
      {
        command: 'node --test tests/automation/pr-quality-lib.test.mjs',
        exitCode: 0,
        result: 'focused fixture suite passed'
      }
    ],
    gitDiffCheck: { ran: true, exitCode: 0 },
    reviews: {
      standards: {
        status: 'passed',
        headSha: HEAD_SHA,
        findings: []
      },
      spec: {
        status: 'passed',
        headSha: HEAD_SHA,
        findings: []
      }
    },
    limitations: ['Does not prove clean CI or runtime delivery.'],
    verificationPlanes: {
      required: ['source-test'],
      declared: [
        { plane: 'source-test', status: 'passed', evidence: 'focused fixture suite passed' }
      ]
    },
    freshness: {
      currentHeadSha: HEAD_SHA,
      reviewedHeadSha: HEAD_SHA,
      fixedPoint: true
    },
    requestedActions: [],
    ...overrides
  };
}

function assertRejected(packet, code) {
  const result = evaluateChangeQuality(packet);
  assert.equal(result.status, 'rejected');
  assert.equal(result.readOnly, true);
  assert.equal(result.errors[0].code, code);
  assert.match(result.errors[0].reason, /\S/);
  return result;
}

function runRunner(input, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath, ...args], { cwd: repositoryRoot });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
    child.stdin.end(input);
  });
}

test('accepts a complete read-only packet with separate reviews and exact planes', () => {
  const result = evaluateChangeQuality(validPacket());

  assert.deepEqual(result, {
    schema: 'swf/change-quality-gate-result',
    version: 1,
    status: 'accepted',
    readOnly: true,
    errors: []
  });
});

test('acceptance preserves applicable defect regression and sibling-scan evidence', () => {
  const result = evaluateChangeQuality(validPacket({
    defect: {
      triggered: true,
      regression: {
        oldCodeFailed: true,
        minimal: true,
        command: 'node --test tests/automation/pr-quality-lib.test.mjs',
        exitCode: 1,
        evidence: 'minimal old-code-failing fixture'
      },
      siblingScan: {
        performed: true,
        result: 'no sibling paths share the faulty assumption',
        evidence: 'bounded source scan'
      }
    }
  }));

  assert.equal(result.status, 'accepted');
});

test('rejects each missing binding and required evidence category', () => {
  const cases = [
    ['base', { binding: { taskOrSpec: validPacket().binding.taskOrSpec, head: validPacket().binding.head } }, 'missing_base'],
    ['task/spec', { binding: { base: validPacket().binding.base, head: validPacket().binding.head } }, 'missing_task_or_spec'],
    ['head', { binding: { base: validPacket().binding.base, taskOrSpec: validPacket().binding.taskOrSpec } }, 'missing_head'],
    ['changed paths', { changedPaths: [] }, 'missing_changed_paths'],
    ['behavior', { behavior: {} }, 'missing_behavior'],
    ['risk matrix', { riskMatrix: [] }, 'missing_risk_matrix'],
    ['focused verification', { focusedVerification: [] }, 'missing_focused_verification'],
    ['git diff check', { gitDiffCheck: { ran: false, exitCode: null } }, 'git_diff_check_missing'],
    ['standards review', { reviews: { ...validPacket().reviews, standards: null } }, 'missing_standards_review'],
    ['spec review', { reviews: { ...validPacket().reviews, spec: null } }, 'missing_spec_review'],
    ['limitations', { limitations: [] }, 'missing_limitations'],
    ['verification planes', { verificationPlanes: { required: [], declared: [] } }, 'missing_verification_planes']
  ];

  for (const [label, override, code] of cases) {
    assertRejected(validPacket(override), code);
    assert.notEqual(label, '', 'case label is part of the fixture matrix');
  }
});

test('rejects behavior changes without real RED-to-smallest-GREEN evidence', () => {
  assertRejected(validPacket({ redGreen: null }), 'missing_red_green');
  assertRejected(validPacket({
    redGreen: {
      red: { observed: false, command: 'not-run', exitCode: 0, failure: '' },
      green: validPacket().redGreen.green
    }
  }), 'red_not_real');
  assertRejected(validPacket({
    redGreen: {
      red: validPacket().redGreen.red,
      green: { observed: false, command: 'not-run', exitCode: 1, result: '' }
    }
  }), 'green_not_smallest');
});

test('requires RED and old-code regression exit codes to be numeric and non-zero', () => {
  for (const exitCode of [undefined, '1', Number.NaN]) {
    assertRejected(validPacket({
      redGreen: {
        red: { ...validPacket().redGreen.red, exitCode },
        green: validPacket().redGreen.green
      }
    }), 'red_not_real');
  }

  for (const exitCode of [undefined, '1', Number.NaN]) {
    assertRejected(validPacket({
      defect: {
        triggered: true,
        regression: {
          ...validPacket().defect.regression,
          exitCode
        },
        siblingScan: validPacket().defect.siblingScan
      }
    }), 'missing_old_code_regression');
  }
});

test('rejects insufficient risk coverage and failed required verification', () => {
  assertRejected(validPacket({
    riskMatrix: [
        { id: 'normal-input', kind: 'normal', risk: 'normal', applicable: true, result: 'passed', evidence: 'only one cell' }
    ]
  }), 'insufficient_risk_coverage');
  assertRejected(validPacket({
    riskMatrix: validPacket().riskMatrix.map((cell) => ({ ...cell, result: 'failed' }))
  }), 'risk_result_failed');
  assertRejected(validPacket({
    focusedVerification: [{ command: 'focused', exitCode: 1, result: 'failed' }]
  }), 'focused_verification_failed');
  assertRejected(validPacket({ gitDiffCheck: { ran: true, exitCode: 1 } }), 'git_diff_check_failed');
});

test('requires defect regression and sibling scan only when the defect trigger applies', () => {
  const defective = validPacket({
    defect: { triggered: true, regression: null, siblingScan: null }
  });
  assertRejected(defective, 'missing_old_code_regression');

  assertRejected(validPacket({
    defect: {
      triggered: true,
      regression: { oldCodeFailed: true, minimal: true, command: 'repro', exitCode: 1, evidence: 'red' },
      siblingScan: { performed: false, result: '', evidence: '' }
    }
  }), 'missing_sibling_scan');
});

test('rejects stale review after the current head moved', () => {
  assertRejected(validPacket({
    freshness: {
      currentHeadSha: 'n'.repeat(40),
      reviewedHeadSha: HEAD_SHA,
      fixedPoint: true
    }
  }), 'stale_review_after_head_movement');
  assertRejected(validPacket({
    freshness: {
      currentHeadSha: HEAD_SHA,
      reviewedHeadSha: HEAD_SHA,
      fixedPoint: false
    }
  }), 'not_fixed_point');
});

test('rejects any requested external action and remains deterministic', () => {
  const packet = validPacket({ requestedActions: ['git push'] });
  const first = assertRejected(packet, 'external_action_requested');
  assert.deepEqual(first, evaluateChangeQuality(packet));
  assertRejected(validPacket({ externalActions: { push: true } }), 'external_action_requested');
  assertRejected(validPacket({ externalActions: { push: { enabled: true } } }), 'external_action_requested');
  assert.equal(
    evaluateChangeQuality(validPacket({
      externalActions: { push: { enabled: false }, commit: {}, merge: false }
    })).status,
    'accepted'
  );
});

test('CLI emits only JSON and uses exit status for an accepted or rejected packet', async () => {
  const accepted = await runRunner(JSON.stringify(validPacket()));
  assert.equal(accepted.exitCode, 0);
  assert.equal(accepted.stderr, '');
  assert.deepEqual(JSON.parse(accepted.stdout), evaluateChangeQuality(validPacket()));

  const rejected = await runRunner(JSON.stringify(validPacket({ requestedActions: ['git push'] })));
  assert.equal(rejected.exitCode, 1);
  assert.equal(rejected.stderr, '');
  assert.equal(JSON.parse(rejected.stdout).errors[0].code, 'external_action_requested');
});

test('the evaluator and runner contain no mutation or hook execution seam', async () => {
  const [evaluator, runner] = await Promise.all([
    readFile(evaluatorPath, 'utf8'),
    readFile(runnerPath, 'utf8')
  ]);

  for (const source of [evaluator, runner]) {
    assert.doesNotMatch(source, /\b(?:execFile|spawn|writeFile|appendFile|mkdir|rm|unlink|rename)\b/);
    assert.doesNotMatch(source, /git\s+(?:add|commit|push|merge|reset|checkout)\b/i);
    assert.doesNotMatch(source, /\b(?:gh|hub)\s+(?:pr|api|issue)\b/i);
    assert.doesNotMatch(source, /(?:hook|heartbeat)/i);
  }
});
