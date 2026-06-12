import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseVerificationContract,
  validateVerificationContract
} from '../../harness/runtime/verification-contract.mjs';

test('parseVerificationContract returns mode entries from the Verification Contract section', () => {
  const markdown = `
## Verification Contract

### Mode: execution
- Proof Target:
  - current implementation behavior matches scoped task intent
- Primary Proof:
  - focused unit tests
  - targeted integration test
- Backstop Proof:
  - spec compliance review
- Escalation Trigger:
  - repeated verification failure indicates a plan issue rather than unfinished code
- Evidence Sink:
  - progress.md
- Reconcile Rule:
  - reconcile required before finish when behavior changed
- Unacceptable Substitute:
  - BDD-only pass without invariant coverage
`;

  const contract = parseVerificationContract(markdown);
  assert.equal(contract.modes.length, 1);
  assert.equal(contract.modes[0].mode, 'execution');
  assert.deepEqual(contract.modes[0].proof_target, [
    'current implementation behavior matches scoped task intent'
  ]);
  assert.deepEqual(contract.modes[0].primary_proof, [
    'focused unit tests',
    'targeted integration test'
  ]);
  assert.deepEqual(contract.modes[0].backstop_proof, ['spec compliance review']);
  assert.deepEqual(contract.modes[0].evidence_sink, ['progress.md']);
});

test('validateVerificationContract reports missing required fields', () => {
  const markdown = `
## Verification Contract

### Mode: execution
- Proof Target:
  - current implementation behavior matches scoped task intent
- Primary Proof:
  - focused unit tests
`;

  const contract = parseVerificationContract(markdown);
  const result = validateVerificationContract(contract);
  assert.equal(result.ok, false);
  assert.match(result.reasons.join('\n'), /Backstop Proof/i);
  assert.match(result.reasons.join('\n'), /Escalation Trigger/i);
  assert.match(result.reasons.join('\n'), /Evidence Sink/i);
  assert.match(result.reasons.join('\n'), /Reconcile Rule/i);
  assert.match(result.reasons.join('\n'), /Unacceptable Substitute/i);
});

test('parseVerificationContract returns no modes when the section is absent', () => {
  const contract = parseVerificationContract('# Task Plan\n\n## Goal\nShip it.\n');
  assert.deepEqual(contract, { modes: [] });
  assert.deepEqual(validateVerificationContract(contract), { ok: true, reasons: [] });
});

test('validateVerificationContract reports deterministic reasons for malformed mode entries', () => {
  const markdown = `
## Verification Contract

### Mode:
- Proof Target:
  - current implementation behavior matches scoped task intent
- Primary Proof:
  - focused unit tests
- Backstop Proof:
  - spec compliance review
- Escalation Trigger:
  - repeated verification failure indicates a plan issue rather than unfinished code
- Evidence Sink:
  - progress.md
- Reconcile Rule:
  - reconcile required before finish when behavior changed
- Unacceptable Substitute:
  - BDD-only pass without invariant coverage

### Mode: review
- Proof Target:
  - reviewer verifies scoped behavior and policy alignment
- Primary Proof:
  - code quality review
`;

  const contract = parseVerificationContract(markdown);
  const result = validateVerificationContract(contract);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, [
    'Verification mode entry #1 is missing Mode name.',
    'Mode review is missing Backstop Proof.',
    'Mode review is missing Escalation Trigger.',
    'Mode review is missing Evidence Sink.',
    'Mode review is missing Reconcile Rule.',
    'Mode review is missing Unacceptable Substitute.'
  ]);
});
