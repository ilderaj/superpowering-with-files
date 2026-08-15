import { describe, expect, it } from 'vitest';

import { apply, inject, name } from '../src/index.js';
import { makeMockCtx } from './helpers.js';

describe('swf-dsh plugin entry (Slice 1)', () => {
  it('declares the plugin name', () => {
    expect(name).toBe('swf-dsh');
  });

  it('declares the host-side inject surface and omits the client/UI conversationEvents service', () => {
    expect(inject).toEqual(['sessions', 'commands', 'skills', 'tokenMeter', 'approval']);
    expect(inject).not.toContain('conversationEvents');
  });

  it('apply() registers the /swf command and the session lifecycle listeners', () => {
    const harness = makeMockCtx();
    apply(harness.ctx);
    expect(harness.commands.has('swf')).toBe(true);
    expect(harness.listeners.has('session/created')).toBe(true);
    expect(harness.listeners.has('session/disposed')).toBe(true);
  });

  it('apply() does not attach any conversationEvents interception', () => {
    const harness = makeMockCtx();
    apply(harness.ctx);
    expect(harness.listeners.has('conversationEvents')).toBe(false);
  });

  it('apply() is idempotent-safe when called once per host (no throw on minimal mock)', () => {
    const harness = makeMockCtx();
    expect(() => apply(harness.ctx)).not.toThrow();
  });
});
