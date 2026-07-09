import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { parseChiefOpsBlocks } from './coordination-blocks.mjs';
import { validateBindingPacket } from './schema.mjs';
import { rebuildChiefOpsIndex } from './index-service.mjs';
import { buildManualHandoffPrompt } from './manual-handoff.mjs';
import { resolveModel } from './model-resolver.mjs';
import { resolveAuthorityBinding } from './authority-binding.mjs';

export async function readJsonFile(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function canonicalPath(target) {
  return realpath(target).catch(() => path.resolve(target));
}

function sameStringSet(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }

  const normalizedLeft = new Set(left);
  return right.every((value) => normalizedLeft.has(value));
}

function sameSourceProgressRef(left = {}, right = {}) {
  return ['file', 'blockId', 'contentHash', 'observedAt'].every((field) => left[field] === right[field]);
}

function sameAuthoritativeBinding(left, right) {
  const sharedFieldsMatch = [
    'bindingId',
    'authorityTaskId',
    'workerId',
    'currentSlice',
    'proofTarget',
    'evidenceSink',
    'capabilityClass',
    'riskClass',
    'workType',
    'authorityMode'
  ].every((field) => left[field] === right[field])
    && sameStringSet(left.allowedOps, right.allowedOps)
    && sameSourceProgressRef(left.sourceProgressRef, right.sourceProgressRef);

  const publicVersionMatches = Boolean(right.bindingVersion) && right.bindingVersion === left.bindingVersion;
  const privateTokenMatches = Boolean(right.bindingToken) && right.bindingToken === left.bindingToken;
  const tokenContradictsTruth = Boolean(right.bindingToken) && right.bindingToken !== left.bindingToken;

  return sharedFieldsMatch && !tokenContradictsTruth && (publicVersionMatches || privateTokenMatches);
}

async function readAuthoritativeBinding({ root, bindingPacket }) {
  const progressPath = path.join(root, 'planning/active', bindingPacket.authorityTaskId, 'progress.md');
  const markdown = await readFile(progressPath, 'utf8');
  const bindingBlocks = parseChiefOpsBlocks(markdown)
    .filter((block) => block.type === 'ChiefOpsWorkerBinding')
    .map((block) => validateBindingPacket(block.value));

  const authoritative = bindingBlocks.find((binding) => binding.bindingId === bindingPacket.bindingId);
  if (!authoritative) {
    throw new Error('binding packet is not present in authoritative progress truth');
  }

  if (!sameAuthoritativeBinding(authoritative, bindingPacket)) {
    throw new Error('binding packet does not match authoritative progress truth');
  }

  return authoritative;
}

function validateAvailableModels(value) {
  if (!Array.isArray(value)) {
    throw new Error('available models must be a JSON array');
  }

  for (const [index, entry] of value.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`available model entry ${index} must be an object`);
    }
    if (typeof entry.model !== 'string' || entry.model.trim() === '') {
      throw new Error(`available model entry ${index} missing model`);
    }
    if (typeof entry.capabilityClass !== 'string' || entry.capabilityClass.trim() === '') {
      throw new Error(`available model entry ${index} missing capabilityClass`);
    }
  }

  return value;
}

export async function buildOverlayIndex({ root, taskId }) {
  await resolveAuthorityBinding({
    root,
    authorityTaskId: taskId,
    planningRoot: root,
    activeTaskIds: [taskId]
  });

  return rebuildChiefOpsIndex({ root, taskIds: [taskId] });
}

export function buildOverlayIndexText(index) {
  const workerCount = Array.isArray(index?.workers) ? index.workers.length : 0;
  const conflictCount = Array.isArray(index?.conflicts) ? index.conflicts.length : 0;

  return [
    `ChiefOps overlay index ${index?.schemaVersion || 'unknown'}`,
    `workers=${workerCount} conflicts=${conflictCount}`,
    `generated_from=${index?.generatedFrom || 'unknown'}`
  ].join('\n');
}

export async function validateBindingFile({ file }) {
  return validateBindingPacket(await readJsonFile(file));
}

export async function buildHandoffFromFile({ root, file }) {
  const bindingPacket = await validateBindingFile({ file });
  const [expectedRoot, packetRoot] = await Promise.all([
    canonicalPath(root),
    canonicalPath(bindingPacket.planningRoot)
  ]);

  if (expectedRoot !== packetRoot) {
    throw new Error('planningRoot points outside the expected authority root');
  }

  await resolveAuthorityBinding({
    root,
    authorityTaskId: bindingPacket.authorityTaskId,
    planningRoot: root,
    activeTaskIds: [bindingPacket.authorityTaskId],
    bindingPacket
  });

  const authoritativeBinding = await readAuthoritativeBinding({ root, bindingPacket });
  return buildManualHandoffPrompt({ bindingPacket: authoritativeBinding });
}

export async function resolveModelFromFile({ capabilityClass, availableFile }) {
  return resolveModel({
    capabilityClass,
    availableModels: validateAvailableModels(await readJsonFile(availableFile)),
    mapping: {}
  });
}
