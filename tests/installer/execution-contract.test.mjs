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
