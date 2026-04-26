import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TASK_ENV_VARS = ['PLANNING_TASK_ID', 'CODEX_THREAD_ID', 'CLAUDE_SESSION_ID'];
const MAX_TASK_SLUG_LENGTH = 48;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeAscii(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '');
}

function sanitizeSegment(value, maxLength = MAX_TASK_SLUG_LENGTH) {
  const slug = normalizeAscii(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return (slug || 'default').slice(0, maxLength).replace(/-+$/g, '') || 'default';
}

function sanitizeNamespace(value) {
  const segments = String(value ?? '')
    .split('/')
    .filter((segment) => segment.trim() !== '')
    .map((segment) => sanitizeSegment(segment, 24))
    .filter(Boolean);

  return segments.length > 0 ? segments.join('/') : '';
}

function formatTimestamp(now = Date.now()) {
  if (typeof now === 'string' && /^\d{12}$/.test(now)) {
    return now;
  }

  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid worktree naming clock value.');
  }

  const parts = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0')
  ];

  return parts.join('');
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function gitOutput(cwd, ...args) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 1024 * 1024 });
    return stdout.trim();
  } catch {
    return '';
  }
}

async function listActiveTaskIds(activeRoot) {
  const entries = await readdir(activeRoot, { withFileTypes: true }).catch(() => []);
  const activeTaskIds = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const taskPlanPath = path.join(activeRoot, entry.name, 'task_plan.md');
    const taskPlan = await readFile(taskPlanPath, 'utf8').catch(() => null);
    if (taskPlan && /^Status:\s*active$/m.test(taskPlan)) {
      activeTaskIds.push(entry.name);
    }
  }

  return activeTaskIds.sort();
}

async function resolvePlanningTask(rootDir, explicitTaskId) {
  if (explicitTaskId) {
    const taskSlug = sanitizeSegment(explicitTaskId);
    const taskDir = path.join(rootDir, 'planning/active', taskSlug);
    return {
      taskId: taskSlug,
      taskSlug,
      taskDir: (await pathExists(taskDir)) ? taskDir : null,
      source: 'explicit'
    };
  }

  for (const envName of TASK_ENV_VARS) {
    const envValue = process.env[envName]?.trim();
    if (!envValue) {
      continue;
    }

    const taskSlug = sanitizeSegment(envValue);
    const taskDir = path.join(rootDir, 'planning/active', taskSlug);
    return {
      taskId: taskSlug,
      taskSlug,
      taskDir: (await pathExists(taskDir)) ? taskDir : null,
      source: envName
    };
  }

  const activeRoot = path.join(rootDir, 'planning/active');
  if (!(await pathExists(activeRoot))) {
    return null;
  }

  const activeTaskIds = await listActiveTaskIds(activeRoot);
  if (activeTaskIds.length === 0) {
    throw new Error('No active planning task found under planning/active. Use --task <task-id>.');
  }

  if (activeTaskIds.length > 1) {
    throw new Error(
      `Multiple active planning tasks found under planning/active: ${activeTaskIds.join(', ')}. Use --task <task-id>.`
    );
  }

  const taskSlug = sanitizeSegment(activeTaskIds[0]);
  return {
    taskId: taskSlug,
    taskSlug,
    taskDir: path.join(activeRoot, activeTaskIds[0]),
    source: 'planning'
  };
}

async function resolveTaskIdentity(rootDir, explicitTaskId) {
  const planningTask = await resolvePlanningTask(rootDir, explicitTaskId);
  if (planningTask) {
    return planningTask;
  }

  const currentBranch = await gitOutput(rootDir, 'branch', '--show-current');
  if (currentBranch) {
    const taskSlug = sanitizeSegment(currentBranch);
    return {
      taskId: taskSlug,
      taskSlug,
      taskDir: null,
      source: 'branch'
    };
  }

  return {
    taskId: 'default',
    taskSlug: 'default',
    taskDir: null,
    source: 'default'
  };
}

async function nextSequence(taskDir, taskSlug) {
  if (!taskDir) {
    return '001';
  }

  const progressPath = path.join(taskDir, 'progress.md');
  const content = await readFile(progressPath, 'utf8').catch(() => '');
  const matcher = new RegExp(`\\b\\d{12}-${escapeRegExp(taskSlug)}-(\\d{3})\\b`, 'g');
  let next = 1;

  for (const match of content.matchAll(matcher)) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed >= next) {
      next = parsed + 1;
    }
  }

  return String(next).padStart(3, '0');
}

export async function resolveWorktreeNaming(rootDir, options = {}) {
  const { taskId: explicitTaskId, namespace } = options;
  const now = options.now ?? process.env.HARNESS_WORKTREE_NAME_NOW ?? Date.now();
  const identity = await resolveTaskIdentity(rootDir, explicitTaskId);
  const timestamp = formatTimestamp(now);
  const sequence = await nextSequence(identity.taskDir, identity.taskSlug);
  const canonicalLabel = `${timestamp}-${identity.taskSlug}-${sequence}`;
  const namespacePrefix = sanitizeNamespace(namespace);
  const branchName = namespacePrefix ? `${namespacePrefix}/${canonicalLabel}` : canonicalLabel;

  return {
    taskId: identity.taskId,
    taskSlug: identity.taskSlug,
    timestamp,
    sequence,
    canonicalLabel,
    branchName,
    worktreeBasename: canonicalLabel
  };
}
