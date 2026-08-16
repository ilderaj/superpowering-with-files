import { describe, expect, it } from 'vitest';

import { exactTrioFileNames, isTerminalStatus, parseTaskStatus } from '../src/core/index.js';

describe('store read decision helpers', () => {
  it('parses a single Status field from a task plan', () => {
    const plan = '# Task Plan\n\n## Current State\nStatus: active\n\n## Plan Record\nStatus: waiting_execution\n';
    // The harness STATUS_PATTERN matches every top-level Status: line; the
    // decision core returns null on ambiguity (multiple statuses).
    expect(parseTaskStatus('# Task\nStatus: active\n')).toBe('active');
    expect(parseTaskStatus(plan)).toBeNull();
    expect(parseTaskStatus('')).toBeNull();
  });

  it('recognizes terminal statuses', () => {
    expect(isTerminalStatus('done')).toBe(true);
    expect(isTerminalStatus('accepted')).toBe(true);
    expect(isTerminalStatus('active')).toBe(false);
    expect(isTerminalStatus('waiting_execution')).toBe(false);
  });

  it('requires exactly the three authority file names', () => {
    expect(exactTrioFileNames(['task_plan.md', 'findings.md', 'progress.md']).valid).toBe(true);
    const extra = exactTrioFileNames(['task_plan.md', 'findings.md', 'progress.md', 'swf-packet.json']);
    expect(extra.valid).toBe(false);
    expect(extra.extra).toEqual(['swf-packet.json']);
    const missing = exactTrioFileNames(['task_plan.md', 'findings.md']);
    expect(missing.valid).toBe(false);
    expect(missing.missing).toEqual(['progress.md']);
  });
});
