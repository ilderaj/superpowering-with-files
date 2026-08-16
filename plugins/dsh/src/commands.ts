// /swf command surface (Slice 1, plan item 3): route / bind / status / accept.
//
// The handlers are thin adapters over the Slice 0 decision core
// (binding.ts / routing.ts / evidence.ts) and the packet/evidence persistence
// in packet.ts. No production mutation happens outside an explicit /swf
// invocation, and binding_mismatch fails closed without writing anything.

import {
  buildAssignmentPacket,
  classifyTask,
  evidenceAcceptable,
  evidenceRecord,
  isValidTaskId,
  packetDigestOf,
  parseTaskStatus,
  routeTask,
  type TrioBinding
} from './core/index.js';
import { createDispatcher, type DispatchResult } from './dispatch.js';
import type { CommandInvocation, CommandResult, SwfCommandDefinition, SwfDshContext } from './context.js';
import type { SessionTracker } from './detect.js';
import { auditEvidenceDirectory } from './evidenceAudit.js';
import {
  listEvidenceKinds,
  packetFilePath,
  readEvidence,
  readPacket,
  verifyTrioOnDisk,
  writeEvidence,
  writePacket
} from './packet.js';

export type SwfSubcommand = 'route' | 'bind' | 'dispatch' | 'status' | 'accept' | 'audit';

export interface ParsedSwfCommand {
  subcommand: SwfSubcommand;
  args: string[];
}

const SUBCOMMANDS = new Set<SwfSubcommand>(['route', 'bind', 'dispatch', 'status', 'accept', 'audit']);

export function parseSwfCommand(rawInput: string): ParsedSwfCommand {
  const tokens = rawInput.trim().split(/\s+/).filter(Boolean);
  const first = (tokens[0] ?? '').toLowerCase();
  if (!SUBCOMMANDS.has(first as SwfSubcommand)) {
    throw new Error('Usage: /swf route|bind|dispatch|status|accept|audit ...');
  }
  return { subcommand: first as SwfSubcommand, args: tokens.slice(1) };
}

interface ParsedDispatchArgs {
  positional: string[];
  kv: Record<string, string>;
  flags: Set<string>;
}

/** --key=value args plus bare --flags (e.g. --deep-confirmed). */
export function parseDispatchArgs(args: string[]): ParsedDispatchArgs {
  const positional: string[] = [];
  const kv: Record<string, string> = {};
  const flags = new Set<string>();
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq > 2) {
        kv[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        flags.add(arg.slice(2));
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, kv, flags };
}

export function parseKeyValueArgs(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of args) {
    const eq = arg.indexOf('=');
    if (eq <= 0) {
      throw new Error('Expected key=value argument, got: ' + arg);
    }
    const key = arg.slice(0, eq);
    out[key.startsWith('--') ? key.slice(2) : key] = arg.slice(eq + 1);
  }
  return out;
}

function ok(text: string): CommandResult {
  return { kind: 'success', text };
}

function fail(text: string): CommandResult {
  return { kind: 'error', text };
}

/** /swf route — pure routing/model-effort decision from the Slice 0 core. */
export function routeHandler(invocation: CommandInvocation): CommandResult {
  const { args } = parseSwfCommand(invocation.rawInput);
  const input: Record<string, unknown> = parseKeyValueArgs(args);
  const taskClass = classifyTask(input);
  const routed = routeTask(input);
  return ok(JSON.stringify({ subcommand: 'route', taskClass, route: routed.route, createTrio: routed.createTrio }, null, 2));
}

interface BindInput {
  authority: { binding: TrioBinding };
  currentSlice: unknown;
  nonGoals: unknown;
  proof: unknown;
  capability: unknown;
  allowedOperations: unknown;
  deadline: unknown;
  expectedReturn: unknown;
}

/**
 * /swf bind <task-id> <packet-json> — validate the 8-field Assignment Packet
 * with the core, verify Trio hashes on disk (binding_mismatch stops without
 * writing), then persist swf-packet.json plus worker evidence.
 */
