#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { analyzeCloudDevIssue, buildIssueCommentCommand } from './lib/cloud-dev-issue.mjs';

const execFileAsync = promisify(execFile);
const resultPath = '.harness/cloud-dev-issue-triage-result.json';

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseIssueNumberInput(issueNumberInput) {
  if (issueNumberInput == null) {
    throw new Error('workflow_dispatch issue_number input is required for cloud-dev triage.');
  }

  const normalized = String(issueNumberInput).trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new Error('workflow_dispatch issue_number must be a positive integer.');
  }

  return Number.parseInt(normalized, 10);
}

export async function runCommand(command, {
  cwd = process.cwd(),
  env = process.env
} = {}) {
  const { stdout, stderr } = await execFileAsync(command.file, command.args ?? [], {
    cwd,
    env,
    shell: false,
    maxBuffer: 1024 * 1024
  });

  return { stdout, stderr };
}

async function writeResult(result, {
  cwd = process.cwd()
} = {}) {
  const targetPath = path.resolve(cwd, resultPath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

async function resolveIssueContext({
  event,
  eventName,
  issueNumber,
  cwd,
  env,
  run
}) {
  if (event?.issue) {
    return {
      issue: event.issue,
      issueNumber: event.issue?.number ?? null
    };
  }

  if (eventName !== 'workflow_dispatch') {
    return { issue: undefined, issueNumber: null };
  }

  const { stdout } = await run({
    file: 'gh',
    args: ['issue', 'view', String(issueNumber), '--json', 'number,title,labels']
  }, { cwd, env });

  return {
    issue: JSON.parse(stdout),
    issueNumber
  };
}

async function hasExistingAutomationComment({ issueNumber, body, cwd, env, run }) {
  const { stdout } = await run({
    file: 'gh',
    args: ['issue', 'view', String(issueNumber), '--json', 'comments']
  }, { cwd, env });

  const issue = JSON.parse(stdout);
  const comments = Array.isArray(issue.comments) ? issue.comments : [];

  return comments.some((comment) => {
    return comment?.author?.login === 'github-actions' && comment?.body === body;
  });
}

export async function runCloudDevIssueTriage({
  cwd = process.cwd(),
  env = process.env,
  event,
  eventName = env.GITHUB_EVENT_NAME,
  cloudDevReady = env.CLOUD_DEV_READY === 'true',
  runCommand: run = runCommand
} = {}) {
  let issue;
  let issueNumber = event?.issue?.number ?? null;
  let analysis;
  let failureReason = 'analysis_failed';
  let result;

  try {
    if (!event?.issue && eventName === 'workflow_dispatch') {
      failureReason = 'issue_lookup_failed';
      issueNumber = parseIssueNumberInput(event?.inputs?.issue_number);
      const issueContext = await resolveIssueContext({ event, eventName, issueNumber, cwd, env, run });
      issue = issueContext.issue;
    } else {
      issue = event?.issue;
      issueNumber = issue?.number ?? null;
    }

    failureReason = 'analysis_failed';
    analysis = analyzeCloudDevIssue({
      issue,
      cloudDevReady,
      eventName,
      commentBody: event?.comment?.body
    });

    if (analysis.shouldComment) {
      // Only automatic issues events are deduped. Manual retry and workflow_dispatch
      // remain explicit recovery paths and may intentionally post the handoff again.
      if (eventName === 'issues' && await hasExistingAutomationComment({
        issueNumber,
        body: analysis.commentBody,
        cwd,
        env,
        run
      })) {
        analysis = {
          ...analysis,
          shouldComment: false,
          shouldPromptCopilot: false,
          reason: 'already_commented'
        };
      }
    }

    if (analysis.shouldComment) {
      failureReason = 'comment_failed';
      await run(buildIssueCommentCommand({
        issueNumber,
        body: analysis.commentBody
      }), { cwd, env });
    }

    result = {
      status: analysis.reason,
      issue: issueNumber,
      analysis
    };
  } catch (error) {
    result = {
      status: 'failed',
      issue: issueNumber,
      analysis,
      reason: failureReason,
      error: formatError(error)
    };
  }

  await writeResult(result, { cwd });
  return result;
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!eventPath) {
    throw new Error('GITHUB_EVENT_PATH is required.');
  }

  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  const result = await runCloudDevIssueTriage({
    event,
    eventName: process.env.GITHUB_EVENT_NAME
  });

  if (result.status === 'failed') {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
