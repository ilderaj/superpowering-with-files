#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  normalizePrReviewSnapshot,
  reducePrReviewFeedback,
  validatePrBinding
} from './lib/pr-review-feedback.mjs';

const PR_JSON_FIELDS = [
  'number',
  'state',
  'baseRefName',
  'baseRefOid',
  'headRefName',
  'headRefOid',
  'reviewDecision',
  'mergeable',
  'mergeStateStatus'
].join(',');

export const REVIEW_SNAPSHOT_QUERY = `query($owner:String!,$name:String!,$number:Int!,$reviewCursor:String,$threadCursor:String,$checkCursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$threadCursor){nodes{id isResolved isOutdated path line comments(first:100){nodes{databaseId body updatedAt createdAt path line author{login}}}} pageInfo{hasNextPage endCursor}} reviews(first:100,after:$reviewCursor){nodes{id state submittedAt commit{oid} author{login}} pageInfo{hasNextPage endCursor}} commits(last:1){nodes{commit{oid statusCheckRollup{contexts(first:100,after:$checkCursor){nodes{__typename ... on CheckRun{name status conclusion completedAt detailsUrl} ... on StatusContext{context state createdAt targetUrl}} pageInfo{hasNextPage endCursor}}}}}}}}}`;

function resultForError(code, reason, field = 'input') {
  return {
    schema: 'swf/pr-review-feedback-result',
    version: 1,
    status: 'rejected',
    readOnly: true,
    errors: [{ code, reason, field }],
    observations: [],
    actions: [],
    mergeExecuted: false
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function commandExit(result) {
  return result?.exitCode ?? result?.code ?? 0;
}

function parseCommandJson(result, commandName) {
  if (commandExit(result) !== 0) {
    throw new Error(`${commandName} failed with exit code ${commandExit(result)}`);
  }
  try {
    return JSON.parse(result.stdout ?? '');
  } catch {
    throw new Error(`${commandName} returned invalid JSON`);
  }
}

function repositoryParts(repository) {
  const [owner, name] = repository.split('/');
  return { owner, name };
}

function pageInfo(connection) {
  return connection?.pageInfo ?? { hasNextPage: false, endCursor: null };
}

function graphQlPullRequest(payload) {
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error('gh api graphql returned GraphQL errors');
  }
  const pullRequest = payload?.data?.repository?.pullRequest;
  if (!pullRequest || typeof pullRequest !== 'object') {
    throw new Error('gh api graphql returned no pull request snapshot');
  }
  return pullRequest;
}

function graphQlArgs(binding, owner, name, reviewCursor, threadCursor, checkCursor) {
  const args = [
    'api',
    'graphql',
    '-f',
    `query=${REVIEW_SNAPSHOT_QUERY}`,
    '-f',
    `owner=${owner}`,
    '-f',
    `name=${name}`,
    '-F',
    `number=${binding.number}`
  ];
  if (reviewCursor) args.push('-f', `reviewCursor=${reviewCursor}`);
  if (threadCursor) args.push('-f', `threadCursor=${threadCursor}`);
  if (checkCursor) args.push('-f', `checkCursor=${checkCursor}`);
  return args;
}

function runGhCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
      exitCode
    }));
  });
}

async function readInput({ input, argv }) {
  if (input !== undefined) return input;
  if (argv.length > 1) throw new Error('Provide one binding path or JSON on standard input.');
  const source = argv[0] && argv[0] !== '-' ? await readFile(argv[0], 'utf8') : await readStdin();
  return JSON.parse(source);
}

function graphQlCheckConnection(pullRequest) {
  if (Array.isArray(pullRequest?.checks)) return { nodes: pullRequest.checks };
  if (pullRequest?.checks?.nodes) return pullRequest.checks;
  if (Array.isArray(pullRequest?.statusCheckRollup)) return { nodes: pullRequest.statusCheckRollup };
  if (pullRequest?.statusCheckRollup?.contexts) return pullRequest.statusCheckRollup.contexts;
  return pullRequest?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts
    ?? { nodes: [] };
}

function graphQlChecks(pullRequest) {
  const connection = graphQlCheckConnection(pullRequest);
  const headSha = pullRequest?.commits?.nodes?.[0]?.commit?.oid ?? null;
  return (connection.nodes ?? []).map((check) => {
    if (check?.context !== undefined) {
      return {
        ...check,
        name: check.context,
        conclusion: check.state,
        headSha: check.headSha ?? headSha
      };
    }
    return { ...check, headSha: check?.headSha ?? headSha };
  });
}

