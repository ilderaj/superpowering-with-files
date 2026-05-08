#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  buildBotGitIdentityCommands,
  buildCommitCommands,
  buildCreatePullRequestCommand,
  buildDetectRemoteBranchCommand,
  buildListOpenPullRequestsCommand,
  buildUpdatePullRequestCommand,
  buildUpstreamPullRequestPlan,
  defaultPullRequestBodyPath,
  defaultRefreshResultPath,
  parseRemoteBranchExists,
  formatCommand,
  parseOpenPullRequests
} from './lib/upstream-pr.mjs';

const execFileAsync = promisify(execFile);

export class UpstreamPullRequestError extends Error {
  constructor(message, { cause } = {}) {
    super(message, { cause });
    this.name = 'UpstreamPullRequestError';
  }
}

export async function readRefreshResult({
  cwd = process.cwd(),
  resultPath = defaultRefreshResultPath
} = {}) {
  const resultText = await readFile(path.resolve(cwd, resultPath), 'utf8');
  return JSON.parse(resultText);
}

function appendCommandOutput(message, error) {
  const sections = [message];

  if (error?.stdout) {
    sections.push(`stdout:\n${String(error.stdout).trimEnd()}`);
  }

  if (error?.stderr) {
    sections.push(`stderr:\n${String(error.stderr).trimEnd()}`);
  }

  return sections.join('\n\n');
}

export async function runCommand(command, {
  cwd = process.cwd(),
  env = process.env
} = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command.file, command.args ?? [], {
      cwd,
      env,
      shell: false,
      maxBuffer: 1024 * 1024
    });

    return { stdout, stderr };
  } catch (error) {
    error.command = formatCommand(command);
    throw error;
  }
}

async function writePullRequestBodyFile({
  cwd,
  body,
  bodyFilePath = defaultPullRequestBodyPath
}) {
  const resolvedBodyFilePath = path.resolve(cwd, bodyFilePath);
  await mkdir(path.dirname(resolvedBodyFilePath), { recursive: true });
  await writeFile(resolvedBodyFilePath, `${body}\n`, 'utf8');
  return { bodyFilePath, resolvedBodyFilePath };
}

async function cleanupPullRequestBodyFile(resolvedBodyFilePath) {
  try {
    await unlink(resolvedBodyFilePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function runRequiredCommand(command, {
  cwd,
  env,
  run,
  failureMessage
}) {
  try {
    return await run(command, { cwd, env });
  } catch (error) {
    throw new UpstreamPullRequestError(appendCommandOutput(`${failureMessage}: ${error instanceof Error ? error.message : String(error)}`, error), {
      cause: error
    });
  }
}

async function runCommands(commands, options) {
  for (const command of commands) {
    await runRequiredCommand(command, options);
  }
}

async function loadOpenPullRequests({ cwd, env, run }) {
  const command = buildListOpenPullRequestsCommand();
  const result = await runRequiredCommand(command, {
    cwd,
    env,
    run,
    failureMessage: 'gh pr list failed'
  });

  try {
    return parseOpenPullRequests(result.stdout ?? '');
  } catch (error) {
    throw new UpstreamPullRequestError(`gh pr list failed: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error
    });
  }
}

async function loadRemoteAutomationBranchExists({ cwd, env, run }) {
  const command = buildDetectRemoteBranchCommand();
  const result = await runRequiredCommand(command, {
    cwd,
    env,
    run,
    failureMessage: 'git ls-remote failed'
  });

  return parseRemoteBranchExists(result.stdout ?? '');
}

export async function runOpenUpstreamPullRequest({
  cwd = process.cwd(),
  env = process.env,
  resultPath = defaultRefreshResultPath,
  readRefreshResult: readResult = readRefreshResult,
  runCommand: run = runCommand
} = {}) {
  const refreshResult = await readResult({ cwd, resultPath });
  const refreshStatus = refreshResult?.status ?? 'unknown';

  if (refreshStatus !== 'success') {
    throw new UpstreamPullRequestError(`Cannot open upstream PR because refresh status is ${refreshStatus}`);
  }

  const preliminaryPlan = buildUpstreamPullRequestPlan({
    eligibleFiles: refreshResult.eligibleFiles,
    sourceHeads: refreshResult.sourceHeads
  });

  if (!preliminaryPlan.shouldOpenPullRequest) {
    return {
      status: 'skipped',
      reason: 'no_eligible_files',
      plan: preliminaryPlan
    };
  }

  await runCommands(buildBotGitIdentityCommands(), {
    cwd,
    env,
    run,
    failureMessage: 'git config failed'
  });

  const [gitAddCommand, gitCommitCommand] = buildCommitCommands({
    eligibleFiles: preliminaryPlan.eligibleFiles
  });

  await runRequiredCommand(gitAddCommand, {
    cwd,
    env,
    run,
    failureMessage: 'git add failed'
  });
  await runRequiredCommand(gitCommitCommand, {
    cwd,
    env,
    run,
    failureMessage: 'git commit failed'
  });

  const openPullRequests = await loadOpenPullRequests({ cwd, env, run });
  const remoteBranchExists = await loadRemoteAutomationBranchExists({ cwd, env, run });
  const plan = buildUpstreamPullRequestPlan({
    eligibleFiles: refreshResult.eligibleFiles,
    sourceHeads: refreshResult.sourceHeads,
    openPullRequests,
    remoteBranchExists
  });
  const { bodyFilePath, resolvedBodyFilePath } = await writePullRequestBodyFile({
    cwd,
    body: plan.body
  });

  try {
    if (plan.shouldUpdatePullRequest) {
      await runRequiredCommand(plan.commands.push, {
        cwd,
        env,
        run,
        failureMessage: 'git push failed'
      });
      await runRequiredCommand(buildUpdatePullRequestCommand({
        number: plan.existingPullRequest.number,
        bodyFilePath
      }), {
        cwd,
        env,
        run,
        failureMessage: 'gh pr update failed'
      });

      return {
        status: 'updated',
        pullRequest: plan.existingPullRequest,
        plan
      };
    }

    await runRequiredCommand(plan.commands.push, {
      cwd,
      env,
      run,
      failureMessage: 'git push failed'
    });
    const createResult = await runRequiredCommand(buildCreatePullRequestCommand({ bodyFilePath }), {
      cwd,
      env,
      run,
      failureMessage: 'gh pr create failed'
    });

    return {
      status: 'created',
      pullRequest: {
        url: createResult.stdout?.trim()
      },
      plan
    };
  } finally {
    await cleanupPullRequestBodyFile(resolvedBodyFilePath);
  }
}

async function main() {
  try {
    await runOpenUpstreamPullRequest();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
