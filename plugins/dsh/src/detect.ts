// Auto-detect trigger (Slice 1, plan item 2).
//
// The plugin observes session lifecycle events from the `sessions` service
// and classifies every session with the Slice 0 passthrough core (planning
// trio or .swf-task marker). Non-SWF sessions pass through transparently: no
// interception is registered and nothing is written. SWF sessions receive a
// session-scoped interception (a `session/event` observer) that tracks the
// session's SWF state; its disposer runs on `session/disposed`.
//
// The approval-policy fold below mirrors @deepseek-ai/dsh-user-approval's
// effectiveApprovalPolicy (0.1.0-rc.6) without a runtime import, keeping the
// plugin's runtime surface free of chain packages; Slice 2 may re-home it to
// the canonical package once the host gate surface is fixed.

import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { classifySession, type SessionDecision } from './core/passthrough.js';
import type { ApprovalPolicy, Session, SwfDshContext } from './context.js';

export const TRIO_FILE_NAMES = Object.freeze(['task_plan.md', 'findings.md', 'progress.md']) as readonly string[];

export interface SwfSessionState {
  sessionId: string;
  mode: 'swf';
  taskId: string | null;
  approvalPolicy: ApprovalPolicy | undefined;
  observedEvents: number;
}

export interface SessionDetection {
  decision: SessionDecision;
  taskId: string | null;
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** First planning/active/<task>/ directory under cwd holding the Trio, or null. */
export async function findPlanningTrioTask(cwd: string): Promise<string | null> {
  const activeDir = join(cwd, 'planning', 'active');
  let entries;
  try {
    entries = await readdir(activeDir, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return null;
  }
  if (!entries) return null;
  const taskIds = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const taskId of taskIds) {
    if (taskId === '.' || taskId === '..') continue;
    let names: string[];
    try {
      names = await readdir(join(activeDir, taskId));
    } catch {
      continue;
    }
    if (TRIO_FILE_NAMES.every((name) => names.includes(name))) return taskId;
  }
  return null;
}

/** Classify one session with the Slice 0 passthrough core (fs-backed). */
export async function detectSession(session: { header: { cwd?: string } }): Promise<SessionDetection> {
  const cwd = session.header.cwd;
  if (!cwd) {
    return {
      decision: classifySession({ hasSwfTaskMarker: false, hasPlanningTrio: false }),
      taskId: null
    };
  }
  const hasMarker = await fileExists(join(cwd, '.swf-task'));
  const taskId = await findPlanningTrioTask(cwd);
  const decision = classifySession({ hasSwfTaskMarker: hasMarker, hasPlanningTrio: taskId !== null });
  return { decision, taskId };
}

const APPROVAL_POLICIES = Object.freeze(['ask', 'never']) as readonly ApprovalPolicy[];

/**
 * Last `approval/policy` event in log order. Local mirror of
 * @deepseek-ai/dsh-user-approval effectiveApprovalPolicy (0.1.0-rc.6).
 */
export function approvalPolicyOf(events: readonly { type: string; data: unknown }[]): ApprovalPolicy | undefined {
  let policy: ApprovalPolicy | undefined;
  for (const event of events) {
    if (event.type !== 'approval/policy') continue;
    const candidate = (event.data as { policy?: unknown } | null | undefined)?.policy;
    if (typeof candidate === 'string' && APPROVAL_POLICIES.includes(candidate as ApprovalPolicy)) {
      policy = candidate as ApprovalPolicy;
    }
  }
  return policy;
}

/** Per-session SWF interception seam (skeleton: state + approval policy fold). */
export interface SessionTracker {
  readonly states: ReadonlyMap<string, SwfSessionState>;
  handleSessionCreated(session: Session): Promise<void>;
  handleSessionDisposed(session: Session): void;
  stateOf(sessionId: string): SwfSessionState | undefined;
}

export function createSessionTracker(ctx: SwfDshContext): SessionTracker {
  const states = new Map<string, SwfSessionState>();
  const disposers = new Map<string, () => void>();

  function intercept(session: Session, detection: SessionDetection): void {
    const state: SwfSessionState = {
      sessionId: session.id,
      mode: 'swf',
      taskId: detection.taskId,
      approvalPolicy: approvalPolicyOf(session.events),
      observedEvents: 0
    };
    states.set(session.id, state);
    const dispose = ctx.on('session/event', (observer, event) => {
      if (observer.id !== session.id) return;
      state.observedEvents += 1;
      if (event.type === 'approval/policy') {
        const policy = approvalPolicyOf([event]);
        if (policy) state.approvalPolicy = policy;
      }
    });
    disposers.set(session.id, () => {
      dispose();
      states.delete(session.id);
    });
  }

  return {
    get states() {
      return states;
    },
    async handleSessionCreated(session) {
      const detection = await detectSession(session);
      if (detection.decision.mode !== 'swf') return; // transparent passthrough
      intercept(session, detection);
    },
    handleSessionDisposed(session) {
      disposers.get(session.id)?.();
      disposers.delete(session.id);
    },
    stateOf(sessionId) {
      return states.get(sessionId);
    }
  };
}
