// Packet and evidence persistence (Slice 1, plan item 4).
//
// Assignment Packet JSON is written to planning/active/<task-id>/swf-packet.json
// and worker evidence to planning/active/<task-id>/evidence/ under the
// three-state model from src/core/evidence.ts. The packet file is a DERIVED,
// rebindable assignment ticket — the Trio planning files (task_plan.md,
// findings.md, progress.md) are the sole durable task authority and are
// re-verified against the binding on every dispatch/accept. The invariant
// that host-claimed evidence is never written as authenticated is enforced
// at the write boundary (requireNotHostClaimedAsAuthenticated), so no
// downstream gate can observe a mislabeled record.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  assertEvidenceState,
  assertTrioBinding,
  assertValidTaskId,
  compareTrioBindings,
  packetDigestOf,
  requireNotHostClaimedAsAuthenticated,
  sha256Hex,
  type BindingComparison,
  type TrioBinding,
  type WorkerEvidenceRecord
} from './core/index.js';

export const PACKET_FILE_NAME = 'swf-packet.json';
export const EVIDENCE_DIR_NAME = 'evidence';
export const PACKET_SCHEMA = 'swf-dsh/packet';
export const PACKET_VERSION = 1;

export function planningActiveRoot(authorityRoot: string): string {
  return join(authorityRoot, 'planning', 'active');
}

export function taskDirectory(authorityRoot: string, taskId: string): string {
  return join(planningActiveRoot(authorityRoot), taskId);
}

export function packetFilePath(authorityRoot: string, taskId: string): string {
  return join(taskDirectory(authorityRoot, taskId), PACKET_FILE_NAME);
}

export function evidenceDirectory(authorityRoot: string, taskId: string): string {
  return join(taskDirectory(authorityRoot, taskId), EVIDENCE_DIR_NAME);
}

export type TrioObservationStatus = 'match' | 'mismatch' | 'unavailable';

export interface TrioObservation {
  status: TrioObservationStatus;
  mismatches: string[];
  observed: Record<string, { path: string; sha256: string }> | null;
}

async function readTrioSha256(binding: TrioBinding): Promise<Record<string, { path: string; sha256: string }> | null> {
  const observed: Record<string, { path: string; sha256: string }> = {};
  for (const [key, file] of Object.entries(binding.files)) {
    try {
      observed[key] = { path: file.path, sha256: sha256Hex(await readFile(file.path)) };
    } catch {
      return null; // any missing/unreadable Trio file makes the observation unavailable
    }
  }
  return observed;
}

/** Verify the Trio bindings against the actual files; unavailable when files are missing. */
export async function verifyTrioOnDisk(binding: TrioBinding): Promise<TrioObservation> {
  assertTrioBinding(binding);
  const observed = await readTrioSha256(binding);
  if (!observed) {
    return { status: 'unavailable', mismatches: [], observed: null };
  }
  const comparison: BindingComparison = compareTrioBindings(binding, { ...binding, files: observed });
  return { status: comparison.matches ? 'match' : 'mismatch', mismatches: comparison.mismatches, observed };
}

export interface PacketFile {
  schema: typeof PACKET_SCHEMA;
  version: typeof PACKET_VERSION;
  taskId: string;
  authorityRoot: string;
  packet: Record<string, unknown>;
  packetDigest: string | null;
  bindingObservation: TrioObservation;
  budget?: PacketBudget;
  createdAt: string;
}

/** Budget status persisted in the packet FILE envelope (plan item 3). */
export interface PacketBudget {
  cap: number;
  spentTokens: number;
  activeWorkers: number;
  totalDispatches: number;
  overLimit: boolean;
  checkedAt: string;
}

export interface WritePacketOptions {
  authorityRoot: string;
  taskId: string;
  packet: Record<string, unknown>;
  bindingObservation: TrioObservation;
  budget?: PacketBudget;
  createdAt?: string;
}

