import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function listActiveTaskIds(activeRoot) {
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

export async function resolveActiveTaskDirectory(rootDir, explicitTaskId) {
  const activeRoot = path.join(rootDir, 'planning/active');
  if (explicitTaskId) {
    const taskDir = path.join(activeRoot, explicitTaskId);
    if (!(await pathExists(taskDir))) {
      throw new Error(`Task "${explicitTaskId}" not found under planning/active.`);
    }
    return taskDir;
  }

  const activeTaskIds = await listActiveTaskIds(activeRoot);
  if (activeTaskIds.length === 0) {
    throw new Error('No active task found under planning/active.');
  }

  if (activeTaskIds.length > 1) {
    throw new Error(
      `Multiple active tasks found under planning/active: ${activeTaskIds.join(', ')}. Use --task <id>.`
    );
  }

  return path.join(activeRoot, activeTaskIds[0]);
}
