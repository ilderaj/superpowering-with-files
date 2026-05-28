import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';

export const RUNTIME_HOOK_EVIDENCE_SCHEMA_VERSION = 1;
const RUNTIME_HOOK_EVIDENCE_SOURCE = 'harness-runtime-hook';

export function runtimeEvidenceLogPath(rootDir, target = 'claude-code') {
  return path.join(rootDir, '.harness/runtime-hooks', `${target}.jsonl`);
}

function normalizeRoot(rootDir) {
  const resolvedRoot = path.resolve(rootDir);

  try {
    return realpathSync(resolvedRoot);
  } catch {
    return resolvedRoot;
  }
}

function normalizeExistingPath(filePath) {
  const resolvedPath = path.resolve(filePath);

  try {
    return realpathSync(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

function parseRecord(line, rootDir, target, lineNumber) {
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return {
      record: null,
      warning: `Invalid runtime hook evidence at ${runtimeEvidenceLogPath(rootDir, target)}:${lineNumber}: invalid runtime hook evidence JSON.`
    };
  }

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return {
      record: null,
      warning: `Invalid runtime hook evidence at ${runtimeEvidenceLogPath(rootDir, target)}:${lineNumber}: invalid runtime hook evidence shape.`
    };
  }

  const normalizedRoot = normalizeRoot(rootDir);
  const observedAt = typeof record.observedAt === 'string' ? new Date(record.observedAt) : null;
  const projectRoot = typeof record.projectRoot === 'string' ? normalizeExistingPath(record.projectRoot) : null;

  if (
    record.schemaVersion !== RUNTIME_HOOK_EVIDENCE_SCHEMA_VERSION ||
    record.source !== RUNTIME_HOOK_EVIDENCE_SOURCE ||
    record.target !== target ||
    typeof record.parentSkillName !== 'string' ||
    typeof record.eventName !== 'string' ||
    !record.parentSkillName ||
    !record.eventName ||
    !record.projectRoot ||
    !record.cwd ||
    !record.scriptName ||
    !record.scriptPath ||
    Number.isNaN(observedAt?.getTime?.()) ||
    projectRoot !== normalizedRoot
  ) {
    return {
      record: null,
      warning: `Invalid runtime hook evidence at ${runtimeEvidenceLogPath(rootDir, target)}:${lineNumber}: invalid runtime hook evidence metadata.`
    };
  }

  return {
    record: {
      schemaVersion: record.schemaVersion,
      source: record.source,
      target: record.target,
      parentSkillName: record.parentSkillName,
      eventName: record.eventName,
      observedAt: observedAt.toISOString(),
      projectRoot,
      cwd: path.resolve(record.cwd),
      scriptName: record.scriptName,
      scriptPath: path.resolve(record.scriptPath)
    },
    warning: null
  };
}

export async function readRuntimeHookEvidence(rootDir, target = 'claude-code') {
  const logPath = runtimeEvidenceLogPath(rootDir, target);
  let content;

  try {
    content = await readFile(logPath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { records: [], warnings: [] };
    }
    throw error;
  }

  const records = [];
  const warnings = [];
  const lines = content.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const parsed = parseRecord(trimmed, rootDir, target, index + 1);
    if (parsed.warning) {
      warnings.push(parsed.warning);
      continue;
    }

    records.push(parsed.record);
  }

  return { records, warnings };
}

function observedEventsForProjection(projection, records) {
  const events = new Set();
  for (const record of records) {
    if (record.parentSkillName !== projection.parentSkillName) {
      continue;
    }
    if (Array.isArray(projection.eventNames) && !projection.eventNames.includes(record.eventName)) {
      continue;
    }
    events.add(record.eventName);
  }
  return [...events].sort();
}

export function summarizeRuntimeEvidenceForProjection(projection, evidence, rootDir) {
  const records = evidence?.records ?? [];
  const matchedRecords = records.filter((record) => {
    if (!record || typeof record !== 'object') {
      return false;
    }

    if (record.target !== projection.target) {
      return false;
    }

    if (record.parentSkillName !== projection.parentSkillName) {
      return false;
    }

    if (normalizeExistingPath(record.projectRoot ?? '') !== normalizeRoot(rootDir)) {
      return false;
    }

    if (Array.isArray(projection.eventNames) && !projection.eventNames.includes(record.eventName)) {
      return false;
    }

    return true;
  });

  if (matchedRecords.length === 0) {
    return {
      runtimeEvidence: 'not-measured',
      runtimeInvocationVerified: false,
      lastObservedAt: null,
      observedEvents: []
    };
  }

  const observedEvents = observedEventsForProjection(projection, matchedRecords);
  const lastObservedAt = matchedRecords.reduce((latest, record) => {
    if (!latest) return record.observedAt;
    return record.observedAt > latest ? record.observedAt : latest;
  }, null);

  return {
    runtimeEvidence: observedEvents.length > 0 ? 'runtime-invocation-verified' : 'runtime-invocation-unverified',
    runtimeInvocationVerified: observedEvents.length > 0,
    lastObservedAt,
    observedEvents
  };
}

export function runtimeInvocationVerifiedFromHookEvidence(summary) {
  return Boolean(summary?.runtimeInvocationVerified);
}

export async function writeRuntimeHookEvidence(rootDir, target, record) {
  const logPath = runtimeEvidenceLogPath(rootDir, target);
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, `${JSON.stringify(record)}\n`, { flag: 'a' });
}
