import { describe, expect, it } from 'vitest';

import {
  assertAuthorityBinding,
  assertTrioBinding,
  bindingsMatch,
  compareTrioBindings,
  sha256Hex,
  buildAssignmentPacket
} from '../src/core/index.js';
import {
  makeAuthority,
  makeBinding,
  makeMismatchedAuthority,
  makePacketInput,
  sha
} from './helpers.js';

describe('binding validation (Slice 0 golden: binding_mismatch)', () => {
  it('accepts a valid authority binding', () => {
    expect(() => assertAuthorityBinding(makeAuthority())).not.toThrow();
  });

  it('throws binding_mismatch when the observation sha256 differs from authority', () => {
    expect(() => assertAuthorityBinding(makeMismatchedAuthority()))
      .toThrow('Assignment packet binding observation does not match the authority binding.');
  });

  it('bindingsMatch is false on any file sha256 difference', () => {
    const binding = makeBinding();
    const other = {
      ...binding,
      files: {
        ...binding.files,
        findings: { ...binding.files.findings, sha256: sha('e') }
      }
    };
    expect(bindingsMatch(binding, other)).toBe(false);
    expect(bindingsMatch(binding, binding)).toBe(true);
  });

  it('rejects non-absolute authorityRoot', () => {
    const bad = makeBinding();
    bad.authorityRoot = 'relative/root';
    expect(() => assertAuthorityBinding({ binding: bad, bindingObservation: bad }))
      .toThrow('Assignment packet authority binding authorityRoot must be an absolute path.');
  });

  it('rejects invalid taskId', () => {
    const bad = makeBinding();
    bad.taskId = 'a/b';
    expect(() => assertAuthorityBinding({ binding: bad, bindingObservation: bad }))
      .toThrow('Assignment packet authority binding taskId is invalid.');
  });

  it('rejects a missing Trio file key', () => {
    const bad = makeBinding();
    delete bad.files.progress;
    expect(() => assertAuthorityBinding({ binding: bad, bindingObservation: bad }))
      .toThrow('Assignment packet authority binding must contain exactly three Trio file bindings.');
  });

  it('rejects a file path that escapes the task directory', () => {
    const bad = makeBinding();
    bad.files.taskPlan = { ...bad.files.taskPlan, path: '/repo/planning/active/other/task_plan.md' };
    expect(() => assertAuthorityBinding({ binding: bad, bindingObservation: bad }))
      .toThrow('Assignment packet authority binding has an invalid taskPlan file binding.');
  });

  it('rejects a malformed sha256', () => {
    const bad = makeBinding();
    bad.files.progress = { ...bad.files.progress, sha256: 'not-a-hash' };
    expect(() => assertAuthorityBinding({ binding: bad, bindingObservation: bad }))
      .toThrow('Assignment packet authority binding has an invalid progress file binding.');
  });
});

describe('assertTrioBinding (read.mjs port)', () => {
  it('accepts a valid Trio binding', () => {
    expect(() => assertTrioBinding(makeBinding())).not.toThrow();
  });

  it('rejects non-object with the ERR_TRIO_INVALID_BINDING code', () => {
    try {
      assertTrioBinding(null);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).toBe('Trio binding must be an object.');
      expect((error as { code?: string }).code).toBe('ERR_TRIO_INVALID_BINDING');
    }
  });

  it('rejects missing keys with the exact three-files error', () => {
    const bad = makeBinding();
    delete bad.files.findings;
    expect(() => assertTrioBinding(bad))
      .toThrow('Trio binding must include exactly the three Trio files.');
  });

  it('rejects an invalid entry naming the exact key', () => {
    const bad = makeBinding();
    bad.files.taskPlan = { ...bad.files.taskPlan, path: '/elsewhere' };
    expect(() => assertTrioBinding(bad))
      .toThrow('Trio binding has an invalid taskPlan entry.');
  });
});

describe('compareTrioBindings (verifyTrioBinding logic)', () => {
  it('returns match when bindings are identical', () => {
    const result = compareTrioBindings(makeBinding(), makeBinding());
    expect(result.status).toBe('match');
    expect(result.matches).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  it('returns mismatch listing the drifted key', () => {
    const expected = makeBinding();
    const observed = {
      ...expected,
      files: {
        ...expected.files,
        taskPlan: { ...expected.files.taskPlan, sha256: sha('9') }
      }
    };
    const result = compareTrioBindings(expected, observed);
    expect(result.status).toBe('mismatch');
    expect(result.matches).toBe(false);
    expect(result.mismatches).toEqual(['taskPlan']);
  });
});

describe('sha256 binding helper', () => {
  it('computes the sha256 of a buffer deterministically', () => {
    expect(sha256Hex(new TextEncoder().encode('abc')))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('packet-level binding enforcement', () => {
  it('buildAssignmentPacket rejects a mismatched binding observation', () => {
    const input = makePacketInput();
    input.authority = makeMismatchedAuthority();
    expect(() => buildAssignmentPacket(input))
      .toThrow('Assignment packet binding observation does not match the authority binding.');
  });
});
