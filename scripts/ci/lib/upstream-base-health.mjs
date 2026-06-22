import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const repoVerifyWorkflowName = 'Repo Verify';
const defaultHealthyResult = {
  status: 'healthy',
  failureKind: '',
  reason: ''
};

async function runJsonCommand(command, {
  cwd = process.cwd(),
  env = process.env
} = {}) {
  const { stdout } = await execFileAsync(command.file, command.args ?? [], {
    cwd,
    env,
    shell: false,
    maxBuffer: 1024 * 1024
  });

  return JSON.parse(stdout);
}

export function classifyBaseHealth({ branch, targetSha, workflowRuns }) {
  const matchingRun = workflowRuns.find((run) =>
    run?.name === repoVerifyWorkflowName
    && run?.head_sha === targetSha
    && run?.status === 'completed'
  );

  if (matchingRun?.conclusion === 'success') {
    return {
      ...defaultHealthyResult,
      targetSha
    };
  }

  return {
    status: 'blocked',
    failureKind: 'base_unhealthy',
    reason: `Repo Verify is not green for origin/${branch} @ ${targetSha}.`,
    targetSha
  };
}

export function createBaseHealthBlockedError({ branch, targetSha, reason }) {
  const error = new Error(reason || `Repo Verify is not green for origin/${branch} @ ${targetSha}.`);
  error.failureKind = 'base_unhealthy';
  error.branch = branch;
  error.targetSha = targetSha;
  return error;
}

export async function resolveBaseTargetSha({
  branch,
  cwd = process.cwd(),
  env = process.env
} = {}) {
  const { stdout } = await execFileAsync('git', ['rev-parse', `origin/${branch}`], {
    cwd,
    env,
    shell: false,
    maxBuffer: 1024 * 1024
  });

  return stdout.trim();
}

export async function loadWorkflowRuns({
  branch,
  cwd = process.cwd(),
  env = process.env,
  repoLoader = async (options) => {
    const repo = await runJsonCommand({
      file: 'gh',
      args: ['repo', 'view', '--json', 'nameWithOwner']
    }, options);
    return repo.nameWithOwner;
  }
} = {}) {
  const nameWithOwner = await repoLoader({ cwd, env });
  const response = await runJsonCommand({
    file: 'gh',
    args: ['api', `repos/${nameWithOwner}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=100`]
  }, { cwd, env });

  return response.workflow_runs ?? [];
}

export async function loadBaseHealth({
  branch,
  cwd = process.cwd(),
  env = process.env,
  resolveTargetSha = async (options) => resolveBaseTargetSha(options),
  workflowRunsLoader = async (options) => loadWorkflowRuns(options)
} = {}) {
  const targetSha = await resolveTargetSha({ branch, cwd, env });
  const workflowRuns = await workflowRunsLoader({ branch, cwd, env });
  return classifyBaseHealth({ branch, targetSha, workflowRuns });
}