export async function bindHandler(ctx: SwfDshContext, invocation: CommandInvocation): Promise<CommandResult> {
  const { args } = parseSwfCommand(invocation.rawInput);
  const taskId = args[0];
  const packetJson = args.slice(1).join(' ');
  if (!taskId || !packetJson) {
    return fail('/swf bind requires: <task-id> <packet-json>');
  }
  // The CLI task id becomes the directory name under planning/active/, so
  // it must be a plain task slug: path separators, traversal segments, and
  // absolute paths are rejected before any packet is read or written.
  if (!isValidTaskId(taskId)) {
    return fail('invalid task id: ' + taskId);
  }
  let input: BindInput;
  try {
    input = JSON.parse(packetJson) as BindInput;
  } catch (error) {
    return fail('Invalid packet JSON: ' + (error as Error).message);
  }
  try {
    const packet = buildAssignmentPacket(input as unknown as Record<string, unknown>);
    // The bind target must be the task the packet authority actually binds:
    // binding a packet to a different task id would write alpha's hashes
    // under beta's directory and let beta dispatch on alpha's authority.
    const boundTaskId = input.authority.binding.taskId;
    if (boundTaskId !== taskId) {
      return fail('binding task mismatch: packet authority binds task "' + boundTaskId + '", CLI supplied "' + taskId + '"');
    }
    const authorityRoot = input.authority.binding.authorityRoot;
    const observation = await verifyTrioOnDisk(input.authority.binding);
    if (observation.status === 'mismatch') {
      return fail('binding_mismatch: ' + observation.mismatches.join(', '));
    }
    await writePacket({ authorityRoot, taskId, packet, bindingObservation: observation });
    // Worker evidence: no authenticated Host dispatch record is available at
    // /swf bind time, so the record is unknown; Slice 2 wires ctx.subagents
    // dispatch records (host-claimed) here.
    const record = evidenceRecord({ sessionId: null, provider: null, declaredModel: null });
    await writeEvidence({
      authorityRoot,
      taskId,
      kind: 'worker',
      record,
      extra: { note: 'no authenticated host dispatch record', packetDigest: packetDigestOf(packet) }
    });
    const status = observation.status === 'match' ? 'bound' : 'bound_unverified';
    return ok(JSON.stringify({
      subcommand: 'bind',
      taskId,
      status,
      packetDigest: packetDigestOf(packet),
      bindingObservation: observation,
      packetPath: packetFilePath(authorityRoot, taskId)
    }, null, 2));
  } catch (error) {
    return fail('bind failed: ' + (error as Error).message);
  }
}

/** /swf status <task-id> <authorityRoot> [--session <id>] — packet + Trio + evidence readout. */
export async function statusHandler(
  ctx: SwfDshContext,
  tracker: SessionTracker,
  invocation: CommandInvocation
): Promise<CommandResult> {
  const { args } = parseSwfCommand(invocation.rawInput);
  const kv = parseKeyValueArgs(args.filter((arg) => arg.startsWith('--')));
  const positional = args.filter((arg) => !arg.startsWith('--'));
  const taskId = positional[0];
  const authorityRoot = positional[1] ?? kv.authorityRoot;
  if (!taskId || !authorityRoot) {
    return fail('/swf status requires: <task-id> <authorityRoot> [--session <id>]');
  }
  const packet = await readPacket(authorityRoot, taskId);
  if (!packet) {
    return fail('no packet at ' + packetFilePath(authorityRoot, taskId));
  }
  const worker = await readEvidence(authorityRoot, taskId, 'worker');
  const acceptance = await readEvidence(authorityRoot, taskId, 'acceptance');
  const budget = await readEvidence(authorityRoot, taskId, 'budget');
  const kinds = await listEvidenceKinds(authorityRoot, taskId);
  const state = tracker.stateOf(kv.session ?? '') ?? null;
  return ok(JSON.stringify({
    subcommand: 'status',
    taskId,
    packetDigest: packet.packetDigest,
    bindingObservation: packet.bindingObservation,
    workerEvidence: worker ? { state: worker.state, sessionId: worker.sessionId, provider: worker.provider, declaredModel: worker.declaredModel } : null,
    acceptance: acceptance ? { state: acceptance.state, humanConfirmed: (acceptance.extra as { humanConfirmed?: boolean }).humanConfirmed ?? false } : null,
    budget: budget ? (budget.extra as { snapshot?: unknown }).snapshot ?? null : null,
    evidenceKinds: kinds,
    session: state
  }, null, 2));
}

