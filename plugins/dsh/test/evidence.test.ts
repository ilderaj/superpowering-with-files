import { describe, expect, it } from 'vitest';

import {
  classifyEvidenceState,
  evidenceAcceptable,
  evidenceRecord,
  requireNotHostClaimedAsAuthenticated
} from '../src/core/index.js';

describe('three-state evidence (feasibility report decision 8)', () => {
  it('classifies verifiable Host evidence as authenticated', () => {
    expect(classifyEvidenceState({ authenticated: true, evidenceRef: 'host://ref/1' }))
      .toBe('authenticated');
    expect(classifyEvidenceState({
      authenticated: true,
      evidenceRef: 'host://ref/1',
      packetDigest: 'd1',
      expectedPacketDigest: 'd1'
    })).toBe('authenticated');
  });

  it('fails a claimed-but-unverifiable record to unknown (never authenticated)', () => {
    expect(classifyEvidenceState({ authenticated: true })).toBe('unknown');
    expect(classifyEvidenceState({
      authenticated: true,
      evidenceRef: 'host://ref/1',
      packetDigest: 'd1',
      expectedPacketDigest: 'd2'
    })).toBe('unknown');
  });

  it('classifies a recorded dsh dispatch as host-claimed', () => {
    expect(classifyEvidenceState({
      sessionId: 's-1',
      provider: 'dsh-sdk',
      declaredModel: 'deepseek-v4-flash'
    })).toBe('host-claimed');
  });

  it('never treats a host-claimed record as authenticated even when flagged', () => {
    // A host-claimed record that also claims authenticated fails closed to
    // unknown rather than being upgraded.
    expect(classifyEvidenceState({
      authenticated: true,
      sessionId: 's-1',
      provider: 'dsh-sdk',
      declaredModel: 'deepseek-v4-flash'
    })).toBe('unknown');
  });

  it('classifies an empty record as unknown', () => {
    expect(classifyEvidenceState({})).toBe('unknown');
  });

  it('builds evidence records with the invariant enforced', () => {
    const hostClaimed = evidenceRecord({
      sessionId: 's-1',
      provider: 'dsh-sdk',
      declaredModel: 'deepseek-v4-flash'
    });
    expect(hostClaimed.state).toBe('host-claimed');
    expect(hostClaimed.authenticated).toBe(false);
    expect(requireNotHostClaimedAsAuthenticated(hostClaimed)).toBe(hostClaimed);

    const authenticated = evidenceRecord({ authenticated: true, evidenceRef: 'host://ref/1' });
    expect(authenticated.state).toBe('authenticated');
    expect(authenticated.authenticated).toBe(true);
  });

  it('rejects writing host-claimed as authenticated', () => {
    // A record that claims authenticated without verifiable evidence fails
    // closed to unknown; it never becomes host-claimed and is never written
    // as authenticated.
    const record = evidenceRecord({
      authenticated: true,
      sessionId: 's-1',
      provider: 'dsh-sdk',
      declaredModel: 'deepseek-v4-flash'
    });
    expect(record.state).toBe('unknown');
    expect(record.authenticated).toBe(false);

    // The defensive guard still rejects a directly-constructed inconsistent
    // record, so no downstream gate can present host-claimed as authenticated.
    expect(() => requireNotHostClaimedAsAuthenticated({
      state: 'host-claimed',
      authenticated: true,
      evidenceRef: null,
      sessionId: 's-1',
      provider: 'dsh-sdk',
      declaredModel: 'deepseek-v4-flash',
      actualModel: null,
      actualEffort: null
    })).toThrow('host-claimed evidence must never be written as authenticated.');
  });

  it('acceptance recognizes authenticated, or host-claimed with explicit human confirmation', () => {
    expect(evidenceAcceptable('authenticated', false)).toBe(true);
    expect(evidenceAcceptable('host-claimed', true)).toBe(true);
    expect(evidenceAcceptable('host-claimed', false)).toBe(false);
    expect(evidenceAcceptable('unknown', true)).toBe(false);
  });
});
