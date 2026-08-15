import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { approvalPolicyOf, createSessionTracker, detectSession } from '../src/detect.js';
import { makeMockCtx, makeSession, makeTrioProject, withTmpRoot } from './helpers.js';

describe('auto-detect trigger (Slice 1)', () => {
  it('classifies a session with the planning trio as swf and finds the task id', async () => {
    await withTmpRoot(async (root) => {
      await makeTrioProject(root, 'alpha-task');
      const detection = await detectSession(makeSession('s-1', root));
      expect(detection.decision.mode).toBe('swf');
      expect(detection.decision.reason).toContain('planning trio');
      expect(detection.taskId).toBe('alpha-task');
    });
  });

  it('classifies a session with only a .swf-task marker as swf', async () => {
    await withTmpRoot(async (root) => {
      await writeFile(join(root, '.swf-task'), 'task: alpha\\n', 'utf8');
      const detection = await detectSession(makeSession('s-1', root));
      expect(detection.decision.mode).toBe('swf');
      expect(detection.decision.reason).toContain('.swf-task marker');
      expect(detection.taskId).toBeNull();
    });
  });

  it('passes through sessions without trio or marker (transparent)', async () => {
    await withTmpRoot(async (root) => {
      const detection = await detectSession(makeSession('s-1', root));
      expect(detection.decision.mode).toBe('passthrough');
      expect(detection.taskId).toBeNull();
    });
  });

  it('passes through sessions without a cwd', async () => {
    const detection = await detectSession(makeSession('s-1', undefined));
    expect(detection.decision.mode).toBe('passthrough');
  });

  it('tracker intercepts swf sessions and ignores passthrough sessions', async () => {
    await withTmpRoot(async (root) => {
      const { ctx } = makeMockCtx();
      const tracker = createSessionTracker(ctx);
      await makeTrioProject(root, 'alpha-task');
      const swfSession = makeSession('swf-session', root);
      const plainSession = makeSession('plain-session', join(root, 'nowhere'));
      await tracker.handleSessionCreated(swfSession);
      await tracker.handleSessionCreated(plainSession);
      expect(tracker.stateOf('swf-session')?.mode).toBe('swf');
      expect(tracker.stateOf('swf-session')?.taskId).toBe('alpha-task');
      expect(tracker.stateOf('plain-session')).toBeUndefined();
      tracker.handleSessionDisposed(swfSession);
      expect(tracker.stateOf('swf-session')).toBeUndefined();
    });
  });

  it('approvalPolicyOf folds the last approval/policy event', () => {
    expect(approvalPolicyOf([])).toBeUndefined();
    expect(approvalPolicyOf([{ type: 'approval/policy', data: { policy: 'never' } }])).toBe('never');
    expect(approvalPolicyOf([
      { type: 'user/message', data: { content: 'x' } },
      { type: 'approval/policy', data: { policy: 'ask' } },
      { type: 'approval/policy', data: { policy: 'never' } }
    ])).toBe('never');
    expect(approvalPolicyOf([{ type: 'approval/policy', data: { policy: 'bogus' } }])).toBeUndefined();
  });
});
