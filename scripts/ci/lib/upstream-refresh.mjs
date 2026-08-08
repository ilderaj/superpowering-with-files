import { execFile, spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const baseRef = 'origin/dev';
export const branchName = 'automation/upstream-refresh';
export const resultPath = '.harness/upstream-refresh-result.json';
export const refreshTaskId = 'github-actions-upstream-automation-analysis';
export const defaultExecutionMode = 'base-branch-refresh';
export const validationExecutionMode = 'workflow-ref-validation';

const conflictFailurePattern = /\b(CONFLICT|conflict|merge conflict|merge failed|unmerged|would be overwritten|needs merge)\b/i;

const runtimeOnlyFiles = new Set([
  '.harness/projections.json',
  '.harness/state.json',
  '.harness/workspace-skill-projections.json',
  resultPath
]);

const repoOwnedProjectionPathPrefixes = [
  '.agents/',
  '.codex/',
  'harness/upstream/'
];

const repoOwnedProjectionFiles = new Set([
  'docs/maintenance.md',
]);

const repoLocalEntryFiles = new Set([
  'AGENTS.md'
]);

const transientRuntimeArtifactPrefixes = [
  'node_modules/.cache/',
  '.wrangler/'
];

const focusedRefreshChecks = [
  'node --test tests/installer/upstream-commands.test.mjs'
];

function isIgnoredRuntimeArtifact(filePath) {
  return filePath === 'node_modules' || filePath.startsWith('node_modules/');
}

function isIgnoredGeneratedCacheFile(filePath) {
  return isIgnoredRuntimeArtifact(filePath)
    || filePath.includes('/__pycache__/')
    || filePath.endsWith('.pyc');
}

function touchesRefreshSensitiveSurface(filePath) {
  return filePath.includes('/skills/')
    || filePath.endsWith('AGENTS.md')
    || filePath.endsWith('docs/workflows.md')
    || filePath.endsWith('docs/maintenance.md')
    || filePath.endsWith('docs/upstream-update-compatibility.md');
}

function inferAffectedProjections(changedFiles = []) {
  const affected = new Set();

  for (const filePath of changedFiles) {
    if (filePath.startsWith('.codex/')) affected.add('codex');
    if (filePath.startsWith('.agents/')) affected.add('codex');
    if (
      filePath.startsWith('harness/installer/') ||
      filePath.startsWith('harness/core/policy/') ||
      filePath.startsWith('harness/core/upstream-overlays/') ||
      filePath.startsWith('docs/')
    ) {
      affected.add('repo-policy');
    }
  }

  return [...affected];
}

function inferRiskLevel(changedFiles = [], failureKind = '') {
  if (failureKind) {
    return 'high';
  }

  if (changedFiles.some((filePath) => touchesRefreshSensitiveSurface(filePath))) {
    return 'medium';
  }

  return 'low';
}

export function buildUpdateCompatibilityReport({
  changedFiles = [],
  affectedProjections = [],
  requiresResync = false,
  riskLevel = 'low',
  patchDriftWarnings = []
} = {}) {
  const normalizedChangedFiles = changedFiles.map((filePath) => normalizeChangePath(filePath));
  const normalizedAffectedProjections = [...new Set(affectedProjections)];
  const focusedChecks = normalizedChangedFiles.some((filePath) => touchesRefreshSensitiveSurface(filePath))
    ? focusedRefreshChecks
    : [];

  return {
    changedFiles: normalizedChangedFiles,
    affectedProjections: normalizedAffectedProjections,
    requiresResync,
    riskLevel,
    patchDriftWarnings,
    focusedChecks
  };
}

export function buildRefreshPrepareCommandChain({ validationMode = false } = {}) {
  const prepareCommands = [
    { file: 'git', args: ['fetch', 'origin', 'main', 'dev'] }
  ];

  if (!validationMode) {
    prepareCommands.push({ file: 'git', args: ['checkout', '-B', branchName, baseRef] });
  }

  return prepareCommands;
}

export function buildRefreshExecutionCommandChain({ sourceFilter } = {}) {
  const sourceArgs = sourceFilter ? [`--source=${sourceFilter}`] : [];

  return [
    { file: './scripts/harness', args: ['fetch', ...sourceArgs, '--no-state'] },
    { file: './scripts/harness', args: ['update', ...sourceArgs, '--no-state'] },
    { file: 'npm', args: ['run', 'verify:upstream-refresh'] },
    { file: './scripts/harness', args: ['worktree-preflight', '--task', refreshTaskId] }
  ];
}

export function buildRefreshCommandChain({ sourceFilter, validationMode = false } = {}) {
  return [
    ...buildRefreshPrepareCommandChain({ validationMode }),
    ...buildRefreshExecutionCommandChain({ sourceFilter })
  ];
}

function quoteCommandPart(value) {
  const part = String(value);
  if (part.length === 0) return "''";
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(part)) return part;
  return `'${part.replaceAll("'", "'\\''")}'`;
}

