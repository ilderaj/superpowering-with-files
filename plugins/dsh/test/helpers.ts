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

// ---- Slice 1 helpers: Trio fixtures, packet inputs, mock cordis ctx ----

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sha256Hex, TRIO_FILE_KEYS } from '../src/core/index.js';
import type { SwfCommandDefinition, SwfDshContext, CommandInvocation, CommandResult } from '../src/context.js';

export const TRIO_NAMES = ['task_plan.md', 'findings.md', 'progress.md'] as const;

export async function makeTrioProject(
  root: string,
  taskId: string,
  contents: Record<string, string> = {
    'task_plan.md': '# Task Plan\n\nStatus: active\n',
    'findings.md': '# Findings\n',
    'progress.md': '# Progress\n'
  }
): Promise<void> {
  const dir = join(root, 'planning', 'active', taskId);
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(contents)) {
    await writeFile(join(dir, name), content, 'utf8');
  }
}

export async function trioBindingFor(root: string, taskId: string): Promise<Record<string, unknown>> {
  const files: Record<string, { path: string; sha256: string }> = {};
  for (const name of TRIO_NAMES) {
    const filePath = join(root, 'planning', 'active', taskId, name);
    files[TRIO_FILE_KEYS[name]] = { path: filePath, sha256: sha256Hex(await readFile(filePath)) };
  }
  return { authorityRoot: root, taskId, files };
}

export async function makePacketInputFor(
  root: string,
  taskId: string,
  opts: { capability?: Record<string, unknown>; taskPlanContent?: string } = {}
): Promise<Record<string, unknown>> {
  await makeTrioProject(root, taskId);
  if (opts.taskPlanContent) {
    await writeFile(join(root, 'planning', 'active', taskId, 'task_plan.md'), opts.taskPlanContent, 'utf8');
  }
  const binding = await trioBindingFor(root, taskId);
  const authority = { binding, bindingObservation: binding };
  return {
    authority,
    currentSlice: { name: 'slice-1', scope: ['plugins/dsh'] },
    nonGoals: ['no npm publish'],
    proof: ['tests green'],
    capability: { workRole: 'executing', complexity: 'high', ...opts.capability },
    allowedOperations: ['write plugins/dsh/**'],
    deadline: '2026-08-15',
    expectedReturn: 'candidate report'
  };
}

export async function withTmpRoot<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'swf-dsh-'));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export interface MockCtxHarness {
  ctx: SwfDshContext;
  commands: Map<string, SwfCommandDefinition>;
  listeners: Map<string, Set<(...args: unknown[]) => unknown>>;
  approvalCalls: { toolName: string; reason: string }[];
  subagents: MockSubagentsState;
  emit: (name: string, ...args: unknown[]) => Promise<unknown[]>;
  /** Resolve one started run's terminal result and flush the settle chain. */
  completeRun: (index: number, stopReason?: string) => Promise<void>;
}

export interface MockSubagentRun {
  id: string | null;
  stopReason?: string;
}

export interface MockSubagentsOptions {
  providers?: string[];
  runs?: MockSubagentRun[];
  emitStartEvent?: boolean;
  startThrows?: Error;
  /** Provider persona capability advertised by every registered provider (default true). */
  personaCapability?: boolean;
}

export interface MockSubagentsState {
  providers: string[];
  started: { name: string; request: Record<string, unknown> }[];
  disposeCalls: string[];
  runQueue: MockSubagentRun[];
  emitStartEvent: boolean;
  runResolvers: Array<(result: { output: unknown[]; stopReason: string }) => void>;
}