export async function writePacket(options: WritePacketOptions): Promise<PacketFile> {
  const { authorityRoot, taskId, packet, bindingObservation } = options;
  // Defense in depth: the task id becomes a filesystem segment under
  // planning/active/, so the persistence boundary itself rejects any id
  // that could escape the task directory (traversal, separators, absolute).
  assertValidTaskId(taskId);
  const record: PacketFile = {
    schema: PACKET_SCHEMA,
    version: PACKET_VERSION,
    taskId,
    authorityRoot,
    packet,
    packetDigest: packetDigestOf(packet),
    bindingObservation,
    ...(options.budget === undefined ? {} : { budget: options.budget }),
    createdAt: options.createdAt ?? new Date().toISOString()
  };
  await mkdir(taskDirectory(authorityRoot, taskId), { recursive: true });
  await writeFile(packetFilePath(authorityRoot, taskId), JSON.stringify(record, null, 2) + '\n', 'utf8');
  return record;
}

/**
 * Refresh the budget status inside the packet file envelope. The bound
 * assignment packet (and therefore its digest) is preserved. A Trio binding
 * mismatch (or unavailable trio) refuses the write: budget state must never
 * be recorded against a task whose planning authority cannot be verified.
 */
export async function writePacketBudget(
  authorityRoot: string,
  taskId: string,
  budget: PacketBudget
): Promise<{ status: 'updated' } | { status: 'mismatch' } | { status: 'no_packet' }> {
  const stored = await readPacket(authorityRoot, taskId);
  if (!stored) return { status: 'no_packet' };
  const binding = (stored.packet.authority as { binding?: unknown } | undefined)?.binding;
  const observation = await verifyTrioOnDisk(binding as TrioBinding);
  if (observation.status !== 'match') {
    return { status: 'mismatch' };
  }
  await writePacket({
    authorityRoot,
    taskId,
    packet: stored.packet,
    bindingObservation: observation,
    budget,
    createdAt: stored.createdAt
  });
  return { status: 'updated' };
}

export async function readPacket(authorityRoot: string, taskId: string): Promise<PacketFile | null> {
  try {
    return JSON.parse(await readFile(packetFilePath(authorityRoot, taskId), 'utf8')) as PacketFile;
  } catch {
    return null;
  }
}

export interface EvidenceFile<TExtra = Record<string, unknown>> extends WorkerEvidenceRecord {
  kind: string;
  taskId: string;
  recordedAt: string;
  extra: TExtra;
}

export interface WriteEvidenceOptions<TExtra = Record<string, unknown>> {
  authorityRoot: string;
  taskId: string;
  kind: string;
  record: WorkerEvidenceRecord;
  extra?: TExtra;
  recordedAt?: string;
}

export async function writeEvidence<TExtra = Record<string, unknown>>(
  options: WriteEvidenceOptions<TExtra>
): Promise<EvidenceFile<TExtra>> {
  assertValidTaskId(options.taskId);
  // Three-state invariant enforced at the write boundary.
  assertEvidenceState(options.record.state);
  requireNotHostClaimedAsAuthenticated(options.record);
  const file: EvidenceFile<TExtra> = {
    ...options.record,
    kind: options.kind,
    taskId: options.taskId,
    recordedAt: options.recordedAt ?? new Date().toISOString(),
    extra: options.extra ?? ({} as TExtra)
  };
  const directory = evidenceDirectory(options.authorityRoot, options.taskId);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, options.kind + '.json'), JSON.stringify(file, null, 2) + '\n', 'utf8');
  return file;
}

export async function readEvidence<TExtra = Record<string, unknown>>(
  authorityRoot: string,
  taskId: string,
  kind: string
): Promise<EvidenceFile<TExtra> | null> {
  try {
    return JSON.parse(await readFile(join(evidenceDirectory(authorityRoot, taskId), kind + '.json'), 'utf8')) as EvidenceFile<TExtra>;
  } catch {
    return null;
  }
}

/** Evidence kinds present under planning/active/<task-id>/evidence/. */
export async function listEvidenceKinds(authorityRoot: string, taskId: string): Promise<string[]> {
  try {
    const names = await readdir(evidenceDirectory(authorityRoot, taskId));
    return names.filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -'.json'.length)).sort();
  } catch {
    return [];
  }
}
