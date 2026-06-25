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
  const hasSuccessfulMatchingRun = workflowRuns.some((run) =>
    run?.name === repoVerifyWorkflowName
    && run?.head_sha === targetSha
    && run?.status === 'completed'
    && run?.conclusion === 'success'
  );

  if (hasSuccessfulMatchingRun) {
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
  targetSha,
  cwd = process.cwd(),
  env = process.env,
  requestJson = runJsonCommand,
  repoLoader = async (options) => {
    const repo = await requestJson({
      file: 'gh',
      args: ['repo', 'view', '--json', 'nameWithOwner']
    }, options);
    return repo.nameWithOwner;
  }
} = {}) {
  const nameWithOwner = await repoLoader({ cwd, env });
  const query = new URLSearchParams({
    branch,
    head_sha: targetSha,
    per_page: '100'
  });
  const response = await requestJson({
    file: 'gh',
    args: ['api', `repos/${nameWithOwner}/actions/runs?${query.toString()}`]
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
  const workflowRuns = await workflowRunsLoader({ branch, targetSha, cwd, env });
  return classifyBaseHealth({ branch, targetSha, workflowRuns });
}
