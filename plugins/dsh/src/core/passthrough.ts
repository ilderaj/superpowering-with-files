// Non-SWF session passthrough detection (feasibility report decision 12 and
// engineering assumption 8).
//
// A dsh session is SWF-managed when the planning trio (task_plan.md,
// findings.md, progress.md under planning/active/<task>/) is present, or when
// an explicit .swf-task marker is present. Anything else is a non-SWF session
// and the plugin passes through transparently without intercepting.

import { SESSION_MODES, TRIO_FILE_NAMES } from './constants.js';

export type SessionMode = 'swf' | 'passthrough';

export interface SessionIndicators {
  hasPlanningTrio?: unknown;
  hasSwfTaskMarker?: unknown;
  planningTrioFiles?: unknown;
}

export interface SessionDecision {
  mode: SessionMode;
  reason: string;
  indicators: {
    hasPlanningTrio: boolean;
    hasSwfTaskMarker: boolean;
  };
}

export function hasPlanningTrio(files: unknown): boolean {
  if (!Array.isArray(files)) return false;
  const names = new Set(files.map((name) => String(name)));
  return TRIO_FILE_NAMES.every((fileName) => names.has(fileName));
}

export function detectSessionMode(input: SessionIndicators = {}): SessionMode {
  const hasPlanningTrioValue = input.hasPlanningTrio !== undefined
    ? input.hasPlanningTrio === true
    : hasPlanningTrio(input.planningTrioFiles);
  const hasMarker = input.hasSwfTaskMarker === true;
  return hasPlanningTrioValue || hasMarker ? 'swf' : 'passthrough';
}

export function classifySession(input: SessionIndicators = {}): SessionDecision {
  const hasPlanningTrioValue = input.hasPlanningTrio !== undefined
    ? input.hasPlanningTrio === true
    : hasPlanningTrio(input.planningTrioFiles);
  const hasMarker = input.hasSwfTaskMarker === true;
  const mode: SessionMode = hasPlanningTrioValue || hasMarker ? 'swf' : 'passthrough';
  const reason = hasPlanningTrioValue
    ? 'planning trio present under planning/active'
    : hasMarker
      ? '.swf-task marker present'
      : 'no planning trio and no .swf-task marker: transparent passthrough';
  return {
    mode,
    reason,
    indicators: {
      hasPlanningTrio: hasPlanningTrioValue,
      hasSwfTaskMarker: hasMarker
    }
  };
}

export function assertSessionMode(value: unknown): asserts value is SessionMode {
  if (typeof value !== 'string' || !SESSION_MODES.includes(value)) {
    throw new Error(`Unknown session mode: ${String(value)}`);
  }
}
