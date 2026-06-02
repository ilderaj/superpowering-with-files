import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getActiveTaskSummary, getTaskSummary } from './summary-service.mjs';
import { getHarnessStatus } from './status-service.mjs';
import { resolveHarnessRoot } from './root-policy.mjs';
import { runHarnessVerify } from './verify-service.mjs';
import { sanitizeText } from './redaction.mjs';

function taskUri(taskId, fileName) {
  return `harness://task/${taskId}/${fileName}`;
}

function buildContents(uri, text) {
  return {
    contents: [
      {
        uri,
        mimeType: 'text/markdown',
        text
      }
    ]
  };
}

export async function readHarnessResource(uri, input = {}) {
  const resolved = await resolveHarnessRoot(input.root, input);

  if (uri === 'harness://status') {
    const { health } = await getHarnessStatus({ ...input, root: resolved.rootDir });
    return buildContents(uri, sanitizeText(JSON.stringify(health, null, 2), input));
  }

  if (uri === 'harness://active-tasks') {
    const { report } = await getActiveTaskSummary({ ...input, root: resolved.rootDir });
    return buildContents(uri, sanitizeText(JSON.stringify(report, null, 2), input));
  }

  if (uri === 'harness://verification/latest') {
    const { report } = await runHarnessVerify({ ...input, root: resolved.rootDir });
    return buildContents(uri, sanitizeText(JSON.stringify(report, null, 2), input));
  }

  if (uri === 'harness://policy/base') {
    const text = await readFile(path.join(resolved.rootDir, 'harness/core/policy/base.md'), 'utf8');
    return buildContents(uri, sanitizeText(text, input));
  }

  if (uri === 'harness://adapters') {
    const text = await readFile(path.join(resolved.rootDir, 'harness/core/metadata/platforms.json'), 'utf8');
    return buildContents(uri, sanitizeText(text, input));
  }

  if (uri === 'harness://commands') {
    const text = await readFile(path.join(resolved.rootDir, 'harness/installer/commands/harness.mjs'), 'utf8');
    return buildContents(uri, sanitizeText(text, input));
  }

  const taskMatch = uri.match(/^harness:\/\/task\/([^/]+)\/(task_plan|findings|progress|reconciliation)$/);
  if (taskMatch) {
    const [, taskId, fileStem] = taskMatch;
    const { taskDir } = await getTaskSummary({ ...input, root: resolved.rootDir, taskId });
    const text = await readFile(path.join(taskDir, `${fileStem}.md`), 'utf8');
    return buildContents(uri, sanitizeText(text, input));
  }

  throw new Error(`Unsupported Harness resource: ${uri}`);
}

export async function listHarnessResources(input = {}) {
  const resolved = await resolveHarnessRoot(input.root, input);
  const activeTasks = await getActiveTaskSummary({ ...input, root: resolved.rootDir });
  const taskResources = (
    await Promise.all(
      activeTasks.report.tasks.map(async (task) => {
        const resources = [
          {
            name: `${task.task_id} task_plan`,
            uri: taskUri(task.task_id, 'task_plan'),
            mimeType: 'text/markdown'
          },
          {
            name: `${task.task_id} findings`,
            uri: taskUri(task.task_id, 'findings'),
            mimeType: 'text/markdown'
          },
          {
            name: `${task.task_id} progress`,
            uri: taskUri(task.task_id, 'progress'),
            mimeType: 'text/markdown'
          }
        ];

        if (task.reconciliation_artifact) {
          resources.push({
            name: `${task.task_id} reconciliation`,
            uri: taskUri(task.task_id, 'reconciliation'),
            mimeType: 'text/markdown'
          });
        }

        return resources;
      })
    )
  ).flat();

  return [
    { name: 'Harness status', uri: 'harness://status', mimeType: 'application/json' },
    { name: 'Active tasks', uri: 'harness://active-tasks', mimeType: 'application/json' },
    { name: 'Latest verification', uri: 'harness://verification/latest', mimeType: 'application/json' },
    { name: 'Base policy', uri: 'harness://policy/base', mimeType: 'text/markdown' },
    { name: 'Adapter metadata', uri: 'harness://adapters', mimeType: 'application/json' },
    { name: 'Command surface', uri: 'harness://commands', mimeType: 'text/javascript' },
    ...taskResources
  ];
}
