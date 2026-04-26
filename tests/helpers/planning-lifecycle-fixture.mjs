import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

function fixtureRoot() {
  return path.join(
    process.cwd(),
    '.test-fixtures',
    `planning-lifecycle-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export async function createPlanningLifecycleFixture() {
  const root = fixtureRoot();
  await mkdir(root, { recursive: true });
  await cp(path.join(process.cwd(), 'harness'), path.join(root, 'harness'), { recursive: true });
  await cp(path.join(process.cwd(), 'docs'), path.join(root, 'docs'), { recursive: true });
  return {
    root,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    }
  };
}

export async function writeActiveTask(root, taskId, files) {
  const taskDir = path.join(root, 'planning', 'active', taskId);
  await mkdir(taskDir, { recursive: true });

  const fileMap = {
    taskPlan: 'task_plan.md',
    findings: 'findings.md',
    progress: 'progress.md'
  };

  for (const [key, name] of Object.entries(fileMap)) {
    if (files[key] !== undefined) {
      await writeFile(path.join(taskDir, name), `${files[key]}`, 'utf8');
    }
  }

  return taskDir;
}

export async function writeCompanion(root, relativePath, markdown) {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, markdown, 'utf8');
  return absolutePath;
}

function buildProcessError(command, error) {
  const stdout = error.stdout ?? '';
  const stderr = error.stderr ?? '';
  const message = [stdout, stderr].filter(Boolean).join('\n').trim() || `${command} failed`;
  const wrapped = new Error(message);
  wrapped.code = error.code;
  wrapped.stdout = stdout;
  wrapped.stderr = stderr;
  return wrapped;
}

export async function runPythonScript(root, relativeScript, args = []) {
  const scriptPath = path.join(root, relativeScript);
  try {
    return await execFileAsync('python3', [scriptPath, root, ...args], { cwd: root });
  } catch (error) {
    throw buildProcessError('python3', error);
  }
}

export async function runShellScript(root, relativeScript, args = []) {
  const scriptPath = path.join(root, relativeScript);
  try {
    return await execFileAsync('bash', [scriptPath, root, ...args], { cwd: root });
  } catch (error) {
    throw buildProcessError('bash', error);
  }
}
