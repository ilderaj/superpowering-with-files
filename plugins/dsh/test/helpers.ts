import path from 'node:path';

import { buildAssignmentPacket, packetDigestOf } from '../src/core/index.js';

export const ROOT = '/repo';
export const TASK_ID = 'dsh-task';

export function sha(seed: string): string {
  // Deterministic 64-hex sha256-shaped strings (format-checked only by the
  // decision core; real hashing is exercised via sha256Hex in unit tests).
  return seed.repeat(64).slice(0, 64);
}

export function makeFileBinding(fileName: string, seed: string) {
  return {
    path: path.join(ROOT, 'planning', 'active', TASK_ID, fileName),
    sha256: sha(seed)
  };
}

export function makeBinding(): Record<string, unknown> {
  return {
    authorityRoot: ROOT,
    taskId: TASK_ID,
    files: {
      taskPlan: makeFileBinding('task_plan.md', 'a'),
      findings: makeFileBinding('findings.md', 'b'),
      progress: makeFileBinding('progress.md', 'c')
    }
  };
}

export function makeAuthority(): Record<string, unknown> {
  const binding = makeBinding();
  return { binding, bindingObservation: binding };
}

export function makeMismatchedAuthority(): Record<string, unknown> {
  const binding = makeBinding();
  const observation = {
    ...binding,
    files: {
      ...binding.files,
      taskPlan: {
        path: binding.files.taskPlan.path,
        sha256: sha('f')
      }
    }
  };
  return { binding, bindingObservation: observation };
}

export function makePacketInput(capability: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    authority: makeAuthority(),
    currentSlice: { name: 'slice-0', scope: ['plugins/dsh'] },
    nonGoals: ['no npm publish', 'no harness/trio edits'],
    proof: ['golden tests green', 'harness/trio diff empty'],
    capability: { workRole: 'executing', complexity: 'high', ...capability },
    allowedOperations: {
      files: ['plugins/dsh'],
      operations: ['write']
    },
    deadline: '2026-08-15T23:59:59+08:00',
    expectedReturn: 'candidate report with binding evidence'
  };
}

export function makePacket(capability: Record<string, unknown> = {}): Record<string, unknown> {
  return buildAssignmentPacket(makePacketInput(capability));
}

export function packetDigest(packet: Record<string, unknown>): string | null {
  return packetDigestOf(packet);
}

export function parentEnvelope(): Record<string, unknown> {
  return {
    permissionEnvelope: {
      permissions: ['swf.execution'],
      operations: ['continue', 'status'],
      externalEffects: []
    },
    pathEnvelope: {
      mutablePaths: ['plugins/dsh']
    }
  };
}

export function visibleWorkerObservation(digest: string | null): Record<string, unknown> {
  return {
    authenticated: true,
    evidenceRef: 'host://codex/obs-1',
    packetDigest: digest,
    actualModel: 'opencode-go/deepseek-v4-flash',
    actualEffort: 'high',
    workerId: 'w-1',
    status: 'executing',
    visibleWorker: {
      visible: true,
      operations: { continue: true, status: true },
      requestedModelEffortControls: true,
      permissionBinding: true,
      pathBinding: true,
      nativeCollaboration: false
    },
    nativeSubagent: {}
  };
}

export function unauthenticatedObservation(): Record<string, unknown> {
  return {
    authenticated: false,
    evidenceRef: null,
    visibleWorker: {
      visible: true,
      operations: { continue: true },
      requestedModelEffortControls: true,
      permissionBinding: true,
      pathBinding: true
    },
    nativeSubagent: {}
  };
}
