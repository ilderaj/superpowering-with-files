import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildAssignmentPacket, evidenceRecord } from '../src/core/index.js';
import {
  evidenceDirectory,
  listEvidenceKinds,
  packetFilePath,
  readEvidence,
  readPacket,
  taskDirectory,
  verifyTrioOnDisk,
  writeEvidence,
  writePacket
} from '../src/packet.js';
import { makePacketInputFor, makeTrioProject, withTmpRoot } from './helpers.js';

describe('packet persistence (Slice 1, plan item 4)', () => {
  it('writes swf-packet.json to planning/active/<task-id>/ and reads it back', async () => {
    await withTmpRoot(async (root) => {
      const input = await makePacketInputFor(root, 'alpha-task');
      const packet = buildAssignmentPacket(input);
      const observation = await verifyTrioOnDisk(input.authority.binding as never);
      await writePacket({ authorityRoot: root, taskId: 'alpha-task', packet, bindingObservation: observation });

      const expectedPath = packetFilePath(root, 'alpha-task');
      const stored = await readPacket(root, 'alpha-task');
      expect(stored).not.toBeNull();
      expect(stored!.taskId).toBe('alpha-task');
      expect(stored!.authorityRoot).toBe(root);
      expect(stored!.packetDigest).toBeTruthy();
      expect(stored!.bindingObservation.status).toBe('match');
      expect(join(root, 'planning', 'active', 'alpha-task', 'swf-packet.json')).toBe(expectedPath);
      expect(stored!.packet).toEqual(packet);
    });
  });

  it('verifyTrioOnDisk reports mismatch when a trio file differs from the binding', async () => {
    await withTmpRoot(async (root) => {
      const input = await makePacketInputFor(root, 'alpha-task');
      await makeTrioProject(root, 'alpha-task', { 'task_plan.md': 'CHANGED content\\n' });
      const observation = await verifyTrioOnDisk(input.authority.binding as never);
      expect(observation.status).toBe('mismatch');
      expect(observation.mismatches).toContain('taskPlan');
    });
  });

  it('verifyTrioOnDisk reports unavailable when the trio files are missing', async () => {
    await withTmpRoot(async (root) => {
      const input = await makePacketInputFor(root, 'alpha-task');
      // delete the trio directory
      const { rm } = await import('node:fs/promises');
      await rm(join(root, 'planning'), { recursive: true, force: true });
      const observation = await verifyTrioOnDisk(input.authority.binding as never);
      expect(observation.status).toBe('unavailable');
      expect(observation.observed).toBeNull();
    });
  });

  it('writePacket rejects task ids that could escape the task directory', async () => {
    await withTmpRoot(async (root) => {
      const input = await makePacketInputFor(root, 'alpha-task');
      const packet = buildAssignmentPacket(input);
      const observation = await verifyTrioOnDisk(input.authority.binding as never);
      await expect(
        writePacket({ authorityRoot: root, taskId: '../escape', packet, bindingObservation: observation })
      ).rejects.toThrow('Invalid task id');
      await expect(
        writeEvidence({ authorityRoot: root, taskId: 'a/b', kind: 'worker', record: evidenceRecord({}) })
      ).rejects.toThrow('Invalid task id');
    });
  });

  it('writes three-state evidence files under evidence/ and enforces the host-claimed guard', async () => {
    await withTmpRoot(async (root) => {
      const unknown = evidenceRecord({ sessionId: null, provider: null, declaredModel: null });
      const hostClaimed = evidenceRecord({ sessionId: 's-1', provider: 'dsh-sdk', declaredModel: 'deepseek-v4-flash' });
      expect(unknown.state).toBe('unknown');
      expect(hostClaimed.state).toBe('host-claimed');
      expect(hostClaimed.authenticated).toBe(false);

      await writeEvidence({ authorityRoot: root, taskId: 'alpha-task', kind: 'worker', record: unknown });
      await writeEvidence({ authorityRoot: root, taskId: 'alpha-task', kind: 'worker', record: hostClaimed });

      const kinds = await listEvidenceKinds(root, 'alpha-task');
      expect(kinds).toEqual(['worker']);
      const read = await readEvidence(root, 'alpha-task', 'worker');
      expect(read!.state).toBe('host-claimed');
      expect(read!.authenticated).toBe(false);
      expect(join(root, 'planning', 'active', 'alpha-task', 'evidence')).toBe(evidenceDirectory(root, 'alpha-task'));
      expect(join(root, 'planning', 'active', 'alpha-task')).toBe(taskDirectory(root, 'alpha-task'));
    });
  });

  it('never writes host-claimed evidence as authenticated (write-boundary guard)', async () => {
    await withTmpRoot(async (root) => {
      const forged = {
        state: 'host-claimed' as const,
        authenticated: true,
        evidenceRef: null,
        sessionId: 's-1',
        provider: 'dsh-sdk',
        declaredModel: 'deepseek-v4-flash',
        actualModel: null,
        actualEffort: null
      };
      await expect(
        writeEvidence({ authorityRoot: root, taskId: 'alpha-task', kind: 'worker', record: forged })
      ).rejects.toThrow('host-claimed evidence must never be written as authenticated');
    });
  });

  it('evidenceRecord fails closed when a bare authenticated flag has no verifiable reference', () => {
    const record = evidenceRecord({ authenticated: true, sessionId: 's-1', provider: 'dsh-sdk', declaredModel: 'deepseek-v4-flash' });
    expect(record.state).toBe('unknown');
    expect(record.authenticated).toBe(false);
  });
});
