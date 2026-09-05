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

export const REVIEW_SNAPSHOT_QUERY = `query($owner:String!,$name:String!,$number:Int!,$reviewCursor:String,$threadCursor:String,$checkCursor:String,$includeThreads:Boolean!,$includeReviews:Boolean!,$includeChecks:Boolean!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$threadCursor) @include(if:$includeThreads){nodes{id isResolved isOutdated path line} pageInfo{hasNextPage endCursor}} reviews(first:100,after:$reviewCursor) @include(if:$includeReviews){nodes{id state submittedAt commit{oid} author{login __typename}} pageInfo{hasNextPage endCursor}} commits(last:1) @include(if:$includeChecks){nodes{commit{oid statusCheckRollup{contexts(first:100,after:$checkCursor){nodes{__typename ... on CheckRun{name status conclusion completedAt detailsUrl} ... on StatusContext{context state createdAt targetUrl}} pageInfo{hasNextPage endCursor}}}}}}}}}`;
export const REVIEW_THREAD_COMMENTS_QUERY = `query($threadId:ID!,$commentCursor:String){node(id:$threadId){... on PullRequestReviewThread{comments(first:100,after:$commentCursor){nodes{databaseId body updatedAt createdAt path line author{login}} pageInfo{hasNextPage endCursor}}}}}`;

function resultForError(code, reason, field = 'input') {
  return {
    schema: 'swf/pr-review-feedback-result',
    version: 1,
    status: 'rejected',
    readOnly: true,
    errors: [{ code, reason, field }],
    observations: [],
    actions: [],
    mergeExecuted: false,
    lifecycle: {
      decision: 'stop',
      reason: ['credentials_missing', 'github_read_failed'].includes(code)
        ? 'rejected_observation'
        : 'rejected_binding'
    }
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

function graphQlCommentConnection(payload) {
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error('gh api graphql returned GraphQL errors');
  }
  const comments = payload?.data?.node?.comments;
  if (!comments || typeof comments !== 'object') {
    throw new Error('gh api graphql returned no review-thread comments');
  }
  return comments;
}

function graphQlArgs(binding, owner, name, reviewCursor, threadCursor, checkCursor, includeReviews, includeThreads, includeChecks) {
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
  args.push('-F', `includeReviews=${includeReviews}`);
  args.push('-F', `includeThreads=${includeThreads}`);
  args.push('-F', `includeChecks=${includeChecks}`);
  if (reviewCursor) args.push('-f', `reviewCursor=${reviewCursor}`);
  if (threadCursor) args.push('-f', `threadCursor=${threadCursor}`);
  if (checkCursor) args.push('-f', `checkCursor=${checkCursor}`);
  return args;
}

function graphQlCommentArgs(threadId, commentCursor) {
  const args = ['api', 'graphql', '-f', `query=${REVIEW_THREAD_COMMENTS_QUERY}`, '-f', `threadId=${threadId}`];
  if (commentCursor) args.push('-f', `commentCursor=${commentCursor}`);
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

function connectionNodes(connection) {
  return Array.isArray(connection?.nodes) ? connection.nodes : [];
}

async function collectThreadComments({ threadId, runCommand }) {
  const pages = [];
  let commentCursor = null;
  let hasNextCommentPage = true;
  while (hasNextCommentPage) {
    const result = await runCommand('gh', graphQlCommentArgs(threadId, commentCursor));
    const connection = graphQlCommentConnection(parseCommandJson(result, 'gh api graphql'));
    pages.push(connection);
    const nextCommentCursor = nextCursor(connection, commentCursor, 'Review-thread comment');
    hasNextCommentPage = nextCommentCursor !== null;
    commentCursor = nextCommentCursor;
  }
  return pages.flatMap(connectionNodes);
}

async function attachThreadComments(reviewThreadPages, { runCommand }) {
  const commentsByThread = new Map();
  for (const page of reviewThreadPages) {
    for (const thread of connectionNodes(page)) {
      const threadId = thread?.id ?? thread?.databaseId;
      if (threadId === undefined || threadId === null) continue;
      const key = String(threadId);
      let comments = commentsByThread.get(key);
      if (comments === undefined) {
        const existingComments = thread.comments;
        if (existingComments && pageInfo(existingComments).hasNextPage !== true) {
          comments = connectionNodes(existingComments);
        } else {
          comments = await collectThreadComments({ threadId: key, runCommand });
        }
        commentsByThread.set(key, comments);
      }
      thread.comments = { nodes: comments };
    }
  }
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
    const result = await runCommand('gh', graphQlArgs(
      binding,
      owner,
      name,
      reviewCursor,
      threadCursor,
      checkCursor,
      hasNextReviewPage,
      hasNextThreadPage,
      hasNextCheckPage
    ));
    const pullRequest = graphQlPullRequest(parseCommandJson(result, 'gh api graphql'));
    const threadConnection = hasNextThreadPage
      ? (pullRequest.reviewThreads ?? { nodes: [], pageInfo: { hasNextPage: false } })
      : { nodes: [], pageInfo: { hasNextPage: false } };
    const reviewConnection = hasNextReviewPage
      ? (pullRequest.reviews ?? { nodes: [], pageInfo: { hasNextPage: false } })
      : { nodes: [], pageInfo: { hasNextPage: false } };
    const checkConnection = hasNextCheckPage
      ? graphQlCheckConnection(pullRequest)
      : { nodes: [], pageInfo: { hasNextPage: false } };
    reviewThreadPages.push(threadConnection);
    reviewPages.push(reviewConnection);
    checkPages.push({
      nodes: hasNextCheckPage ? graphQlChecks(pullRequest) : [],
      pageInfo: pageInfo(checkConnection)
    });

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

  await attachThreadComments(reviewThreadPages, { runCommand });
  return { reviewThreadPages, reviewPages, checkPages };
}

export async function runPrReviewObservation({
  input,
  argv = process.argv.slice(2),
  env = process.env,
  runCommand = runGhCommand,
  previousObservations = [],
  previousSnapshot,
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
      previousObservations,
      previousSnapshot
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