/** /swf accept <task-id> <authorityRoot> — candidate -> human accept (plan item 5). */
export async function acceptHandler(ctx: SwfDshContext, invocation: CommandInvocation): Promise<CommandResult> {
  const { args } = parseSwfCommand(invocation.rawInput);
  const taskId = args[0];
  const authorityRoot = args[1];
  if (!taskId || !authorityRoot) {
    return fail('/swf accept requires: <task-id> <authorityRoot>');
  }
  const packet = await readPacket(authorityRoot, taskId);
  if (!packet) {
    return fail('no packet at ' + packetFilePath(authorityRoot, taskId));
  }
  // Trio hash verification before any human acceptance: a task whose planning
  // authority cannot be verified is never durably done.
  const binding = (packet.packet.authority as { binding?: unknown } | undefined)?.binding as TrioBinding;
  const observation = await verifyTrioOnDisk(binding);
  if (observation.status !== 'match') {
    return fail(observation.status === 'mismatch'
      ? 'binding_mismatch: ' + observation.mismatches.join(', ')
      : 'binding_unavailable: cannot verify the planning trio before acceptance');
  }
  const worker = await readEvidence(authorityRoot, taskId, 'worker');
  if (!worker) {
    return fail('cannot accept: no worker evidence recorded for task ' + taskId);
  }
  // Evidence state gate first: unknown can never be accepted, even with a
  // human confirmation, and asking for approval before this check would be
  // a spurious gate request.
  if (!evidenceAcceptable(worker.state, true)) {
    return fail('cannot accept: evidence state ' + worker.state + ' is not acceptable even with human confirmation');
  }
  // Completed-candidate gate: acceptance is only valid once the dispatched
  // run has SETTLED into a worker-result. A start-time worker record alone
  // (host-claimed or not) is not a candidate — accepting it would write
  // durable acceptance while the worker is still running.
  const workerResult = await readEvidence(authorityRoot, taskId, 'worker-result');
  if (!workerResult) {
    return fail('cannot accept: no completed worker-result candidate for task ' + taskId + '; wait for the dispatched run to settle before accepting');
  }
  const resultExtra = (workerResult.extra ?? {}) as { runId?: unknown; stopReason?: unknown; packetDigest?: unknown };
  const runId = typeof resultExtra.runId === 'string' && resultExtra.runId ? resultExtra.runId : null;
  const stopReason = typeof resultExtra.stopReason === 'string' && resultExtra.stopReason ? resultExtra.stopReason : null;
  if (stopReason !== 'completed') {
    return fail('cannot accept: worker stop reason ' + (stopReason ?? 'missing') + ' is not a completed candidate');
  }
  // Run identity: the settled result must belong to the dispatched worker
  // session, not to some other run that happened to finish for this task.
  if (runId === null || runId !== worker.sessionId) {
    return fail('cannot accept: worker-result run id ' + (runId ?? 'missing') + ' does not match the dispatched worker session ' + (worker.sessionId ?? 'missing'));
  }
  // Packet identity: the settled result must have been produced against the
  // currently bound packet, so a rebind between dispatch and completion
  // cannot accept work done under a different assignment.
  if (resultExtra.packetDigest !== packet.packetDigest) {
    return fail('cannot accept: worker-result packet digest does not match the bound assignment packet');
  }
  const outcome = await ctx.approval.request({
    agent: invocation.agent,
    toolName: 'swf.accept',
    reason: 'SWF human acceptance for task ' + taskId,
    signal: invocation.signal
  });
  if (outcome !== 'allowed-once') {
    return fail('acceptance not granted: ' + outcome);
  }
  await writeEvidence({
    authorityRoot,
    taskId,
    kind: 'acceptance',
    record: worker,
    extra: { outcome, humanConfirmed: true, acceptedVia: 'dsh-approval', bindingObservation: observation }
  });
  return ok(JSON.stringify({ subcommand: 'accept', taskId, accepted: true, evidenceState: worker.state, humanConfirmed: true }, null, 2));
}