export function formatCommand(command) {
  return [command.file, ...(command.args ?? [])].map(quoteCommandPart).join(' ');
}

export function normalizeChangePath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function mergeChangeLists(...changeLists) {
  const byPath = new Map();

  for (const changeList of changeLists) {
    for (const change of changeList) {
      const normalizedPath = normalizeChangePath(typeof change === 'string' ? change : change.path);
      if (!normalizedPath || byPath.has(normalizedPath)) continue;

      byPath.set(normalizedPath, {
        path: normalizedPath,
        status: typeof change === 'string' ? undefined : change.status,
        tracked: typeof change === 'string' ? undefined : change.tracked
      });
    }
  }

  return [...byPath.values()];
}

export function filterEligibleChanges(changes) {
  const eligibleFiles = [];
  const excludedFiles = [];

  for (const change of mergeChangeLists(changes)) {
    const filePath = change.path;
    if (isIgnoredGeneratedCacheFile(filePath)) continue;
    if (repoLocalEntryFiles.has(filePath)) {
      excludedFiles.push(filePath);
      continue;
    }

    const isRuntimeOnly = runtimeOnlyFiles.has(filePath);
    const isRepoOwnedProjectionFile = repoOwnedProjectionFiles.has(filePath)
      || repoOwnedProjectionPathPrefixes.some((prefix) => filePath.startsWith(prefix));

    if (isRepoOwnedProjectionFile && !isRuntimeOnly) {
      eligibleFiles.push(filePath);
    } else {
      excludedFiles.push(filePath);
    }
  }

  return { eligibleFiles, excludedFiles };
}

export function listTransientRuntimeArtifacts(changes) {
  return mergeChangeLists(changes)
    .map((change) => change.path)
    .filter((filePath) =>
      transientRuntimeArtifactPrefixes.some((prefix) => filePath.startsWith(prefix))
    );
}

export function listRepoLocalEntryFileChanges(changes) {
  return mergeChangeLists(changes)
    .filter((change) => repoLocalEntryFiles.has(change.path));
}

export function parseNameOnlyOutput(output, { tracked }) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((filePath) => ({
      path: filePath,
      tracked
    }));
}

export async function captureChangedFiles({ cwd = process.cwd() } = {}) {
  const [trackedChanges, untrackedChanges] = await Promise.all([
    execFileAsync('git', ['diff', '--name-only', '--relative', 'HEAD'], { cwd, maxBuffer: 1024 * 1024 }),
    execFileAsync('git', ['ls-files', '--others', '--exclude-standard'], { cwd, maxBuffer: 1024 * 1024 })
  ]);

  return mergeChangeLists(
    parseNameOnlyOutput(trackedChanges.stdout, { tracked: true }),
    parseNameOnlyOutput(untrackedChanges.stdout, { tracked: false })
  );
}

export async function restoreRepoLocalEntryFiles(filePaths, {
  cwd = process.cwd()
} = {}) {
  const repoLocalEntryChanges = mergeChangeLists(filePaths ?? [])
    .filter((change) => repoLocalEntryFiles.has(change.path));

  if (repoLocalEntryChanges.length === 0) {
    return [];
  }

  const trackedPaths = repoLocalEntryChanges
    .filter((change) => change.tracked !== false)
    .map((change) => change.path);
  const untrackedPaths = repoLocalEntryChanges
    .filter((change) => change.tracked === false)
    .map((change) => path.resolve(cwd, change.path));

  if (trackedPaths.length > 0) {
    await execFileAsync('git', ['restore', '--source=HEAD', '--worktree', '--', ...trackedPaths], {
      cwd,
      maxBuffer: 1024 * 1024
    });
  }

  await Promise.all(untrackedPaths.map((targetPath) => rm(targetPath, { force: true })));

  return repoLocalEntryChanges.map((change) => change.path);
}

export async function cleanupRuntimeArtifacts(filePaths, {
  cwd = process.cwd()
} = {}) {
  const uniquePaths = [...new Set(filePaths)];

  await Promise.all(uniquePaths.map((filePath) =>
    rm(path.resolve(cwd, filePath), { force: true, recursive: true })
  ));

  return uniquePaths;
}

