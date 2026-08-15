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
  packetDigestOf,
  parseTaskStatus,
  routeTask,
  type TrioBinding
} from './core/index.js';
import type { CommandInvocation, CommandResult, SwfCommandDefinition, SwfDshContext } from './context.js';
import type { SessionTracker } from './detect.js';
import {
  listEvidenceKinds,
  packetFilePath,
  readEvidence,
  readPacket,
  verifyTrioOnDisk,
  writeEvidence,
  writePacket
} from './packet.js';

export type SwfSubcommand = 'route' | 'bind' | 'status' | 'accept';

export interface ParsedSwfCommand {
  subcommand: SwfSubcommand;
  args: string[];
}

const SUBCOMMANDS = new Set<SwfSubcommand>(['route', 'bind', 'status', 'accept']);

export function parseSwfCommand(rawInput: string): ParsedSwfCommand {
  const tokens = rawInput.trim().split(/\s+/).filter(Boolean);
  const first = (tokens[0] ?? '').toLowerCase();
  if (!SUBCOMMANDS.has(first as SwfSubcommand)) {
    throw new Error('Usage: /swf route|bind|status|accept ...');
  }
  return { subcommand: first as SwfSubcommand, args: tokens.slice(1) };
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
  let input: BindInput;
  try {
    input = JSON.parse(packetJson) as BindInput;
  } catch (error) {
    return fail('Invalid packet JSON: ' + (error as Error).message);
  }
  try {
    const packet = buildAssignmentPacket(input as unknown as Record<string, unknown>);
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
  const kinds = await listEvidenceKinds(authorityRoot, taskId);
  const state = tracker.stateOf(kv.session ?? '') ?? null;
  return ok(JSON.stringify({
    subcommand: 'status',
    taskId,
    packetDigest: packet.packetDigest,
    bindingObservation: packet.bindingObservation,
    workerEvidence: worker ? { state: worker.state, sessionId: worker.sessionId, provider: worker.provider, declaredModel: worker.declaredModel } : null,
    acceptance: acceptance ? { state: acceptance.state, humanConfirmed: (acceptance.extra as { humanConfirmed?: boolean }).humanConfirmed ?? false } : null,
    evidenceKinds: kinds,
    session: state
  }, null, 2));
}

/** /swf accept <task-id> <authorityRoot> — human gate through the dsh approval channel. */
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
  const worker = await readEvidence(authorityRoot, taskId, 'worker');
  if (!worker) {
    return fail('cannot accept: no worker evidence recorded for task ' + taskId);
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
  if (!evidenceAcceptable(worker.state, true)) {
    return fail('cannot accept: evidence state ' + worker.state + ' is not acceptable even with human confirmation');
  }
  await writeEvidence({
    authorityRoot,
    taskId,
    kind: 'acceptance',
    record: worker,
    extra: { outcome, humanConfirmed: true, acceptedVia: 'dsh-approval' }
  });
  return ok(JSON.stringify({ subcommand: 'accept', taskId, accepted: true, evidenceState: worker.state, humanConfirmed: true }, null, 2));
}

export function createSwfCommands(ctx: SwfDshContext, tracker: SessionTracker): SwfCommandDefinition[] {
  return [{
    name: 'swf',
    description: 'SWF Trio v2 control surface: route | bind | status | accept',
    input: { hint: 'route <key=value ...> | bind <task-id> <packet-json> | status <task-id> <authorityRoot> [--session <id>] | accept <task-id> <authorityRoot>' },
    handler: (invocation) => swfHandler(ctx, tracker, invocation)
  }];
}

async function swfHandler(ctx: SwfDshContext, tracker: SessionTracker, invocation: CommandInvocation): Promise<CommandResult> {
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
    case 'status':
      return statusHandler(ctx, tracker, invocation);
    case 'accept':
      return acceptHandler(ctx, invocation);
  }
}
