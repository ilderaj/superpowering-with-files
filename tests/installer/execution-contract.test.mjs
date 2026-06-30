import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseExecutionContract,
  validateExecutionContract
} from '../../harness/runtime/execution-contract.mjs';

test('parseExecutionContract returns units from the Execution Contract section', () => {
  const markdown = `
## Execution Contract

### Unit: unit-01
- Kind: implementation
- Status: planned
- Scope:
  - Do: add the contract section
  - Not do: persist receipts
- Owner Mode: inline
- Allowed Ops:
  - Files: harness/core/**
  - Commands: node --test
  - External effects: none
- Dependencies:
  - none
- Verification Plan:
  - node --test tests/installer/execution-contract.test.mjs
- Return Artifacts:
  - patch
- Integration Target:
  - progress.md
- Exit Criteria:
  - template updated and tests pass
`;

  const contract = parseExecutionContract(markdown);
  assert.equal(contract.units.length, 1);
  assert.equal(contract.units[0].unit_id, 'unit-01');
  assert.equal(contract.units[0].kind, 'implementation');
  assert.equal(contract.units[0].status, 'planned');
  assert.deepEqual(contract.units[0].scope.do, ['add the contract section']);
  assert.deepEqual(contract.units[0].scope.not_do, ['persist receipts']);
  assert.deepEqual(contract.units[0].dependencies, ['none']);
  assert.deepEqual(contract.units[0].verification_plan, ['node --test tests/installer/execution-contract.test.mjs']);
});

test('validateExecutionContract reports missing required fields', () => {
  const markdown = `
## Execution Contract

### Unit: unit-01
- Kind: implementation
`;

  const contract = parseExecutionContract(markdown);
  const result = validateExecutionContract(contract);
  assert.equal(result.ok, false);
  assert.match(result.reasons.join('\n'), /Status/i);
  assert.match(result.reasons.join('\n'), /Owner Mode/i);
  assert.match(result.reasons.join('\n'), /Verification Plan/i);
  assert.match(result.reasons.join('\n'), /Exit Criteria/i);
});

test('parseExecutionContract returns no units when the section is absent', () => {
  const contract = parseExecutionContract('# Task Plan\n\n## Goal\nShip it.\n');
  assert.deepEqual(contract, { units: [] });
  assert.deepEqual(validateExecutionContract(contract), { ok: true, reasons: [] });
});

test('validateExecutionContract rejects unknown lifecycle states', () => {
  const markdown = `
## Execution Contract

### Unit: unit-01
- Kind: implementation
- Status: shipped
- Scope:
  - Do: add the contract section
  - Not do: persist receipts
- Owner Mode: inline
- Allowed Ops:
  - Files: harness/core/**
  - Commands: node --test
  - External effects: none
- Dependencies:
  - none
- Verification Plan:
  - node --test tests/installer/execution-contract.test.mjs
- Return Artifacts:
  - patch
- Integration Target:
  - progress.md
- Exit Criteria:
  - template updated and tests pass
`;

  const contract = parseExecutionContract(markdown);
  const result = validateExecutionContract(contract);
  assert.equal(result.ok, false);
  assert.match(result.reasons.join('\n'), /unknown Status/i);
});

test('parseExecutionContract ignores a neighboring Verification Contract section', () => {
  const markdown = `
## Execution Contract

### Unit: unit-01
- Kind: implementation
- Status: planned
- Scope:
  - Do: keep execution parsing stable
  - Not do: infer verification status
- Owner Mode: inline
- Allowed Ops:
  - Files: harness/core/**
  - Commands: node --test
  - External effects: none
- Dependencies:
  - none
- Verification Plan:
  - node --test tests/installer/execution-contract.test.mjs
- Return Artifacts:
  - patch
- Integration Target:
  - progress.md
- Exit Criteria:
  - execution parser stays deterministic

## Verification Contract

### Mode: execution
- Proof Target: command output matches the task claim
- Primary Proof:
  - node --test tests/installer/execution-contract.test.mjs
- Backstop Proof:
  - capture the failing output before retrying
- Escalation Trigger:
  - if execution evidence is stale
- Evidence Sink:
  - progress.md
- Reconcile Rule:
  - compare expected and actual verification output
- Unacceptable Substitute:
  - claiming the change should work
`;

  const contract = parseExecutionContract(markdown);
  const result = validateExecutionContract(contract);

  assert.equal(contract.units.length, 1);
  assert.equal(contract.units[0].unit_id, 'unit-01');
  assert.equal(result.ok, true);
  assert.deepEqual(result.reasons, []);
});

test('validateExecutionContract accepts multiple units with explicit Do and Not do boundaries', () => {
  const contract = parseExecutionContract(`
## Execution Contract

### Unit: unit-a
- Kind: implementation
- Status: planned
- Scope:
  - Do: change code
  - Not do: widen scope
- Owner Mode: inline
- Allowed Ops:
  - Files: a
  - Commands: b
  - External effects: none
- Dependencies:
  - x
- Verification Plan:
  - y
- Return Artifacts:
  - z
- Integration Target:
  - p
- Exit Criteria:
  - q

### Unit: unit-b
- Kind: verification
- Status: verified
- Scope:
  - Do: confirm proof output
  - Not do: rewrite implementation
- Owner Mode: inline
- Allowed Ops:
  - Files: tests/**
  - Commands: node --test
  - External effects: none
- Dependencies:
  - unit-a
- Verification Plan:
  - node --test tests/installer/execution-contract.test.mjs
- Return Artifacts:
  - report
- Integration Target:
  - progress.md
- Exit Criteria:
  - proof is recorded
`);

  assert.equal(validateExecutionContract(contract).ok, true);
  assert.equal(contract.units.length, 2);
});
