// Evidence directory audit regression (Slice 3, plan item 3).
//
// The audit is the runnable check over planning/active/<task-id>/evidence/:
// three-state record completeness, host-claimed never written as
// authenticated, and unrecorded dispatches rejected (never a silent worker).

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { auditEvidenceDirectory, auditEvidenceRecord } from '../src/evidenceAudit.js';
import { evidenceDirectory, writeEvidence } from '../src/packet.js';
import { evidenceRecord } from '../src/core/index.js';
import { createSwfCommands } from '../src/commands.js';
import { createSessionTracker } from '../src/detect.js';
import { makeMockCtx, makePacketInputFor, runCommand, withTmpRoot } from './helpers.js';

function workerRecord(overrides = {}) {
  return {
    state: 'host-claimed',
    authenticated: false,
    evidenceRef: null,
    sessionId: 's-1',
    provider: 'dsh-sdk',
    declaredModel: 'deepseek-v4-flash',
    actualModel: null,
    actualEffort: null,
    kind: 'worker',
    taskId: 't',
    recordedAt: '2026-08-15T00:00:00.000Z',
    extra: {},
    ...overrides
  };
}

describe('auditEvidenceRecord (pure rules)', () => {
  it('accepts a complete host-claimed dispatch record', () => {
    expect(auditEvidenceRecord('worker.json', workerRecord())).toEqual([]);
  });

  it('rejects the hard invariant: host-claimed written as authenticated', () => {
    const violations = auditEvidenceRecord('worker.json', workerRecord({ authenticated: true }));
    expect(violations.some((v) => v.rule === 'host_claimed_as_authenticated')).toBe(true);
  });

  it('rejects an incomplete host-claimed record (missing a dispatch field)', () => {
    const violations = auditEvidenceRecord('worker.json', workerRecord({ sessionId: null }));
    expect(violations.some((v) => v.rule === 'host_claimed_incomplete' && v.detail.includes('sessionId'))).toBe(true);
    const violations2 = auditEvidenceRecord('worker.json', workerRecord({ provider: null }));
    expect(violations2.some((v) => v.rule === 'host_claimed_incomplete' && v.detail.includes('provider'))).toBe(true);
    const violations3 = auditEvidenceRecord('worker.json', workerRecord({ declaredModel: '' }));
    expect(violations3.some((v) => v.rule === 'host_claimed_incomplete' && v.detail.includes('declaredModel'))).toBe(true);
  });

  it('rejects a silent unknown worker record (unrecorded dispatch must be rejected)', () => {
    const violations = auditEvidenceRecord('worker.json', workerRecord({
      state: 'unknown',
      sessionId: null,
      provider: null,
      declaredModel: null,
      extra: {}
    }));
    expect(violations.some((v) => v.rule === 'silent_worker_record')).toBe(true);
  });

  it('accepts an explained unknown worker record (dispatch_record_unavailable)', () => {
    const violations = auditEvidenceRecord('worker.json', workerRecord({
      state: 'unknown',
      sessionId: null,
      provider: null,
      declaredModel: null,
      extra: { failure: 'dispatch_record_unavailable', note: 'run disposed' }
    }));
    expect(violations).toEqual([]);
  });

  it('accepts the bind-time placeholder (unknown + note)', () => {
    const violations = auditEvidenceRecord('worker.json', workerRecord({
      state: 'unknown',
      sessionId: null,
      provider: null,
      declaredModel: null,
      extra: { note: 'no authenticated host dispatch record' }
    }));
    expect(violations).toEqual([]);
  });

  it('rejects unknown marked authenticated', () => {
    const violations = auditEvidenceRecord('worker.json', workerRecord({
      state: 'unknown',
      authenticated: true,
      sessionId: null,
      provider: null,
      declaredModel: null
    }));
    expect(violations.some((v) => v.rule === 'unknown_marked_authenticated')).toBe(true);
  });

  it('rejects authenticated without an evidenceRef or the flag', () => {
    const noRef = auditEvidenceRecord('worker.json', workerRecord({ state: 'authenticated', authenticated: true, evidenceRef: null }));
    expect(noRef.some((v) => v.rule === 'authenticated_missing_ref')).toBe(true);
    const noFlag = auditEvidenceRecord('worker.json', workerRecord({ state: 'authenticated', authenticated: false, evidenceRef: 'host://ref' }));
    expect(noFlag.some((v) => v.rule === 'authenticated_missing_flag')).toBe(true);
  });

  it('rejects an invalid evidence state', () => {
    const violations = auditEvidenceRecord('worker.json', workerRecord({ state: 'maybe' }));
    expect(violations.some((v) => v.rule === 'invalid_evidence_state')).toBe(true);
  });
});

describe('auditEvidenceDirectory (directory check)', () => {
  it('reports ok for a clean evidence directory', async () => {
    await withTmpRoot(async (root) => {
      await writeEvidence({ authorityRoot: root, taskId: 't1', kind: 'worker', record: evidenceRecord({ sessionId: 's-1', provider: 'dsh-sdk', declaredModel: 'deepseek-v4-flash' }) });
      await writeEvidence({ authorityRoot: root, taskId: 't1', kind: 'budget', record: evidenceRecord({}) });
      const result = await auditEvidenceDirectory(root, 't1');
      expect(result.ok).toBe(true);
      expect(result.files).toBe(2);
      expect(result.violations).toEqual([]);
    });
  });

  it('flags the invariant violation on disk (host-claimed as authenticated)', async () => {
    await withTmpRoot(async (root) => {
      const dir = evidenceDirectory(root, 't1');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'worker.json'), JSON.stringify(workerRecord({ authenticated: true })), 'utf8');
      const result = await auditEvidenceDirectory(root, 't1');
      expect(result.ok).toBe(false);
      expect(result.checks.hostClaimedNeverAuthenticated).toBe(false);
      expect(result.violations.some((v) => v.rule === 'host_claimed_as_authenticated')).toBe(true);
    });
  });

  it('flags a silent worker record on disk', async () => {
    await withTmpRoot(async (root) => {
      const dir = evidenceDirectory(root, 't1');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'worker.json'), JSON.stringify(workerRecord({
        state: 'unknown',
        sessionId: null,
        provider: null,
        declaredModel: null,
        extra: {}
      })), 'utf8');
      const result = await auditEvidenceDirectory(root, 't1');
      expect(result.ok).toBe(false);
      expect(result.checks.unrecordedDispatchRejected).toBe(false);
      expect(result.violations.some((v) => v.rule === 'silent_worker_record')).toBe(true);
    });
  });

  it('reports evidence_dir_missing when the directory is absent', async () => {
    await withTmpRoot(async (root) => {
      const result = await auditEvidenceDirectory(root, 'ghost-task');
      expect(result.ok).toBe(false);
      expect(result.files).toBe(0);
      expect(result.violations.some((v) => v.rule === 'evidence_dir_missing')).toBe(true);
    });
  });

  it('exposes the audit through /swf audit after a real bind', async () => {
    await withTmpRoot(async (root) => {
      const { ctx, commands } = makeMockCtx();
      for (const def of createSwfCommands(ctx, createSessionTracker(ctx))) {
        ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 't1');
      const bind = await runCommand(commands, 'bind t1 ' + JSON.stringify(input));
      expect(bind.kind).toBe('success');
      const result = await runCommand(commands, 'audit t1 ' + root);
      expect(result.kind).toBe('success');
      const body = JSON.parse((result as { text: string }).text);
      expect(body.subcommand).toBe('audit');
      expect(body.ok).toBe(true);
      expect(body.files).toBeGreaterThan(0);
    });
  });
});