/** /swf audit <task-id> <authorityRoot> — runnable evidence audit (Slice 3). */
export async function auditHandler(invocation: CommandInvocation): Promise<CommandResult> {
  const { args } = parseSwfCommand(invocation.rawInput);
  const taskId = args[0];
  const authorityRoot = args[1];
  if (!taskId || !authorityRoot) {
    return fail('/swf audit requires: <task-id> <authorityRoot>');
  }
  const result = await auditEvidenceDirectory(authorityRoot, taskId);
  return ok(JSON.stringify({ subcommand: 'audit', ...result }, null, 2));
}

export function createSwfCommands(ctx: SwfDshContext, tracker: SessionTracker): SwfCommandDefinition[] {
  const dispatcher = createDispatcher(ctx);
  return [{
    name: 'swf',
    description: 'SWF Trio v2 control surface: route | bind | dispatch | status | accept | audit',
    input: { hint: 'route <key=value ...> | bind <task-id> <packet-json> | dispatch <task-id> <authorityRoot> [--deep-confirmed] [--max-tokens N] [--session <id>] | status <task-id> <authorityRoot> [--session <id>] | accept <task-id> <authorityRoot> | audit <task-id> <authorityRoot>' },
    handler: (invocation) => swfHandler(ctx, tracker, dispatcher, invocation)
  }];
}

/** /swf dispatch <task-id> <authorityRoot> [--deep-confirmed] [--max-tokens N] — visible worker dispatch. */
export async function dispatchHandler(
  ctx: SwfDshContext,
  dispatcher: ReturnType<typeof createDispatcher>,
  invocation: CommandInvocation
): Promise<CommandResult> {
  const { args } = parseSwfCommand(invocation.rawInput);
  const { positional, kv, flags } = parseDispatchArgs(args);
  const taskId = positional[0];
  const authorityRoot = positional[1];
  if (!taskId || !authorityRoot) {
    return fail('/swf dispatch requires: <task-id> <authorityRoot> [--deep-confirmed] [--max-tokens N] [--session <id>]');
  }
  const maxTokens = kv['max-tokens'] === undefined ? undefined : Number(kv['max-tokens']);
  const prompt = kv.prompt
    ?? 'SWF assignment execution for task ' + taskId
    + '. Read the bound assignment ticket at planning/active/' + taskId + '/swf-packet.json '
    + 'and the planning trio (task_plan.md, findings.md, progress.md) under planning/active/' + taskId + '/. '
    + 'Your dispatch is recorded as a visible worker with {SessionId, provider, declared model}; '
    + 'your result is a candidate pending Chief acceptance.';
  const result: DispatchResult = await dispatcher.dispatch({
    authorityRoot,
    taskId,
    parent: invocation.agent,
    prompt,
    signal: invocation.signal,
    deepConfirmed: flags.has('deep-confirmed') || undefined,
    maxTokens: maxTokens !== undefined && Number.isFinite(maxTokens) ? maxTokens : undefined
  });
  return ok(JSON.stringify({ subcommand: 'dispatch', taskId, ...result }, null, 2));
}

async function swfHandler(
  ctx: SwfDshContext,
  tracker: SessionTracker,
  dispatcher: ReturnType<typeof createDispatcher>,
  invocation: CommandInvocation
): Promise<CommandResult> {
  let parsed: ParsedSwfCommand;
  try {
    parsed = parseSwfCommand(invocation.rawInput);
  } catch (error) {
    return fail((error as Error).message);
  }
  switch (parsed.subcommand) {
    case 'route':
      return routeHandler(invocation);
    case 'bind':
      return bindHandler(ctx, invocation);
    case 'dispatch':
      return dispatchHandler(ctx, dispatcher, invocation);
    case 'status':
      return statusHandler(ctx, tracker, invocation);
    case 'accept':
      return acceptHandler(ctx, invocation);
    case 'audit':
      return auditHandler(invocation);
  }
}
