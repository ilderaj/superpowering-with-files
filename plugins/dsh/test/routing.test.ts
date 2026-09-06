import { describe, expect, it } from 'vitest';

import {
  ASSIGNMENT_PACKET_FIELDS,
  buildAssignmentPacket,
  calculateNextAction,
  classifyComplexity,
  classifyTask,
  classifyWorkRole,
  packetDigestOf,
  resolveModelEffort,
  routeTask
} from '../src/core/index.js';
import { makePacket, makePacketInput } from './helpers.js';

describe('routing selection', () => {
  it('classifies explicit quick/tracked', () => {
    expect(classifyTask({ taskClass: 'quick' })).toBe('quick');
    expect(classifyTask({ taskClass: 'tracked' })).toBe('tracked');
    expect(classifyTask({ classification: 'deep-reasoning' })).toBe('tracked');
    expect(classifyTask({ route: 'tracked' })).toBe('tracked');
  });

  it('classifies tracked from durable/multi-phase signals', () => {
    expect(classifyTask({ research: true })).toBe('quick');
    expect(classifyTask({ durableResearch: true })).toBe('tracked');
    expect(classifyTask({ worktree: true })).toBe('tracked');
    expect(classifyTask({ phases: ['a', 'b'] })).toBe('tracked');
    expect(classifyTask({ phases: 3 })).toBe('tracked');
    expect(classifyTask({})).toBe('quick');
    expect(classifyTask({ phases: 1 })).toBe('quick');
  });

  it('routeTask mirrors the class and sets createTrio', () => {
    expect(routeTask({ taskClass: 'tracked' })).toMatchObject({ route: 'tracked', createTrio: true });
    expect(routeTask({})).toMatchObject({ route: 'quick', createTrio: false });
  });
});

describe('calculateNextAction', () => {
  it('requires --dry-run', () => {
    expect(() => calculateNextAction({})).toThrow('calculateNextAction is read-only only with --dry-run.');
  });

  it('decides execute-inline for quick work', () => {
    expect(calculateNextAction({ dryRun: true })).toMatchObject({ action: 'execute-inline', createTrio: false });
  });

  it('decides create-trio for tracked work without an existing trio', () => {
    expect(calculateNextAction({ dryRun: true, route: 'tracked' })).toMatchObject({ action: 'create-trio', createTrio: true });
  });

  it('decides resume-trio when the trio already exists', () => {
    expect(calculateNextAction({ dryRun: true, route: 'tracked', hasTrio: true }))
      .toMatchObject({ action: 'resume-trio', createTrio: false });
  });
});

describe('8-field Assignment Packet', () => {
  it('builds exactly the eight immutable fields in order', () => {
    const packet = makePacket();
    expect(Object.keys(packet)).toEqual(ASSIGNMENT_PACKET_FIELDS);
    expect(packet.capability).toMatchObject({ workRole: 'executing', complexity: 'high' });
  });

  it('rejects missing fields listing exactly which are absent', () => {
    const input = makePacketInput();
    delete input.nonGoals;
    delete input.expectedReturn;
    expect(() => buildAssignmentPacket(input))
      .toThrow('Assignment packet requires eight fields: nonGoals, expectedReturn.');
  });

  it('rejects unexpected top-level fields', () => {
    const input = makePacketInput();
    (input as Record<string, unknown>).extraField = 'x';
    expect(() => buildAssignmentPacket(input))
      .toThrow('Assignment packet rejects unexpected top-level fields: extraField.');
  });
});

describe('packet digest', () => {
  it('is a deterministic sha256 over the stable packet', () => {
    const packet = makePacket();
    const digest = packetDigestOf(packet);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(packetDigestOf(packet)).toBe(digest);
  });

  it('returns null for empty packets', () => {
    expect(packetDigestOf(null)).toBeNull();
    expect(packetDigestOf(undefined)).toBeNull();
  });
});

describe('work role and complexity classification', () => {
  it('classifies declared work roles', () => {
    expect(classifyWorkRole({ workRole: 'executing' })).toBe('executing');
    expect(classifyWorkRole({ workRole: 'chief' })).toBe('chief');
    expect(classifyWorkRole({})).toBeNull();
  });

  it('throws on unknown roles and complexities', () => {
    expect(() => classifyWorkRole({ workRole: 'wizard' })).toThrow('Unknown work role: wizard');
    expect(() => classifyComplexity({ complexity: 'ultra' })).toThrow('Unknown complexity: ultra');
  });

  it('resolves model/effort for execution and chief roles', () => {
    const execution = resolveModelEffort({ workRole: 'executing', complexity: 'xhigh' });
    expect(execution.requestedModel).toBe('opencode-go/deepseek-v4-flash');
    expect(execution.requestedEffort).toBe('xhigh');
    const chief = resolveModelEffort({ workRole: 'chief' });
    expect(chief.requestedModel).toBe('gpt-5.6-sol');
    expect(chief.requestedEffort).toBe('max');
  });

  it('refuses an unclassified model decision', () => {
    expect(() => resolveModelEffort({ complexity: 'high' }))
      .toThrow('A requested model decision requires a declared workRole; no unclassified model may be requested.');
  });
});