function nextCursor(connection, previousCursor, kind) {
  const info = pageInfo(connection);
  if (info.hasNextPage !== true) return null;
  if (!info.endCursor || info.endCursor === previousCursor) {
    throw new Error(`${kind} pagination did not provide a next cursor`);
  }
  return info.endCursor;
}

async function collectGraphQlSnapshot({ binding, owner, name, runCommand }) {
  const reviewThreadPages = [];
  const reviewPages = [];
  const checkPages = [];
  let reviewCursor = null;
  let threadCursor = null;
  let checkCursor = null;
  let hasNextReviewPage = true;
  let hasNextThreadPage = true;
  let hasNextCheckPage = true;

  while (hasNextReviewPage || hasNextThreadPage || hasNextCheckPage) {
    const result = await runCommand('gh', graphQlArgs(binding, owner, name, reviewCursor, threadCursor, checkCursor));
    const pullRequest = graphQlPullRequest(parseCommandJson(result, 'gh api graphql'));
    const threadConnection = pullRequest.reviewThreads ?? { nodes: [], pageInfo: { hasNextPage: false } };
    const reviewConnection = pullRequest.reviews ?? { nodes: [], pageInfo: { hasNextPage: false } };
    const checkConnection = graphQlCheckConnection(pullRequest);
    reviewThreadPages.push(threadConnection);
    reviewPages.push(reviewConnection);
    checkPages.push({ nodes: graphQlChecks(pullRequest), pageInfo: pageInfo(checkConnection) });

    const nextThreadCursor = nextCursor(threadConnection, threadCursor, 'Review-thread');
    const nextReviewCursor = nextCursor(reviewConnection, reviewCursor, 'Review');
    const nextCheckCursor = nextCursor(checkConnection, checkCursor, 'Check');
    hasNextThreadPage = nextThreadCursor !== null;
    hasNextReviewPage = nextReviewCursor !== null;
    hasNextCheckPage = nextCheckCursor !== null;
    threadCursor = nextThreadCursor;
    reviewCursor = nextReviewCursor;
    checkCursor = nextCheckCursor;
  }

  return { reviewThreadPages, reviewPages, checkPages };
}

export async function runPrReviewObservation({
  input,
  argv = process.argv.slice(2),
  env = process.env,
  runCommand = runGhCommand,
  previousObservations = [],
  requiredChecks = []
} = {}) {
  let binding;
  try {
    binding = await readInput({ input, argv });
  } catch (cause) {
    return resultForError('invalid_binding_input', cause instanceof Error ? cause.message : String(cause));
  }

  if (!binding || typeof binding !== 'object' || Array.isArray(binding) || Object.keys(binding).length === 0) {
    return resultForError('missing_binding', 'A complete PR binding is required.', 'binding');
  }
  const bindingErrors = validatePrBinding(binding);
  if (bindingErrors.length > 0) return resultForError('invalid_binding', 'The PR binding is incomplete or not read-only.', 'binding');

  const { owner, name } = repositoryParts(binding.repository);
  try {
    const authResult = await runCommand('gh', ['auth', 'status', '--hostname', 'github.com']);
    if (commandExit(authResult) !== 0) {
      return resultForError('credentials_missing', 'A GitHub credential is required for read-only observation.', 'credentials');
    }
    const prResult = await runCommand('gh', [
      'pr',
      'view',
      String(binding.number),
      '--repo',
      binding.repository,
      '--json',
      PR_JSON_FIELDS
    ]);
    const pullRequest = parseCommandJson(prResult, 'gh pr view');
    const graphQlSnapshot = await collectGraphQlSnapshot({ binding, owner, name, runCommand });
    const normalized = normalizePrReviewSnapshot({ pullRequest, ...graphQlSnapshot });
    const effectiveRequiredChecks = requiredChecks.length > 0
      ? requiredChecks
      : (Array.isArray(binding.requiredChecks) ? binding.requiredChecks : []);
    return reducePrReviewFeedback({
      binding,
      pullRequest: normalized.pullRequest,
      reviewThreads: normalized.reviewThreads,
      reviews: normalized.reviews,
      checks: normalized.checks,
      requiredChecks: effectiveRequiredChecks,
      previousObservations
    });
  } catch (cause) {
    return resultForError('github_read_failed', cause instanceof Error ? cause.message : String(cause), 'observation');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runPrReviewObservation();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status === 'rejected') process.exitCode = 1;
}
