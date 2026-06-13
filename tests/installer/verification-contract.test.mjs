import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  parseVerificationContract,
  readVerificationContractSection,
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

test('parseVerificationContract normalizes away blank proof bullets and validation rejects them', () => {
  const blankBullet = `  -${' '.repeat(3)}`;
  const markdown = `
## Verification Contract

### Mode: execution
- Proof Target:
  - current implementation behavior matches scoped task intent
- Primary Proof:
${blankBullet}
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
  assert.deepEqual(contract.modes[0].primary_proof, []);

  const result = validateVerificationContract(contract);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['Mode execution is missing Primary Proof.']);
});

test('parseVerificationContract returns no modes when the section is absent', () => {
  const contract = parseVerificationContract('# Task Plan\n\n## Goal\nShip it.\n');
  assert.deepEqual(contract, { modes: [] });
  assert.deepEqual(validateVerificationContract(contract), { ok: true, reasons: [] });
});

test('parseVerificationContract only recognizes an exact top-level Verification Contract section', () => {
  const markdown = `
# Task Plan

### Verification Contract
- not a real top-level section

## Verification Contract

### Mode: execution
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

## Notes
keep this outside the section
`;

  const contract = parseVerificationContract(markdown);
  assert.equal(contract.modes.length, 1);
  assert.equal(contract.modes[0].mode, 'execution');
});

test('parseVerificationContract ignores fenced Verification Contract examples', () => {
  const markdown = `
\`\`\`md
## Verification Contract

### Mode: review
- Proof Target:
  - example only
\`\`\`

## Verification Contract

### Mode: execution
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
`;

  const contract = parseVerificationContract(markdown);
  assert.equal(contract.modes.length, 1);
  assert.equal(contract.modes[0].mode, 'execution');
});

test('parseVerificationContract ignores similar section headings', () => {
  const pluralHeading = `
## Verification Contracts

### Mode: execution
- Proof Target:
  - current implementation behavior matches scoped task intent
`;
  const contract = parseVerificationContract(pluralHeading);
  assert.deepEqual(contract, { modes: [] });
});

test('the default task_plan template does not predeclare a Verification Contract section', async () => {
  const templatePath = path.join(
    process.cwd(),
    'harness/core/upstream-overlays/planning-with-files/templates/task_plan.md'
  );
  const markdown = await readFile(templatePath, 'utf8');

  assert.equal(readVerificationContractSection(markdown).present, false);
  assert.deepEqual(parseVerificationContract(markdown), { modes: [] });
});

test('validateVerificationContract accepts published canonical mode-family spellings', () => {
  const markdown = `
## Verification Contract

### Mode: design/planning
- Proof Target:
  - planning intent matches the approved scope
- Primary Proof:
  - review proof
- Backstop Proof:
  - lifecycle/governance proof
- Escalation Trigger:
  - planning contradictions appear during execution or review
- Evidence Sink:
  - findings.md
- Reconcile Rule:
  - reconcile before execution if scope or risk framing changed
- Unacceptable Substitute:
  - unit test pass without plan review

### Mode: acceptance/verify
- Proof Target:
  - delivered behavior satisfies acceptance intent
- Primary Proof:
  - BDD/acceptance proof
- Backstop Proof:
  - focused invariant proof
- Escalation Trigger:
  - acceptance proof passes while scoped invariants still drift
- Evidence Sink:
  - progress.md
- Reconcile Rule:
  - reconcile before close when acceptance evidence conflicts with review notes
- Unacceptable Substitute:
  - review-only approval without acceptance evidence

### Mode: reconcile/lifecycle
- Proof Target:
  - lifecycle state and durable records are consistent
- Primary Proof:
  - lifecycle/governance proof
- Backstop Proof:
  - operational proof
- Escalation Trigger:
  - closeout claims depend on stale or unsynced records
- Evidence Sink:
  - task_plan.md
- Reconcile Rule:
  - reconcile required before finish when durable state changed
- Unacceptable Substitute:
  - green code tests without lifecycle reconciliation

### Mode: operations/release/adoption
- Proof Target:
  - release or adoption state matches the intended operational outcome
- Primary Proof:
  - operational proof
- Backstop Proof:
  - lifecycle/governance proof
- Escalation Trigger:
  - release receipts or adoption status disagree with repo state
- Evidence Sink:
  - progress.md
- Reconcile Rule:
  - reconcile before close when operational state changed
- Unacceptable Substitute:
  - test pass without operational confirmation
`;

  const result = validateVerificationContract(parseVerificationContract(markdown));
  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('validateVerificationContract rejects mode names outside the canonical mode family vocabulary', () => {
  const markdown = `
## Verification Contract

### Mode: exection
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
`;

  const result = validateVerificationContract(parseVerificationContract(markdown));
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['Mode exection has unknown Mode name "exection".']);
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
  assert.equal(contract.modes.length, 2);
  assert.equal(contract.modes[0].mode, null);
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
