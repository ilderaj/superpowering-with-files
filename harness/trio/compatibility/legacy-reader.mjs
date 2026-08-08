import {
  assertValidTaskId,
  isTerminalStatus,
  parseTaskStatus,
  readTrioFile,
  resolveTrioTask
} from '../core/read.mjs';

export async function readLegacyTask(rootDir, options = {}) {
  const resolved = await resolveTrioTask(rootDir, options);
  const taskPlanFile = await readTrioFile(resolved, 'task_plan.md');
  const taskPlan = taskPlanFile.contents;
  if (taskPlan.trim() === '') {
    throw new Error(`Legacy task "${resolved.taskId}" is missing task_plan.md.`);
  }
  const status = parseTaskStatus(taskPlan);
  if (!status) throw new Error(`Legacy task "${resolved.taskId}" has an invalid status.`);

  const findingsFile = await readTrioFile(resolved, 'findings.md', { optional: true });
  const progressFile = await readTrioFile(resolved, 'progress.md', { optional: true });
  return {
    rootDir: resolved.rootDir,
    taskDir: resolved.taskDir,
    taskId: resolved.taskId,
    source: 'legacy',
    status,
    terminal: isTerminalStatus(status),
    files: {
      taskPlan,
      findings: findingsFile?.contents ?? null,
      progress: progressFile?.contents ?? null
    }
  };
}

export const readLegacyTrio = readLegacyTask;
export const readLegacy = readLegacyTask;
export { assertValidTaskId };
