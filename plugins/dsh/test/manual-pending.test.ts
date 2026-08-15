import { describe, expect, it } from 'vitest';

import { resolveHostOperation } from '../src/core/index.js';
import {
  makePacket,
  parentEnvelope,
  packetDigest,
  unauthenticatedObservation,
  visibleWorkerObservation
} from './helpers.js';

describe('fail-closed manual_pending routing (Slice 0 golden)', () => {
  it('routes to manual_pending when no authenticated observation exists (default topology)', () => {
    const packet = makePacket();
    const result = resolveHostOperation({
      operation: 'continue',
      assignmentPacket: packet,
      requestedWorkerId: 'w-1',
      parentEnvelope: parentEnvelope(),
      observation: unauthenticatedObservation()
    });
    expect(result.routeEvidence.routeKind).toBe('manual_pending');
    expect(result.routeEvidence.fallbackReason)
      .toBe('visible_observation_unknown;native_target_unbound');
    expect(result.routeEvidence.status).toBe('manual_pending');
    expect(result.routeEvidence.actualModel).toBe('unknown');
    expect(result.routeEvidence.actualEffort).toBe('unknown');
    expect(result.descriptor.kind).toBe('manual_pending');
    expect(typeof result.descriptor.blocker).toBe('string');
    expect(typeof result.descriptor.resumeCondition).toBe('string');
  });

  it('fail-closes with visible_worker_required_unavailable under the strict topology', () => {
    const packet = makePacket({
      primaryExecution: 'visible_worker_required',
      childDelegation: 'prohibited'
    });
    const result = resolveHostOperation({
      operation: 'continue',
      assignmentPacket: packet,
      requestedWorkerId: 'w-1',
      parentEnvelope: parentEnvelope(),
      observation: unauthenticatedObservation()
    });
    expect(result.routeEvidence.routeKind).toBe('manual_pending');
    expect(result.routeEvidence.fallbackReason)
      .toBe('visible_worker_required_unavailable:visible_observation_unknown');
  });

  it('routes to a visible worker only with authenticated evidence and bound controls', () => {
    const packet = makePacket();
    const digest = packetDigest(packet);
    const result = resolveHostOperation({
      operation: 'continue',
      assignmentPacket: packet,
      requestedWorkerId: 'w-1',
      parentEnvelope: parentEnvelope(),
      observation: visibleWorkerObservation(digest)
    });
    expect(result.routeEvidence.routeKind).toBe('visible_worker');
    expect(result.routeEvidence.actualModel).toBe('opencode-go/deepseek-v4-flash');
    expect(result.routeEvidence.actualEffort).toBe('high');
    expect(result.routeEvidence.workerId).toBe('w-1');
    expect(result.routeEvidence.status).toBe('executing');
    expect(result.descriptor.assignmentPacket).toBeDefined();
    expect(result.descriptor.packetDigest).toBe(digest);
  });

  it('degrades authenticated claims without evidenceRef to unknown (never upcast)', () => {
    const packet = makePacket();
    const observation = unauthenticatedObservation();
    observation.authenticated = true; // claims authenticity but has no evidenceRef
    const result = resolveHostOperation({
      operation: 'continue',
      assignmentPacket: packet,
      requestedWorkerId: 'w-1',
      parentEnvelope: parentEnvelope(),
      observation
    });
    expect(result.routeEvidence.routeKind).toBe('manual_pending');
    expect(result.routeEvidence.actualModel).toBe('unknown');
  });

  it('throws when a Host observation claims Chief acceptance', () => {
    const packet = makePacket();
    const observation = visibleWorkerObservation(packetDigest(packet));
    observation.status = 'accepted';
    expect(() => resolveHostOperation({
      operation: 'continue',
      assignmentPacket: packet,
      requestedWorkerId: 'w-1',
      parentEnvelope: parentEnvelope(),
      observation
    })).toThrow('Host worker observation cannot claim Chief acceptance.');
  });

  it('rejects unsupported Host operations', () => {
    expect(() => resolveHostOperation({ operation: 'explode' }))
      .toThrow('Unsupported Host operation: explode');
  });
});