export function createRefreshResult({
  status,
  executionMode = defaultExecutionMode,
  sourceHeads = {},
  eligibleFiles = [],
  previousLock = { sources: {} },
  resolvedLock = { sources: {} },
  changedSources = [],
  strategySummary = {},
  lockPersistence = 'not_applicable',
  blockedReason = '',
  failureKind = '',
  compatibilityReport
} = {}) {
  const report = compatibilityReport ?? buildUpdateCompatibilityReport({
    changedFiles: eligibleFiles,
    affectedProjections: inferAffectedProjections(eligibleFiles),
    requiresResync: eligibleFiles.length > 0,
    riskLevel: inferRiskLevel(eligibleFiles, failureKind),
    patchDriftWarnings: []
  });

  return {
    status,
    executionMode,
    baseRef,
    branchName,
    sourceHeads,
    eligibleFiles,
    previousLock,
    resolvedLock,
    changedSources,
    strategySummary,
    lockPersistence,
    compatibilityReport: report,
    blockedReason,
    failureKind
  };
}

export class UpstreamRefreshBlockedError extends Error {
  constructor(result, { cause } = {}) {
    super(result.blockedReason, { cause });
    this.name = 'UpstreamRefreshBlockedError';
    this.result = result;
  }
}

export function formatBlockedReason(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (conflictFailurePattern.test(message)) {
    return `Git conflict blocked upstream refresh: ${message}`;
  }

  return message;
}

export function createFailureRefreshResult({
  error,
  executionMode = defaultExecutionMode,
  sourceHeads = {},
  eligibleFiles = [],
  previousLock = { sources: {} },
  resolvedLock = { sources: {} },
  changedSources = [],
  strategySummary = {}
} = {}) {
  return createRefreshResult({
    status: 'failure',
    executionMode,
    sourceHeads,
    eligibleFiles,
    previousLock,
    resolvedLock,
    changedSources,
    strategySummary,
    lockPersistence: 'not_written_due_to_failure',
    blockedReason: formatBlockedReason(error),
    failureKind: error?.failureKind ?? 'runtime_failure'
  });
}

export function createAllowlistViolationError(excludedFiles) {
  return new Error(`Allowlist violation: refresh produced files outside allowed paths: ${excludedFiles.join(', ')}`);
}

function collectOutput(chunks) {
  return Buffer.concat(chunks).toString('utf8');
}

function appendOutput(message, { stdout = '', stderr = '' } = {}) {
  const sections = [message];

  if (stdout) {
    sections.push(`stdout:\n${stdout.trimEnd()}`);
  }

  if (stderr) {
    sections.push(`stderr:\n${stderr.trimEnd()}`);
  }

  return sections.join('\n\n');
}

function createCommandFailureError({ readableCommand, code, signal, stdout, stderr }) {
  const status = code ?? signal;
  const error = new Error(appendOutput(`Command failed (${status}): ${readableCommand}`, { stdout, stderr }));
  error.command = readableCommand;
  error.exitCode = code;
  error.signal = signal;
  error.stdout = stdout;
  error.stderr = stderr;
  error.details = {
    command: readableCommand,
    exitCode: code,
    signal,
    stdout,
    stderr
  };

  return error;
}

export async function writeRefreshResult(result, {
  cwd = process.cwd(),
  outputPath = resultPath
} = {}) {
  const targetPath = path.resolve(cwd, outputPath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

export async function runCommand(command, {
  cwd = process.cwd(),
  env = process.env,
  spawnProcess = spawn,
  stdout: outputStream = process.stdout,
  stderr: errorStream = process.stderr
} = {}) {
  await new Promise((resolve, reject) => {
    const stdoutChunks = [];
    const stderrChunks = [];
    const readableCommand = formatCommand(command);
    const child = spawnProcess(command.file, command.args ?? [], {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout?.on('data', (chunk) => {
      stdoutChunks.push(Buffer.from(chunk));
      outputStream.write(chunk);
    });

    child.stderr?.on('data', (chunk) => {
      stderrChunks.push(Buffer.from(chunk));
      errorStream.write(chunk);
    });

    child.on('error', (error) => {
      error.command = readableCommand;
      reject(error);
    });
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(createCommandFailureError({
        readableCommand,
        code,
        signal,
        stdout: collectOutput(stdoutChunks),
        stderr: collectOutput(stderrChunks)
      }));
    });
  });
}

export async function runRefreshCommandChain({
  cwd = process.cwd(),
  sourceFilter,
  validationMode = false,
  beforeExecution,
  prepareCommands = buildRefreshPrepareCommandChain({ validationMode }),
  executionCommands = buildRefreshExecutionCommandChain({ sourceFilter }),
  run = runCommand
} = {}) {
  for (const command of prepareCommands) {
    await run(command, { cwd });
  }

  if (typeof beforeExecution === 'function') {
    await beforeExecution();
  }

  for (const command of executionCommands) {
    await run(command, { cwd });
  }
}
