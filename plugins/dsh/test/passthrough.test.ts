import { describe, expect, it } from 'vitest';

import { classifySession, detectSessionMode } from '../src/core/index.js';

describe('non-SWF session passthrough (feasibility report decision 12)', () => {
  it('passes through transparently when no SWF signal exists', () => {
    expect(detectSessionMode({})).toBe('passthrough');
    expect(detectSessionMode({ planningTrioFiles: [] })).toBe('passthrough');
  });

  it('detects an SWF session from the planning trio', () => {
    expect(detectSessionMode({ hasPlanningTrio: true })).toBe('swf');
    expect(detectSessionMode({
      planningTrioFiles: ['task_plan.md', 'findings.md', 'progress.md']
    })).toBe('swf');
  });

  it('detects an SWF session from the .swf-task marker', () => {
    expect(detectSessionMode({ hasSwfTaskMarker: true })).toBe('swf');
  });

  it('requires the full trio, not a partial set', () => {
    expect(detectSessionMode({ planningTrioFiles: ['task_plan.md', 'findings.md'] }))
      .toBe('passthrough');
  });

  it('classifySession returns a reason and indicator breakdown', () => {
    const decision = classifySession({ hasPlanningTrio: true });
    expect(decision.mode).toBe('swf');
    expect(decision.reason).toBe('planning trio present under planning/active');
    expect(decision.indicators).toEqual({ hasPlanningTrio: true, hasSwfTaskMarker: false });

    const passthrough = classifySession({});
    expect(passthrough.mode).toBe('passthrough');
    expect(passthrough.reason).toContain('transparent passthrough');
  });
});
