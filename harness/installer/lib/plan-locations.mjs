import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const CANONICAL_PLANNING_FILES = ['task_plan.md', 'findings.md', 'progress.md'];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function markdownFilesIn(dirPath) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => path.join(dirPath, entry.name))
      .sort();
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

function relative(rootDir, targetPath) {
  return path.relative(rootDir, targetPath) || path.basename(targetPath);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeForMatch(filePath) {
  return filePath.split(path.sep).join('/');
}

async function collectActivePlanningReferences(rootDir) {
  const planningDir = path.join(rootDir, 'planning/active');
  const references = new Map();
  const unreadable = [];

  let taskEntries;
  try {
    taskEntries = await readdir(planningDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { references, unreadable };
    }
    throw error;
  }

  for (const taskEntry of taskEntries) {
    if (!taskEntry.isDirectory()) continue;

    const taskDir = path.join(planningDir, taskEntry.name);
    for (const fileName of CANONICAL_PLANNING_FILES) {
      const planningFile = path.join(taskDir, fileName);
      if (!(await exists(planningFile))) continue;

      try {
        const text = await readFile(planningFile, 'utf8');
        references.set(relative(rootDir, planningFile), text);
      } catch (error) {
        unreadable.push({
          path: relative(rootDir, planningFile),
          error
        });
      }
    }
  }

  return { references, unreadable };
}

function referencesForCompanionPlan(referenceTexts, companionRelativePath) {
  const normalizedPath = normalizeForMatch(companionRelativePath);
  const exactPathPattern = new RegExp(`^${escapeRegExp(normalizedPath)}$`);
  const backtickPattern = new RegExp(`\`${escapeRegExp(normalizedPath)}\``);
  const absoluteBacktickPattern = new RegExp(`\`${escapeRegExp(`/${normalizedPath}`)}\``);
  const labeledPathPattern = new RegExp(
    `\\b(?:companion plan|plan path|companion path|path)\\s*:\\s*${escapeRegExp(normalizedPath)}\\b`,
    'i'
  );
  const matches = [];

  for (const [planningPath, text] of referenceTexts.entries()) {
    const normalizedLines = normalizeForMatch(text)
      .split('\n')
      .map((line) => line.trim());

    if (
      normalizedLines.some(
        (line) =>
          exactPathPattern.test(line) ||
          backtickPattern.test(line) ||
          absoluteBacktickPattern.test(line) ||
          labeledPathPattern.test(line)
      )
    ) {
      matches.push(planningPath);
    }
  }

  return matches.sort();
}

export async function inspectPlanLocations(rootDir) {
  const results = [];
  const { references: planningReferences, unreadable: unreadablePlanningFiles } =
    await collectActivePlanningReferences(rootDir);

  for (const fileName of ['task_plan.md', 'findings.md', 'progress.md']) {
    const filePath = path.join(rootDir, fileName);
    if (await exists(filePath)) {
      results.push({
        type: 'root-planning-file',
        path: relative(rootDir, filePath),
        severity: 'warning',
        message: `${fileName} is outside planning/active/<task-id>/. Move durable task state into planning/active/<task-id>/.`
      });
    }
  }

  for (const unreadable of unreadablePlanningFiles) {
    results.push({
      type: 'planning-file-read-error',
      path: unreadable.path,
      severity: 'problem',
      message: `Canonical planning file exists but could not be read: ${unreadable.error.message}`
    });
  }

  const companionDir = path.join(rootDir, 'docs/superpowers/plans');
  for (const filePath of await markdownFilesIn(companionDir)) {
    const relativePath = relative(rootDir, filePath);
    const referencedBy = referencesForCompanionPlan(planningReferences, relativePath);
    if (referencedBy.length > 0) {
      results.push({
        type: 'companion-plan',
        path: relativePath,
        severity: 'ok',
        message: `Referenced companion plan recorded by active task planning files.`,
        referencedBy
      });
      continue;
    }

    if (unreadablePlanningFiles.length > 0) {
      results.push({
        type: 'companion-plan-reference-unknown',
        path: relativePath,
        severity: 'problem',
        message:
          'Companion plan reference status could not be determined because one or more canonical planning files are unreadable.'
      });
      continue;
    }

    results.push({
      type: 'orphan-companion-plan',
      path: relativePath,
      severity: 'warning',
      message:
        'Companion plan is not referenced by any active task planning file. Record its path, summary, and sync-back status under planning/active/<task-id>/ or archive/remove it.'
    });
  }

  const docsPlansDir = path.join(rootDir, 'docs/plans');
  const docsPlansFiles = await markdownFilesIn(docsPlansDir);
  if (docsPlansFiles.length > 0) {
    results.push({
      type: 'docs-plan-directory',
      path: 'docs/plans',
      severity: 'warning',
      message:
        'docs/plans contains plan files outside planning/active/<task-id>/. Treat these as human-facing or historical docs, not active agent task memory.'
    });
  }

  return results;
}
