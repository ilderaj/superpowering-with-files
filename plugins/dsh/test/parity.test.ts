// Golden parity tests: the ported decision core must behave identically to
// the harness baseline harness/trio/core/routing.mjs (HEAD 275345d) on the
// shared decision surface. The baseline is imported read-only.

import { describe, expect, it } from 'vitest';

import * as original from '../../harness/trio/core/routing.mjs';
import * as ported from '../src/core/index.js';
import {
  makePacket,
  makePacketInput,
  parentEnvelope,
  packetDigest,
  unauthenticatedObservation,
  visibleWorkerObservation
} from './helpers.js';

function throwsMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  return '<no throw>';
}

const classifyInputs = [
  {},
  { taskClass: 'quick' },
  { taskClass: 'tracked' },
  { classification: 'deep-reasoning' },
  { route: 'tracked' },
  { research: true },
  { multiplePhases: true },
  { worktree: true },
  { phases: ['a', 'b'] },
  { phases: 3 },
  { phases: 1 },
  { tracked: false }
];

describe('golden parity: classifyTask / routeTask / calculateNextAction', () => {
  it('classifyTask matches the baseline on the signal matrix', () => {
    for (const input of classifyInputs) {
      expect(ported.classifyTask(input)).toEqual(original.classifyTask(input));
    }
  });

  it('routeTask matches the baseline', () => {
    for (const input of classifyInputs) {
      expect(ported.routeTask(input)).toEqual(original.routeTask(input));
    }
  });

  it('calculateNextAction matches the baseline (results and throws)', () => {
    const cases = [
      { dryRun: true },
      { dryRun: true, route: 'tracked' },
      { dryRun: true, route: 'tracked', hasTrio: true },
      { dryRun: false },
      { dryRun: true, research: true }
    ];
    for (const input of cases) {
      const portedResult = (() => {
        try {
          return { ok: true, value: ported.calculateNextAction(input) };
        } catch (error) {
          return { ok: false, message: (error as Error).message };
        }
      })();
      const originalResult = (() => {
        try {
          return { ok: true, value: original.calculateNextAction(input) };
        } catch (error) {
          return { ok: false, message: (error as Error).message };
        }
      })();
      expect(portedResult).toEqual(originalResult);
    }
  });
});

describe('golden parity: 8-field packet and digest', () => {
  it('buildAssignmentPacket accepts the same valid packet', () => {
    const portedPacket = ported.buildAssignmentPacket(makePacketInput());
    const originalPacket = original.buildAssignmentPacket(makePacketInput());
    expect(portedPacket).toEqual(originalPacket);
    expect(Object.keys(portedPacket)).toEqual(Object.keys(originalPacket));
  });

  it('buildAssignmentPacket throws identical messages on invalid packets', () => {
    const missing = makePacketInput();
    delete missing.nonGoals;
    delete missing.expectedReturn;

    const unexpected = makePacketInput();
    (unexpected as Record<string, unknown>).extraField = 'x';

    const mismatched = makePacketInput();
    mismatched.authority = {
      binding: mismatched.authority.binding,
      bindingObservation: {
        ...mismatched.authority.binding,
        files: {
          ...mismatched.authority.binding.files,
          progress: {
            ...mismatched.authority.binding.files.progress,
            sha256: 'd'.repeat(64)
          }
        }
      }
    };

    for (const bad of [missing, unexpected, mismatched, {}, 'not-an-object' as unknown]) {
      expect(throwsMessage(() => ported.buildAssignmentPacket(bad as Record<string, unknown>)))
        .toBe(throwsMessage(() => original.buildAssignmentPacket(bad as Record<string, unknown>)));
    }
  });

  it('packetDigestOf produces the identical digest', () => {
    const packet = makePacket();
    expect(ported.packetDigestOf(packet)).toBe(original.packetDigestOf(packet));
    expect(ported.packetDigestOf(null)).toBe(original.packetDigestOf(null));
  });
});

describe('golden parity: model/effort policy', () => {
  it('resolveModelEffort matches on execution and chief profiles', () => {
    const cases = [
      { workRole: 'executing', complexity: 'high' },
      { workRole: 'coding', complexity: 'max' },
      { workRole: 'chief' },
      { workRole: 'planning', requestedModel: 'gpt-5.6-terra', requestedEffort: 'ultra' },
      { workRole: 'executing', complexity: 'high', isChild: true }
    ];
    for (const input of cases) {
      expect(ported.resolveModelEffort(input)).toEqual(original.resolveModelEffort(input));
    }
  });

  it('resolveModelEffort throws identical messages on violations', () => {
    const cases = [
      { complexity: 'high' },
      { workRole: 'wizard' },
      { workRole: 'executing' },
      { workRole: 'executing', complexity: 'high', override: { reason: 'x', provenance: 'y' } },
      { workRole: 'executing', complexity: 'high', requestedModel: 'gpt-5.6-sol' },
      { workRole: 'chief', complexity: 'high' },
      { workRole: 'chief', requestedModel: 'deepseek-v4-flash' },
      { workRole: 'chief', requestedEffort: 'high' },
      { workRole: 'chief', isChild: true, requestedEffort: 'ultra' }
    ];
    for (const input of cases) {
      expect(throwsMessage(() => ported.resolveModelEffort(input)))
        .toBe(throwsMessage(() => original.resolveModelEffort(input)));
    }
  });
});

