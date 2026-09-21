import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ARTIFACT_FACT_FIELDS,
  ARTIFACT_FACT_REASONS,
  OFFICE_ARTIFACT_KINDS,
  OFFICE_CHECK_IDS,
  OFFICE_EVIDENCE_VERSION,
  artifactFacts,
  collectOfficeEvidence,
  officeCheck,
  officeChecks,
  officeEvidence
} from '../../harness/trio/core/evidence.mjs';

import {
  DECISION_BUNDLE_VERSION,
  DECISION_BUNDLES,
  DECISION_SCHEMA_VERSION,
  failedDeterministicChecks,
  resolveComposites,
  validateDecisionRequest
} from '../../harness/trio/core/decision.mjs';

function officeVerifyRequest(deterministic) {
  const frozen = DECISION_BUNDLES.verify;
  return {
    schemaVersion: DECISION_SCHEMA_VERSION,
    bundle: 'verify',
    bundleVersion: DECISION_BUNDLE_VERSION,
    subject: { taskId: 'office-evidence-test', phase: 'verify', capability: 'office' },
    requirement: { mode: 'think', intensity: 'high' },
    evidence: { deterministic, semanticContext: null },
    questions: frozen.questions.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      ...(entry.options ? { options: [...entry.options] } : {}),
      ...(entry.scale ? { scale: [...entry.scale] } : {})
    }))
  };
}

const semanticPass = {
  goal_satisfied: true,
  requirements_covered: true,
  semantic_correctness: true,
  scope_preserved: true,
  verification_sufficient: true,
  regression_risk: 1,
  more_work_required: false
};

test('every declared office check is reported exactly once', () => {
  const checks = officeChecks({ pdf_structure: { exitCode: 0 } });
  assert.deepEqual(checks.map((check) => check.id), [...OFFICE_CHECK_IDS]);
  assert.equal(new Set(checks.map((check) => check.id)).size, checks.length);
  const byId = Object.fromEntries(checks.map((check) => [check.id, check]));
  assert.equal(byId.pdf_structure.status, 'pass');
  // An uninspected artifact family is unknown, never an assumed pass.
  assert.equal(byId.spreadsheet_formulas.status, 'unknown');
  assert.equal(byId.spreadsheet_formulas.reason, 'not-run');
});

test('a formula error or failed render is an observed fact, not a judgement', () => {
  const formula = officeCheck('spreadsheet_formulas', {
    exitCode: 1,
    errors: ['#REF! in Budget!D14'],
    coverage: 'Budget!A1:F40'
  });
  assert.equal(formula.status, 'fail');
  assert.equal(formula.reason, 'exit-nonzero');
  assert.deepEqual(formula.errors, ['#REF! in Budget!D14']);
  assert.equal(formula.coverage, 'Budget!A1:F40');
  assert.equal(officeCheck('presentation_render', { timedOut: true }).status, 'unknown');
  assert.equal(officeCheck('presentation_render', { timedOut: true }).reason, 'timed-out');
  assert.throws(() => officeCheck('spreadsheet_formulas', { errors: [''] }), /non-empty text entries/);
});

test('an undeclared office check id is rejected instead of silently recorded', () => {
  assert.throws(() => officeCheck('accessibility', { exitCode: 0 }), /Unknown office evidence check id/);
  assert.throws(() => officeChecks({ citation_check: { exitCode: 0 } }), /Unknown office evidence check id/);
});

test('artifact facts report file state without a verdict', () => {
  const facts = artifactFacts([
    { path: 'out/brief.docx', kind: 'document', present: true, bytes: 2048, sha256: 'abc123' },
    { path: 'out/deck.pptx', kind: 'presentation', present: false }
  ]);
  assert.deepEqual(Object.keys(facts[0]).sort(), [...ARTIFACT_FACT_FIELDS, 'reason'].sort());
  assert.equal(facts[0].reason, 'observed');
  assert.equal(facts[1].reason, 'missing');
  assert.equal(facts[1].present, false);
  for (const fact of facts) {
    assert.equal(Object.hasOwn(fact, 'status'), false, 'artifact facts must carry no check status');
    assert.equal(Object.hasOwn(fact, 'quality'), false);
    assert.ok(ARTIFACT_FACT_REASONS.includes(fact.reason));
  }
  assert.throws(() => artifactFacts([{ path: 'x', kind: 'deck' }]), /kind must be one of/);
  assert.throws(() => artifactFacts([{ path: 'x', kind: 'pdf', quality: 'good' }]), /Unknown artifact fact/);
  assert.throws(() => artifactFacts([{ path: 'x', kind: 'pdf', present: 'yes' }]), /must be a boolean or null/);
  assert.throws(() => artifactFacts([{ path: 'x', kind: 'pdf', bytes: -1 }]), /non-negative integer or null/);
  for (const kind of OFFICE_ARTIFACT_KINDS) {
    assert.equal(artifactFacts([{ path: 'x', kind }])[0].kind, kind);
  }
});