export function makeMockCtx(options: {
  approvalOutcome?: string;
  tokenMeterTotal?: number;
  subagents?: MockSubagentsOptions;
} = {}): MockCtxHarness {
  const listeners = new Map<string, Set<(...args: unknown[]) => unknown>>();
  const commands = new Map<string, SwfCommandDefinition>();
  const approvalCalls: { toolName: string; reason: string }[] = [];
  const subagentsState: MockSubagentsState = {
    providers: [...(options.subagents?.providers ?? ['subagent-dsh-sdk', 'subagent-codex', 'subagent-claude-code'])],
    started: [],
    disposeCalls: [],
    runQueue: [...(options.subagents?.runs ?? [])],
    emitStartEvent: options.subagents?.emitStartEvent ?? true,
    runResolvers: []
  };
  let runCounter = 0;
  const emit = (name: string, ...args: unknown[]): Promise<unknown[]> => {
    const set = listeners.get(name);
    if (!set) return Promise.resolve([]);
    return Promise.all([...set].map((listener) => listener(...args)));
  };
  const ctx = {
    on: (name: string, listener: (...args: unknown[]) => unknown): (() => boolean) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
      return () => {
        const set = listeners.get(name);
        if (!set) return false;
        const removed = set.delete(listener);
        if (set.size === 0) listeners.delete(name);
        return removed;
      };
    },
    once: (name: string, listener: (...args: unknown[]) => unknown): (() => boolean) => {
      const disposer = ctx.on(name, (...args) => {
        disposer();
        return listener(...args);
      });
      return disposer;
    },
    commands: {
      register: (def: SwfCommandDefinition): (() => boolean) => {
        commands.set(def.name, def);
        return () => commands.delete(def.name);
      }
    },
    approval: {
      request: async (req: { toolName: string; reason: string }) => {
        approvalCalls.push({ toolName: req.toolName, reason: req.reason });
        return options.approvalOutcome ?? 'allowed-once';
      }
    },
    subagents: {
      list: (): string[] => [...subagentsState.providers],
      getProvider: (name: string) =>
        subagentsState.providers.includes(name)
          ? {
              name,
              capabilities: {
                outputSchema: false,
                depthLimit: false,
                toolFilter: false,
                persona: options.subagents?.personaCapability ?? true
              },
              inheritsParentContext: true
            }
          : undefined,
      start: async (name: string, request: Record<string, unknown>) => {
        if (options.subagents?.startThrows) throw options.subagents.startThrows;
        runCounter += 1;
        const spec = subagentsState.runQueue.shift() ?? { id: 'session-' + runCounter };
        subagentsState.started.push({ name, request });
        if (subagentsState.emitStartEvent && spec.id !== null) {
          await emit('subagent/start', { runId: 'run-' + runCounter, provider: name, id: spec.id, local: true }, request.parent);
        }
        const runId = spec.id;
        // Controlled result: like a real dsh host, the run settles only when
        // the host reports its terminal outcome (completeRun), so tests can
        // deterministically exercise the auto-settle path.
        let resolveRun: (result: { output: unknown[]; stopReason: string }) => void = () => undefined;
        const resultPromise = new Promise<{ output: unknown[]; stopReason: string }>((resolve) => {
          resolveRun = resolve;
        });
        subagentsState.runResolvers.push(resolveRun);
        return {
          id: runId,
          localAgent: undefined,
          result: resultPromise,
          dispose: async () => {
            subagentsState.disposeCalls.push(String(runId));
          }
        };
      }
    },
    skills: { list: async () => [] },
    tokenMeter: {
      measure: () => ({
        logRevision: 0,
        baseline: 'heuristic',
        surfaceDeltaTokens: 0,
        totalTokens: options.tokenMeterTotal ?? 0,
        surfaceTokens: 0,
        nodes: []
      })
    },
    sessions: {
      get: () => undefined,
      list: () => [],
      create: () => ({ id: 'session', header: {}, events: [], seq: 0, surface: {} })
    }
  } as unknown as SwfDshContext;
  return {
    ctx,
    commands,
    listeners,
    approvalCalls,
    subagents: subagentsState,
    emit,
    completeRun: async (index: number, stopReason = 'completed') => {
      const resolver = subagentsState.runResolvers[index];
      if (!resolver) throw new Error('no started run at index ' + index);
      resolver({ output: [], stopReason });
      // Flush the settle chain (result.then -> settle -> dispose); a short
      // timer lets every fs await in the chain complete deterministically.
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };
}

export function makeSession(id: string, cwd: string | undefined): { id: string; header: { cwd?: string }; events: unknown[] } {
  return { id, header: { ...(cwd ? { cwd } : {}) }, events: [] };
}

export function makeInvocation(rawInput: string): CommandInvocation {
  return {
    commandId: 'cmd-1' as CommandInvocation['commandId'],
    agent: { id: 'agent-1' } as CommandInvocation['agent'],
    rawInput,
    signal: new AbortController().signal
  };
}

export async function runCommand(
  commands: Map<string, SwfCommandDefinition>,
  rawInput: string
): Promise<CommandResult> {
  const def = commands.get('swf');
  if (!def) throw new Error('swf command not registered');
  return def.handler(makeInvocation(rawInput));
}
