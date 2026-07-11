import os from 'node:os';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { glob } from 'node:fs/promises';
import { createInterface } from 'node:readline';

function toNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function freshProxy(totalUsage = {}) {
  const input = toNumber(totalUsage.input_tokens);
  const cached = toNumber(totalUsage.cached_input_tokens);
  const output = toNumber(totalUsage.output_tokens);
  return input - cached + output;
}

function normalizeThreadSource(source) {
  return source && typeof source === 'object' && 'subagent' in source ? 'subagent' : 'main';
}

function basenameFromCwd(cwd) {
  if (!cwd || typeof cwd !== 'string') {
    return 'unknown';
  }

  const trimmed = cwd.replace(/[\\/]+$/, '');
  return path.basename(trimmed) || trimmed || 'unknown';
}

function formatDateBucket(epochMs) {
  const date = new Date(epochMs);
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function enumerateDateBuckets(start, end) {
  const buckets = [];
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() <= endDate.getTime()) {
    buckets.push(formatDateBucket(cursor.getTime()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return buckets;
}

function resolveSessionsRoot(input = {}) {
  if (input.sessionsRoot) {
    return path.isAbsolute(input.sessionsRoot)
      ? input.sessionsRoot
      : path.resolve(input.rootDir ?? process.cwd(), input.sessionsRoot);
  }

  return path.resolve(os.homedir(), '.codex', 'sessions');
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveWindowDate(value, label) {
  if (!value) {
    return null;
  }

  const parsed = parseDate(value);
  if (parsed === null) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return parsed;
}

function defaultDateWindow(now = new Date()) {
  const end = now.getTime();
  const start = end - 7 * 24 * 60 * 60 * 1000;
  return { start, end };
}

function collectTaskIds(rawLine, matches) {
  const pattern = /planning\/active\/([^\/"'`\s]+)\//g;

  let match;
  while ((match = pattern.exec(rawLine)) !== null) {
    const taskId = match[1];
    matches.set(taskId, (matches.get(taskId) ?? 0) + 1);
  }
}

function extractPrimaryTaskId(matches) {
  return [...matches.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? 'unattributed';
}

function normalizeTaskFamily(taskId) {
  if (!taskId || taskId === 'unattributed') {
    return 'unattributed';
  }

  return taskId.replace(/-\d{8}(?:-\d+)?$/, '');
}

function toTaskFamilyHint(taskFamily) {
  return taskFamily === 'unattributed' ? 'unattributed' : `${taskFamily} (heuristic)`;
}

function summarizeSession(filePath, summary) {
  const { meta, model, effort, modelTransitions, totalUsage, firstTimestamp, taskIdMatches } = summary;
  if (!meta || !totalUsage) {
    return null;
  }

  const timestamp = parseDate(meta.timestamp) ?? firstTimestamp;
  if (timestamp === null) {
    return null;
  }

  const taskId = extractPrimaryTaskId(taskIdMatches);

  const transitions = modelTransitions.filter((entry, index) =>
    index === 0
      || entry.model !== modelTransitions[index - 1].model
      || entry.effort !== modelTransitions[index - 1].effort
  );
  return {
    sessionId: String(meta.id ?? path.basename(filePath)),
    timestamp,
    filePath,
    cwd: typeof meta.cwd === 'string' ? meta.cwd : 'unknown',
    workspace: typeof meta.cwd === 'string' ? meta.cwd : 'unknown',
    workspaceLabel: basenameFromCwd(meta.cwd),
    threadSource: normalizeThreadSource(meta.source),
    model: typeof model === 'string' ? model : 'unknown',
    effort: typeof effort === 'string' ? effort : 'unknown',
    modelTransitions: transitions,
    modelState: transitions.length > 1 ? 'mixed' : 'single',
    taskId,
    taskFamily: normalizeTaskFamily(taskId),
    taskFamilyHint: toTaskFamilyHint(normalizeTaskFamily(taskId)),
    totalTokens: toNumber(totalUsage.total_tokens),
    inputTokens: toNumber(totalUsage.input_tokens),
    cachedInputTokens: toNumber(totalUsage.cached_input_tokens),
    outputTokens: toNumber(totalUsage.output_tokens),
    reasoningOutputTokens: toNumber(totalUsage.reasoning_output_tokens),
    freshProxy: freshProxy(totalUsage)
  };
}

async function parseRolloutFile(filePath) {
  const summary = {
    meta: null,
    model: 'unknown',
    effort: 'unknown',
    modelTransitions: [],
    totalUsage: null,
    firstTimestamp: null,
    taskIdMatches: new Map()
  };
  const lineReader = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  for await (const rawLine of lineReader) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    collectTaskIds(line, summary.taskIdMatches);

    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    if (summary.firstTimestamp === null) {
      summary.firstTimestamp = parseDate(record?.timestamp);
    }

    if (
      !summary.meta &&
      record.type === 'session_meta' &&
      record.payload &&
      typeof record.payload === 'object'
    ) {
      summary.meta = record.payload;
      continue;
    }

    if (record.type === 'turn_context' && record.payload && typeof record.payload === 'object') {
      summary.model = record.payload.model ?? summary.model;
      summary.effort = record.payload.effort ?? summary.effort;
      if (typeof record.payload.model === 'string' && typeof record.payload.effort === 'string') {
        summary.modelTransitions.push({
          model: record.payload.model,
          effort: record.payload.effort,
          observedAt: record.timestamp
        });
      }
      continue;
    }

    if (
      record.type === 'event_msg' &&
      record.payload &&
      typeof record.payload === 'object' &&
      record.payload.type === 'token_count'
    ) {
      summary.totalUsage = record.payload.info?.total_token_usage ?? summary.totalUsage;
    }
  }

  return summarizeSession(filePath, summary);
}

function createEmptyBucket() {
  return {
    sessions: 0,
    totalTokens: 0,
    cachedInputTokens: 0,
    freshProxy: 0
  };
}

function accumulate(bucket, session) {
  bucket.sessions += 1;
  bucket.totalTokens += session.totalTokens;
  bucket.cachedInputTokens += session.cachedInputTokens;
  bucket.freshProxy += session.freshProxy;
}

function sortLeaderboard(items, primaryKey = 'totalTokens', nameKey = 'taskId') {
  return items.sort(
    (left, right) =>
      right[primaryKey] - left[primaryKey] ||
      String(left[nameKey] ?? '').localeCompare(String(right[nameKey] ?? ''))
  );
}

function aggregateSessions(sessions) {
  const totals = {
    totalTokens: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    freshProxy: 0
  };

  const threadSource = {};
  const models = {};
  const workspaces = {};
  const tasks = {};

  for (const session of sessions) {
    totals.totalTokens += session.totalTokens;
    totals.inputTokens += session.inputTokens;
    totals.cachedInputTokens += session.cachedInputTokens;
    totals.outputTokens += session.outputTokens;
    totals.reasoningOutputTokens += session.reasoningOutputTokens;
    totals.freshProxy += session.freshProxy;

    threadSource[session.threadSource] ??= createEmptyBucket();
    const modelAggregationKey = session.modelState === 'mixed'
      ? 'mixed/unattributable'
      : session.model;
    models[modelAggregationKey] ??= createEmptyBucket();
    workspaces[session.workspace] ??= createEmptyBucket();
    tasks[session.taskFamilyHint] ??= createEmptyBucket();

    accumulate(threadSource[session.threadSource], session);
    accumulate(models[modelAggregationKey], session);
    accumulate(workspaces[session.workspace], session);
    accumulate(tasks[session.taskFamilyHint], session);
  }

  return {
    totals,
    breakdowns: {
      threadSource,
      models,
      workspaces,
      tasks
    },
    leaderboards: {
      sessions: sortLeaderboard(
        sessions.map((session) => ({
          sessionId: session.sessionId,
          workspace: session.workspace,
          workspaceLabel: session.workspaceLabel,
          taskId: session.taskId,
          taskFamily: session.taskFamily,
          taskFamilyHint: session.taskFamilyHint,
          threadSource: session.threadSource,
          model: session.model,
          effort: session.effort,
          modelState: session.modelState,
          modelTransitions: session.modelTransitions,
          totalTokens: session.totalTokens,
          freshProxy: session.freshProxy
        }))
      ),
      workspaces: sortLeaderboard(
        Object.entries(workspaces).map(([workspace, bucket]) => ({
          workspace,
          workspaceLabel: basenameFromCwd(workspace),
          ...bucket
        })),
        'totalTokens',
        'workspace'
      ),
      tasks: sortLeaderboard(
        Object.entries(tasks).map(([taskFamilyHint, bucket]) => ({ taskFamilyHint, ...bucket })),
        'totalTokens',
        'taskFamilyHint'
      ),
      models: sortLeaderboard(
        Object.entries(models).map(([model, bucket]) => ({ model, ...bucket })),
        'totalTokens',
        'model'
      )
    }
  };
}

function formatNumber(value) {
  return toNumber(value).toLocaleString('en-US');
}

function renderBucketLines(title, entries, labelKey) {
  if (entries.length === 0) {
    return [title, '- none'];
  }

  return [
    title,
    ...entries.map(
      (entry) =>
        `- ${entry[labelKey]}: sessions=${formatNumber(entry.sessions)}, total=${formatNumber(entry.totalTokens)}, fresh=${formatNumber(entry.freshProxy)}`
    )
  ];
}

function renderWorkspaceLines(entries) {
  if (entries.length === 0) {
    return ['Top workspaces:', '- none'];
  }

  return [
    'Top workspaces:',
    ...entries.map(
      (entry) =>
        `- ${entry.workspaceLabel} (${entry.workspace}): sessions=${formatNumber(entry.sessions)}, total=${formatNumber(entry.totalTokens)}, fresh=${formatNumber(entry.freshProxy)}`
    )
  ];
}

function renderSessionLines(entries) {
  if (entries.length === 0) {
    return ['Top sessions:', '- none'];
  }
  return [
    'Top sessions:',
    ...entries.map((entry) => {
      const transitions = entry.modelTransitions
        .map((transition) => transition.model + '/' + transition.effort)
        .join(' -> ');
      return '- ' + entry.sessionId
        + ': model_state=' + entry.modelState
        + ', transitions=' + (transitions || 'unknown')
        + ', total=' + formatNumber(entry.totalTokens);
    })
  ];
}

async function collectRolloutFiles({ sessionsRoot, start, end, allowRecursiveFallback }) {
  const files = [];
  const seen = new Set();
  const bucketPatterns = enumerateDateBuckets(start, end);

  for (const bucket of bucketPatterns) {
    for await (const entry of glob(`${bucket}/rollout-*.jsonl`, { cwd: sessionsRoot })) {
      const filePath = path.join(sessionsRoot, entry);
      if (seen.has(filePath)) {
        continue;
      }
      seen.add(filePath);
      files.push(filePath);
    }
  }

  if (files.length > 0 || !allowRecursiveFallback) {
    return files;
  }

  for await (const entry of glob('**/rollout-*.jsonl', { cwd: sessionsRoot })) {
    const filePath = path.join(sessionsRoot, entry);
    if (seen.has(filePath)) {
      continue;
    }
    seen.add(filePath);
    files.push(filePath);
  }

  return files;
}

export function renderTokenAuditMarkdown(report) {
  return [
    '# Weekly token audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Window: ${report.window.dateFrom} -> ${report.window.dateTo}`,
    `Sessions: ${formatNumber(report.sessionCount)}`,
    '',
    `Total tokens: ${formatNumber(report.totals.totalTokens)}`,
    `Cached input tokens: ${formatNumber(report.totals.cachedInputTokens)}`,
    `Fresh proxy: ${formatNumber(report.totals.freshProxy)}`,
    '',
    'Main vs subagent:',
    `- main: sessions=${formatNumber(report.breakdowns.threadSource.main?.sessions ?? 0)}, total=${formatNumber(report.breakdowns.threadSource.main?.totalTokens ?? 0)}, fresh=${formatNumber(report.breakdowns.threadSource.main?.freshProxy ?? 0)}`,
    `- subagent: sessions=${formatNumber(report.breakdowns.threadSource.subagent?.sessions ?? 0)}, total=${formatNumber(report.breakdowns.threadSource.subagent?.totalTokens ?? 0)}, fresh=${formatNumber(report.breakdowns.threadSource.subagent?.freshProxy ?? 0)}`,
    '',
    ...renderBucketLines('Model mix:', report.leaderboards.models.slice(0, 5), 'model'),
    '',
    ...renderSessionLines(report.leaderboards.sessions.slice(0, 5)),
    '',
    ...renderWorkspaceLines(report.leaderboards.workspaces.slice(0, 5)),
    '',
    ...renderBucketLines('Top task-family hints:', report.leaderboards.tasks.slice(0, 5), 'taskFamilyHint'),
    ''
  ].join('\n');
}

export async function runTokenAudit(input = {}) {
  const now = input.now instanceof Date ? input.now : new Date();
  const defaultWindow = defaultDateWindow(now);
  const start = resolveWindowDate(input.dateFrom, 'date-from') ?? defaultWindow.start;
  const end = resolveWindowDate(input.dateTo, 'date-to') ?? defaultWindow.end;
  if (start > end) {
    throw new Error('Invalid audit window: date-from must be earlier than or equal to date-to.');
  }
  const sessionsRoot = resolveSessionsRoot(input);
  const sessions = [];
  const rolloutFiles = await collectRolloutFiles({
    sessionsRoot,
    start,
    end,
    allowRecursiveFallback: Boolean(input.sessionsRoot)
  });

  for (const filePath of rolloutFiles) {
    const summary = await parseRolloutFile(filePath);
    if (!summary) {
      continue;
    }
    if (summary.timestamp < start || summary.timestamp > end) {
      continue;
    }
    sessions.push(summary);
  }

  sessions.sort((left, right) => right.totalTokens - left.totalTokens || left.sessionId.localeCompare(right.sessionId));
  const aggregated = aggregateSessions(sessions);

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    window: {
      dateFrom: new Date(start).toISOString(),
      dateTo: new Date(end).toISOString()
    },
    sessionsRoot,
    sessionCount: sessions.length,
    totals: aggregated.totals,
    breakdowns: aggregated.breakdowns,
    leaderboards: aggregated.leaderboards
  };
}
