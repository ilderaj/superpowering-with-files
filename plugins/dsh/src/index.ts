// swf-dsh plugin entry (Slice 1).
//
// cordis plugin shape: exported `name` + `inject` + `apply(ctx)`.
//  - inject: host-side service surface (see src/context.ts seam note — the
//    client/UI `conversationEvents` service is intentionally NOT injected).
//  - auto-detect: planning trio or .swf-task marker via the Slice 0 passthrough
//    core; non-SWF sessions pass through transparently (no interception).
//  - /swf command surface: route / bind / dispatch / status / accept.
//  - worker dispatch (Slice 2): ctx.subagents visible workers with mandatory
//    {SessionId, provider, declared model} evidence, budget caps, dual-layer
//    gates, and the candidate -> human accept flow.

import { createSwfCommands } from './commands.js';
import type { SwfDshContext } from './context.js';
import { createSessionTracker } from './detect.js';

export const name = 'swf-dsh';
export const inject = ['sessions', 'commands', 'skills', 'tokenMeter', 'approval'];

export function apply(ctx: SwfDshContext): void {
  const tracker = createSessionTracker(ctx);
  ctx.on('session/created', tracker.handleSessionCreated);
  ctx.on('session/disposed', tracker.handleSessionDisposed);
  for (const definition of createSwfCommands(ctx, tracker)) {
    ctx.commands.register(definition);
  }
}

export { createSessionTracker, detectSession, findPlanningTrioTask, approvalPolicyOf } from './detect.js';
export { createSwfCommands, parseSwfCommand, parseKeyValueArgs, parseDispatchArgs, dispatchHandler } from './commands.js';
export {
  evidenceDirectory,
  listEvidenceKinds,
  packetFilePath,
  planningActiveRoot,
  readEvidence,
  readPacket,
  taskDirectory,
  verifyTrioOnDisk,
  writeEvidence,
  writePacket,
  writePacketBudget,
  PACKET_FILE_NAME,
  PACKET_SCHEMA,
  PACKET_VERSION
} from './packet.js';
export type { PacketBudget, PacketFile, TrioObservation, WriteEvidenceOptions, WritePacketOptions } from './packet.js';
export { BudgetTracker, writeBudgetEvidence, type BudgetSnapshot } from './budget.js';
export { createDispatcher, type DispatchOptions, type DispatchResult, type SettleOptions, type WorkerDispatcher } from './dispatch.js';
export type { SessionTracker, SessionDetection, SwfSessionState } from './detect.js';
