import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

async function exists(file) {
  return access(file).then(() => true, () => false);
}

function normalizeText(value) {
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePath(value) {
  return path.posix.normalize(String(value).replace(/\\/g, '/'));
}

function stripAnchor(value) {
  return String(value).split(/[?#]/, 1)[0];
}

async function requireTrio(root, taskId) {
  const dir = path.join(root, 'planning/active', taskId);
  const files = ['task_plan.md', 'findings.md', 'progress.md'].map((file) => path.join(dir, file));
  const present = await Promise.all(files.map(exists));

  if (present.some((value) => !value)) {
    throw new Error(`missing authoritative trio files for ${taskId}`);
  }

  const [taskPlan, findings, progress] = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  return { dir, taskPlan, findings, progress };
}

function extractStatus(taskPlan) {
  const match = taskPlan.match(/^Status:\s*(.+)$/im);
  return match?.[1]?.trim().toLowerCase() || 'unknown';
}

function isActiveStatus(status) {
  return !['closed', 'archived', 'done', 'complete'].includes(status);
}

function bindingSurfaceMatches({ taskId, bindingPacket, taskPlan, findings, progress }) {
  if (!bindingPacket) {
    return true;
  }

  const expectedRoot = normalizePath(`planning/active/${taskId}/`);
  const evidenceSink = normalizePath(stripAnchor(bindingPacket.evidenceSink));
  if (evidenceSink !== normalizePath(`planning/active/${taskId}/progress.md`) && !evidenceSink.startsWith(expectedRoot)) {
    return false;
  }

  const surface = normalizeText(`${taskPlan}\n${findings}\n${progress}`);
  const signals = [bindingPacket.currentSlice, bindingPacket.proofTarget]
    .filter(Boolean)
    .map((value) => normalizeText(value));

  return signals.length > 0 && signals.every((signal) => surface.includes(signal));
}

function resolveTaskId({ authorityTaskId, bindingPacket }) {
  return authorityTaskId || bindingPacket?.authorityTaskId || null;
}

function assertAuthorityBindingInputs({ root, authorityTaskId, planningRoot, activeTaskIds, bindingPacket, humanConfirmed }) {
  if (!root) {
    throw new Error('root is required');
  }

  const resolvedTaskId = resolveTaskId({ authorityTaskId, bindingPacket });
  if (!resolvedTaskId) {
    if (Array.isArray(activeTaskIds) && activeTaskIds.length > 1 && !humanConfirmed) {
      throw new Error('multiple active tasks require explicit authority binding');
    }
    throw new Error('authorityTaskId is required');
  }

  if (Array.isArray(activeTaskIds) && activeTaskIds.length > 0 && !activeTaskIds.includes(resolvedTaskId)) {
    throw new Error(`authority task ${resolvedTaskId} is not in the active task set`);
  }

  const expectedRoot = path.resolve(root);
  const resolvedRoot = path.resolve(planningRoot || root);
  if (resolvedRoot !== expectedRoot) {
    throw new Error('planningRoot points outside the expected authority root');
  }

  if (bindingPacket?.authorityTaskId && bindingPacket.authorityTaskId !== resolvedTaskId) {
    throw new Error('bindingPacket authorityTaskId does not match the resolved authority task');
  }

  return { resolvedTaskId, resolvedRoot };
}

export async function resolveAuthorityBinding({
  root,
  authorityTaskId,
  planningRoot,
  activeTaskIds = [],
  bindingPacket,
  humanConfirmed = false
}) {
  const { resolvedTaskId, resolvedRoot } = assertAuthorityBindingInputs({
    root,
    authorityTaskId,
    planningRoot,
    activeTaskIds,
    bindingPacket,
    humanConfirmed
  });

  const { dir, taskPlan, findings, progress } = await requireTrio(resolvedRoot, resolvedTaskId);
  const status = extractStatus(taskPlan);

  if (!isActiveStatus(status)) {
    throw new Error(`authority task ${resolvedTaskId} is not active`);
  }

  if (!/^#\s+/m.test(taskPlan)) {
    throw new Error('task_plan.md missing title');
  }

  if (!bindingSurfaceMatches({ taskId: resolvedTaskId, bindingPacket, taskPlan, findings, progress })) {
    throw new Error('binding does not match authoritative trio surface');
  }

  return {
    status: 'verified_bound',
    authorityTaskId: resolvedTaskId,
    planningRoot: resolvedRoot,
    taskDir: dir
  };
}