describe('golden parity: fail-closed host operation routing', () => {
  it('manual_pending routes are byte-identical', () => {
    const cases = [
      {
        label: 'unauthenticated default topology',
        input: {
          operation: 'continue',
          assignmentPacket: makePacket(),
          requestedWorkerId: 'w-1',
          parentEnvelope: parentEnvelope(),
          observation: unauthenticatedObservation()
        }
      },
      {
        label: 'unauthenticated strict topology',
        input: {
          operation: 'continue',
          assignmentPacket: makePacket({ primaryExecution: 'visible_worker_required', childDelegation: 'prohibited' }),
          requestedWorkerId: 'w-1',
          parentEnvelope: parentEnvelope(),
          observation: unauthenticatedObservation()
        }
      },
      {
        label: 'spawn with pending worktree setup',
        input: {
          operation: 'spawn',
          assignmentPacket: makePacket(),
          parentEnvelope: parentEnvelope(),
          observation: {
            ...unauthenticatedObservation(),
            worktreeSetup: { clientThreadId: 'wt-1', resolved: false }
          }
        }
      },
      {
        label: 'child request outside flash profile',
        input: {
          operation: 'continue',
          assignmentPacket: makePacket(),
          isChild: true,
          parentEffort: 'high',
          requestedModel: 'gpt-5.6-sol',
          requestedEffort: 'ultra',
          parentEnvelope: parentEnvelope(),
          observation: unauthenticatedObservation()
        }
      }
    ];
    for (const { input } of cases) {
      const run = (fn: (i: Record<string, unknown>) => unknown) => {
        try {
          return { ok: true, value: JSON.stringify(fn(input)) };
        } catch (error) {
          return { ok: false, message: (error as Error).message };
        }
      };
      expect(run(ported.resolveHostOperation)).toEqual(run(original.resolveHostOperation));
    }
  });

  it('authenticated visible worker routes are byte-identical', () => {
    const packet = makePacket();
    const digest = packetDigest(packet);
    const input = {
      operation: 'continue',
      assignmentPacket: packet,
      requestedWorkerId: 'w-1',
      parentEnvelope: parentEnvelope(),
      observation: visibleWorkerObservation(digest)
    };
    expect(JSON.stringify(ported.resolveHostOperation(input)))
      .toBe(JSON.stringify(original.resolveHostOperation(input)));
    expect(ported.resolveHostOperation(input).routeEvidence.routeKind).toBe('visible_worker');
  });

  it('resolveHostOperation throws identical messages', () => {
    const cases = [
      { operation: 'explode' },
      {},
      {
        operation: 'continue',
        assignmentPacket: makePacket(),
        requestedWorkerId: 'w-1',
        parentEnvelope: parentEnvelope(),
        observation: { ...visibleWorkerObservation(packetDigest(makePacket())), status: 'accepted' }
      }
    ];
    for (const input of cases) {
      expect(throwsMessage(() => ported.resolveHostOperation(input)))
        .toBe(throwsMessage(() => original.resolveHostOperation(input)));
    }
  });
});

describe('golden parity: permission adjudication', () => {
  it('scope/sandbox/approval verdicts are byte-identical', () => {
    const packet = makePacket();
    const digest = packetDigest(packet);
    const cases = [
      {
        label: 'outside assignment scope',
        input: {
          assignmentPacket: packet,
          targetPaths: ['harness/trio'],
          permissionIntent: { sandboxMode: 'bounded', writableRoots: ['plugins/dsh'] },
          hostObservation: visibleWorkerObservation(digest)
        }
      },
      {
        label: 'generated target',
        input: {
          assignmentPacket: packet,
          targetPaths: ['.agents/skills/trio/SKILL.md'],
          permissionIntent: { sandboxMode: 'bounded', writableRoots: ['plugins/dsh'] },
          hostObservation: visibleWorkerObservation(digest)
        }
      },
      {
        label: 'sandbox actual unknown',
        input: {
          assignmentPacket: packet,
          targetPaths: ['plugins/dsh'],
          permissionIntent: { sandboxMode: 'bounded', writableRoots: ['plugins/dsh'] },
          hostObservation: { authenticated: true, evidenceRef: 'ref', actualSandbox: 'bounded' }
        }
      },
      {
        label: 'approval denied',
        input: {
          assignmentPacket: packet,
          targetPaths: ['plugins/dsh'],
          permissionIntent: { sandboxMode: 'bounded', writableRoots: ['plugins/dsh'] },
          hostObservation: {
            ...visibleWorkerObservation(digest),
            actualSandbox: 'bounded',
            actualWritableRoots: ['plugins/dsh']
          },
          approval: { kind: 'user', granted: false }
        }
      },
      {
        label: 'allowed',
        input: {
          assignmentPacket: packet,
          targetPaths: ['plugins/dsh'],
          permissionIntent: { sandboxMode: 'bounded', writableRoots: ['plugins/dsh'] },
          hostObservation: {
            ...visibleWorkerObservation(digest),
            actualSandbox: 'bounded',
            actualWritableRoots: ['plugins/dsh']
          }
        }
      }
    ];
    for (const { input } of cases) {
      expect(JSON.stringify(ported.adjudicatePermission(input)))
        .toBe(JSON.stringify(original.adjudicatePermission(input)));
    }
  });
});
