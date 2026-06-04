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

async function directoriesIn(dirPath) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
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

function matchesLiteralOrLink(value, targetPath) {
  const normalizedTarget = normalizeForMatch(targetPath);
  const normalizedValue = normalizeForMatch(value).trim();
  const markdownLinkMatch = normalizedValue.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

  return (
    normalizedValue === normalizedTarget ||
    normalizedValue === `\`${normalizedTarget}\`` ||
    normalizedValue === `\`/${normalizedTarget}\`` ||
    (markdownLinkMatch !== null &&
      (markdownLinkMatch[1] === normalizedTarget ||
        normalizeForMatch(markdownLinkMatch[2]).includes(normalizedTarget)))
  );
}

function extractLabeledReferenceValue(line, labels) {
  const normalizedLine = normalizeForMatch(line).trim().replace(/(\*\*|__)/g, '');
  const labelsPattern = labels.map((label) => escapeRegExp(label)).join('|');
  const match = normalizedLine.match(new RegExp(`^(?:[-*]\\s+)?(?:${labelsPattern})\\s*:\\s*(.+)$`, 'i'));
  return match ? match[1].trim() : null;
}

async function collectPlanningReferences(rootDir, planningSubdir) {
  const planningDir = path.join(rootDir, planningSubdir);
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

async function collectActivePlanningReferences(rootDir) {
  return collectPlanningReferences(rootDir, 'planning/active');
}

async function collectArchivedPlanningReferences(rootDir) {
  return collectPlanningReferences(rootDir, 'planning/archive');
}

function referencesForCompanionPlan(referenceTexts, companionRelativePath, options = {}) {
  const normalizedPath = normalizeForMatch(companionRelativePath);
  const matches = [];
  const archiveMode = options.archive === true;

  for (const [planningPath, text] of referenceTexts.entries()) {
    const normalizedLines = normalizeForMatch(text)
      .split('\n')
      .map((line) => line.trim());

    if (
      normalizedLines.some((line) => {
        if (matchesLiteralOrLink(line, normalizedPath)) return true;

        const labeledReference = extractLabeledReferenceValue(line, [
          'Companion plan',
          'Companion plan path',
          'Companion path',
          'Plan path',
          'Path',
          ...(archiveMode ? ['companion plan 路径', '计划路径', '路径', 'Implementation plan'] : [])
        ]);

        if (labeledReference ? matchesLiteralOrLink(labeledReference, normalizedPath) : false) {
          return true;
        }

        if (!archiveMode) {
          return false;
        }

        const backtickedPath = line.match(/`([^`]+)`/)?.[1];
        if (!backtickedPath || !matchesLiteralOrLink(backtickedPath, normalizedPath)) {
          return false;
        }

        return /\b(companion|implementation plan|plan)\b|路径|计划|added\b|saved\b|created\b/i.test(line);
      })
    ) {
      matches.push(planningPath);
    }
  }

  return matches.sort();
}

function companionPlanBackReferences(companionText, referencedBy) {
  const normalizedLines = normalizeForMatch(companionText)
    .split('\n')
    .map((line) => line.trim());

  const expectedPaths = new Set();
  for (const planningPath of referencedBy) {
    const normalizedPlanningPath = normalizeForMatch(planningPath);
    expectedPaths.add(normalizedPlanningPath);
    expectedPaths.add(`${path.posix.dirname(normalizedPlanningPath)}/`);
  }

  const matches = [];
  for (const expectedPath of expectedPaths) {
    if (
      normalizedLines.some((line) => {
        if (matchesLiteralOrLink(line, expectedPath)) return true;

        const labeledReference = extractLabeledReferenceValue(line, [
          'Active task',
          'Active task path',
          'Planning path',
          'Task path'
        ]);

        return labeledReference ? matchesLiteralOrLink(labeledReference, expectedPath) : false;
      })
    ) {
      matches.push(expectedPath);
    }
  }

  return matches.sort();
}

function companionActiveTaskPath(companionText) {
  const normalizedLines = normalizeForMatch(companionText)
    .split('\n')
    .map((line) => line.trim());

  for (const line of normalizedLines) {
    const labeledReference = extractLabeledReferenceValue(line, [
      'Active task',
      'Active task path',
      'Planning path',
      'Task path'
    ]);
    if (labeledReference) {
      return normalizeForMatch(labeledReference).replace(/^`|`$/g, '');
    }
  }

  return '';
}

function taskIdFromActiveTaskPath(activeTaskPath) {
  const match = normalizeForMatch(activeTaskPath).match(/^planning\/active\/([^/]+)\/?$/);
  return match?.[1] ?? '';
}

function candidateTaskIdsFromCompanionPath(companionRelativePath) {
  const fileName = path.posix.basename(normalizeForMatch(companionRelativePath), '.md');
  const withoutDatePrefix = fileName.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  const candidates = new Set([withoutDatePrefix]);

  for (const candidate of [...candidates]) {
    if (candidate.endsWith('-implementation-plan')) {
      candidates.add(candidate.slice(0, -'-implementation-plan'.length));
    }
    if (candidate.endsWith('-plan')) {
      candidates.add(candidate.slice(0, -'-plan'.length));
    }
  }

  return [...candidates].filter(Boolean);
}

async function archivedTaskMatches(rootDir, taskId) {
  if (!taskId) {
    return [];
  }

  const archiveDirs = await directoriesIn(path.join(rootDir, 'planning/archive'));
  return archiveDirs
    .map((dirPath) => relative(rootDir, dirPath))
    .filter((archivePath) => archivePath.endsWith(`-${taskId}`))
    .sort();
}

export async function inspectPlanLocations(rootDir) {
  const results = [];
  const { references: planningReferences, unreadable: unreadablePlanningFiles } =
    await collectActivePlanningReferences(rootDir);
  const { references: archivedPlanningReferences } = await collectArchivedPlanningReferences(rootDir);

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
    let companionText = '';
    try {
      companionText = await readFile(filePath, 'utf8');
    } catch (error) {
      results.push({
        type: 'companion-plan-read-error',
        path: relativePath,
        severity: 'problem',
        message: `Companion plan exists but could not be read: ${error.message}`
      });
      continue;
    }

    const referencedBy = referencesForCompanionPlan(planningReferences, relativePath);
    if (referencedBy.length > 0) {
      const pointsBackTo = companionPlanBackReferences(companionText, referencedBy);
      if (pointsBackTo.length === 0) {
        results.push({
          type: 'companion-plan-missing-back-reference',
          path: relativePath,
          severity: 'warning',
          message:
            'Companion plan is referenced by active task planning files but does not point back to planning/active/<task-id>/. Add the active task path so summary/detail navigation stays bidirectional.',
          referencedBy
        });
        continue;
      }

      results.push({
        type: 'companion-plan',
        path: relativePath,
        severity: 'ok',
        message: `Referenced companion plan recorded by active task planning files.`,
        referencedBy,
        pointsBackTo
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

    const activeTaskPath = companionActiveTaskPath(companionText);
    const archivedReferencedBy = referencesForCompanionPlan(archivedPlanningReferences, relativePath, {
      archive: true
    });
    if (archivedReferencedBy.length > 0) {
      results.push({
        type: 'archived-companion-plan',
        path: relativePath,
        severity: 'ok',
        message: 'Companion plan is referenced by archived task planning files.',
        referencedBy: archivedReferencedBy
      });
      continue;
    }

    const explicitTaskId = taskIdFromActiveTaskPath(activeTaskPath);
    const candidateTaskIds = explicitTaskId
      ? [explicitTaskId]
      : candidateTaskIdsFromCompanionPath(relativePath);
    const archivedMatches = [
      ...new Set(
        (
          await Promise.all(candidateTaskIds.map((taskId) => archivedTaskMatches(rootDir, taskId)))
        ).flat()
      )
    ].sort();
    if (archivedMatches.length > 0) {
      results.push({
        type: 'orphan-companion-plan-archived-task',
        path: relativePath,
        severity: 'warning',
        message:
          `Companion plan is not referenced by any active task planning file and appears to belong to archived task ${archivedMatches[0]}. Move it into that archive directory as companion_plan.md or remove it.`,
        archivedMatches,
        activeTaskPath
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