test('office adapter output carries observed facts and no opinion', () => {
  const evidence = officeEvidence({
    results: { pdf_structure: { exitCode: 0 } },
    artifacts: [{ path: 'out/brief.docx', kind: 'document', present: true }]
  });
  assert.deepEqual(Object.keys(evidence).sort(), ['artifacts', 'checks']);
  for (const forbidden of [
    'outcome', 'transition', 'decision', 'answer', 'answers', 'verdict',
    'recommendation', 'next_state', 'goal_satisfied', 'quality', 'score'
  ]) {
    assert.equal(Object.hasOwn(evidence, forbidden), false, `evidence must not carry ${forbidden}`);
  }
});

test('office adapter output satisfies the verify bundle evidence contract', () => {
  const request = validateDecisionRequest(
    officeVerifyRequest(officeEvidence({ results: { spreadsheet_formulas: { exitCode: 1 } } }))
  );
  assert.deepEqual(request.subject.capability, 'office');
  assert.deepEqual(failedDeterministicChecks(request.evidence.deterministic), ['spreadsheet_formulas']);
});

// Section 19 office pair, both directions, through the frozen verify composite.
test('deterministic artifact checks pass but semantic quality fails', () => {
  const evidence = officeEvidence({
    results: Object.fromEntries(OFFICE_CHECK_IDS.map((id) => [id, { exitCode: 0 }])),
    artifacts: [{ path: 'out/deck.pptx', kind: 'presentation', present: true }]
  });
  const request = validateDecisionRequest(officeVerifyRequest(evidence));
  assert.deepEqual(failedDeterministicChecks(request.evidence.deterministic), []);
  const composites = resolveComposites('verify', { ...semanticPass, semantic_correctness: false, more_work_required: true }, {
    deterministic: request.evidence.deterministic
  });
  // The deterministic half is clean, so the semantic failure decides: repair.
  assert.equal(composites.next_state, 'repair');
});

test('semantic quality passes but deterministic artifact validation fails', () => {
  const evidence = officeEvidence({
    results: Object.fromEntries(OFFICE_CHECK_IDS.map((id) => [id, { exitCode: 0 }])),
    artifacts: [{ path: 'out/budget.xlsx', kind: 'spreadsheet', present: true }]
  });
  const failing = officeEvidence({
    results: {
      ...Object.fromEntries(OFFICE_CHECK_IDS.map((id) => [id, { exitCode: 0 }])),
      spreadsheet_formulas: { exitCode: 1, errors: ['#DIV/0! in Totals!B9'] }
    },
    artifacts: [{ path: 'out/budget.xlsx', kind: 'spreadsheet', present: true }]
  });
  assert.deepEqual(failedDeterministicChecks(validateDecisionRequest(officeVerifyRequest(evidence)).evidence.deterministic), []);
  const request = validateDecisionRequest(officeVerifyRequest(failing));
  assert.deepEqual(failedDeterministicChecks(request.evidence.deterministic), ['spreadsheet_formulas']);
  const composites = resolveComposites('verify', { ...semanticPass }, {
    deterministic: request.evidence.deterministic
  });
  // A semantic pass can never override an observed failure.
  assert.equal(composites.next_state, 'repair');
  const outOfScope = resolveComposites('verify', { ...semanticPass, scope_preserved: false }, {
    deterministic: request.evidence.deterministic
  });
  assert.equal(outOfScope.next_state, 'replan');
});

test('collection records what an inspector observed and never throws for a check', async () => {
  const calls = [];
  const evidence = await collectOfficeEvidence({
    inspections: [
      { id: 'document_structure', command: 'unzip -l out/brief.docx' },
      { id: 'pdf_structure', command: 'pdfinfo out/review.pdf' }
    ],
    inspect: async (command, { id }) => {
      calls.push(id);
      if (id === 'document_structure') return { exitCode: 0, durationMs: 3 };
      throw new Error('inspector unavailable');
    }
  });
  assert.deepEqual(calls, ['document_structure', 'pdf_structure']);
  const byId = Object.fromEntries(evidence.checks.map((check) => [check.id, check]));
  assert.equal(byId.document_structure.status, 'pass');
  assert.equal(byId.pdf_structure.status, 'unknown');
  assert.equal(byId.pdf_structure.reason, 'not-run');
  assert.equal(Object.hasOwn(byId, 'presentation_render'), false);
  assert.deepEqual(evidence.artifacts, []);
});

