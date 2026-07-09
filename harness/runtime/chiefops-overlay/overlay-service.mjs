import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
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

  return buildManualHandoffPrompt({ bindingPacket });
}

export async function resolveModelFromFile({ capabilityClass, availableFile }) {
  return resolveModel({
    capabilityClass,
    availableModels: await readJsonFile(availableFile),
    mapping: {}
  });
}