test('collection reads artifact facts and survives a failing reader', async () => {
  const withArtifacts = await collectOfficeEvidence({
    inspections: [{ id: 'pdf_structure', command: 'pdfinfo out/review.pdf' }],
    inspect: async () => ({ exitCode: 0 }),
    readArtifacts: async () => [{ path: 'out/review.pdf', kind: 'pdf', present: true, bytes: 10 }]
  });
  assert.equal(withArtifacts.artifacts[0].reason, 'observed');
  assert.equal(withArtifacts.artifacts[0].kind, 'pdf');
  const brokenReader = await collectOfficeEvidence({
    inspections: [{ id: 'pdf_structure', command: 'pdfinfo out/review.pdf' }],
    inspect: async () => ({ exitCode: 0 }),
    readArtifacts: async () => { throw new Error('artifact root missing'); }
  });
  assert.deepEqual(brokenReader.artifacts, []);
  assert.equal(brokenReader.checks.find((check) => check.id === 'pdf_structure').status, 'pass');
});

test('collection rejects an undeclared or duplicated inspection set', async () => {
  const inspect = async () => ({ exitCode: 0 });
  await assert.rejects(() => collectOfficeEvidence({ inspections: [], inspect }), /non-empty array/);
  await assert.rejects(
    () => collectOfficeEvidence({ inspections: [{ id: 'accessibility', command: 'x' }], inspect }),
    /Unknown office evidence check id/
  );
  await assert.rejects(
    () => collectOfficeEvidence({
      inspections: [{ id: 'pdf_structure', command: 'a' }, { id: 'pdf_structure', command: 'b' }],
      inspect
    }),
    /Duplicate office evidence check id/
  );
  await assert.rejects(() => collectOfficeEvidence({ inspections: [{ id: 'pdf_structure', command: '' }], inspect }), /non-empty text/);
  await assert.rejects(() => collectOfficeEvidence({ inspections: [{ id: 'pdf_structure', command: 'x' }] }), /inspect function/);
});

test('the office adapter reuses the declared check ids and adds no model vocabulary', async () => {
  const source = await (await import('node:fs/promises')).readFile(
    new URL('../../harness/trio/core/evidence.mjs', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /deepseek|gpt-|luna|sol\b|terra|opencode|claude/i);
  // The four ids mirror the artifact families the office capability already names.
  assert.deepEqual([...OFFICE_CHECK_IDS].sort(), [
    'document_structure',
    'pdf_structure',
    'presentation_render',
    'spreadsheet_formulas'
  ]);
  assert.equal(OFFICE_EVIDENCE_VERSION, 1);
});

test('deterministic serialization is stable for identical office observations', () => {
  const build = () => officeEvidence({
    results: { pdf_structure: { exitCode: 0, command: 'pdfinfo out/review.pdf' } },
    artifacts: [{ path: 'out/review.pdf', kind: 'pdf', present: true, bytes: 10 }]
  });
  assert.equal(JSON.stringify(build()), JSON.stringify(build()));
});


test('S1 limits office evidence to explicit requiredCheckIds and preserves default compatibility', () => {
  const selected = officeEvidence({
    requiredCheckIds: ['document_structure'],
    results: { document_structure: { exitCode: 0 } }
  });
  assert.deepEqual(selected.checks.map((check) => check.id), ['document_structure']);
  assert.equal(selected.checks[0].status, 'pass');
  assert.deepEqual(officeEvidence({ results: { document_structure: { exitCode: 0 } } }).checks.map((check) => check.id), [...OFFICE_CHECK_IDS]);
  assert.deepEqual(officeEvidence({ requiredCheckIds: [], results: {} }).checks, []);
  assert.throws(() => officeEvidence({ requiredCheckIds: ['pdf_structure', 'pdf_structure'], results: {} }), /Duplicate office evidence check id/);
  assert.throws(() => officeEvidence({ requiredCheckIds: ['pdf_structure'], results: { document_structure: { exitCode: 1 } } }), /outside required office evidence scope/);
  assert.throws(() => officeEvidence({ requiredCheckIds: ['missing'], results: {} }), /Unknown office evidence check id/);
});

test('S1 derives office required scope from inspections and preserves timeout facts', async () => {
  const evidence = await collectOfficeEvidence({
    inspections: [{ id: 'pdf_structure', command: 'pdfinfo out/review.pdf' }],
    inspect: async () => ({ timedOut: true })
  });
  assert.deepEqual(evidence.checks.map((check) => check.id), ['pdf_structure']);
  assert.equal(evidence.checks[0].status, 'unknown');
  assert.equal(evidence.checks[0].reason, 'timed-out');
});
