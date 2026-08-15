// Slice 2 dispatch decision core (RED contract): provider routing, tier
// classification, budget decision, deep-tier confirmation, and the Trio gate
// registry classification. Pure functions; no ctx, no fs.

import { describe, expect, it } from 'vitest';

import {
  classifyGateCategories,
  decideBudget,
  deepTierGate,
  DEFAULT_DISPATCH_MODEL,
  DEFAULT_DISPATCH_PROVIDER,
  DEFAULT_WORKER_MAX_TOKENS,
  DISPATCH_PROVIDER_REGISTRY_NAMES,
  dispatchTierOf,
  MAX_PARALLEL_WORKERS,
  resolveDispatchProvider,
  TASK_TOKEN_BUDGET_DEFAULT,
  validateMaxTokens
} from '../src/core/dispatch.js';

describe('dispatch provider routing (Slice 2, plan item 1)', () => {
  it('defaults to dsh-sdk with model deepseek-v4-flash when the packet declares no provider', () => {
    const resolution = resolveDispatchProvider({});
    expect(resolution.provider).toBe(DEFAULT_DISPATCH_PROVIDER);
    expect(resolution.model).toBe(DEFAULT_DISPATCH_MODEL);
    expect(resolution.declared).toBe(false);
    expect(resolution.source).toBe('default');
  });

  it('keeps an explicit model on the default provider', () => {
    const resolution = resolveDispatchProvider({ capability: { model: 'deepseek-v3.2' } });
    expect(resolution.provider).toBe('dsh-sdk');
    expect(resolution.model).toBe('deepseek-v3.2');
  });

  it('accepts an explicitly declared codex provider with a model', () => {
    const resolution = resolveDispatchProvider({ capability: { provider: 'codex', model: 'gpt-5.6' } });
    expect(resolution.provider).toBe('codex');
    expect(resolution.model).toBe('gpt-5.6');
    expect(resolution.declared).toBe(true);
    expect(resolution.source).toBe('packet');
  });

  it('accepts an explicitly declared claude-code provider with a model', () => {
    const resolution = resolveDispatchProvider({ capability: { provider: 'claude-code', model: 'claude-sonnet-4' } });
    expect(resolution.provider).toBe('claude-code');
    expect(resolution.model).toBe('claude-sonnet-4');
  });

  it('rejects any other provider fail-closed', () => {
    expect(() => resolveDispatchProvider({ capability: { provider: 'gemini' } }))
      .toThrow('Unsupported dispatch provider: gemini');
  });

  it('requires an explicit model for the explicit-only providers', () => {
    expect(() => resolveDispatchProvider({ capability: { provider: 'codex' } }))
      .toThrow('Dispatch provider codex requires an explicit model.');
    expect(() => resolveDispatchProvider({ capability: { provider: 'claude-code' } }))
      .toThrow('requires an explicit model.');
  });

  it('maps packet providers to the verified dsh registry names', () => {
    expect(DISPATCH_PROVIDER_REGISTRY_NAMES['dsh-sdk']).toBe('subagent-dsh-sdk');
    expect(DISPATCH_PROVIDER_REGISTRY_NAMES.codex).toBe('subagent-codex');
    expect(DISPATCH_PROVIDER_REGISTRY_NAMES['claude-code']).toBe('subagent-claude-code');
  });
});

describe('dispatch tier classification (plan item 3)', () => {
  it('classifies max complexity as the deep tier', () => {
    expect(dispatchTierOf({ complexity: 'max' })).toBe('deep');
  });

  it('classifies high/xhigh complexity as the standard tier', () => {
    expect(dispatchTierOf({ complexity: 'high' })).toBe('standard');
    expect(dispatchTierOf({ complexity: 'xhigh' })).toBe('standard');
  });

  it('honors an explicit tier declaration', () => {
    expect(dispatchTierOf({ complexity: 'high', tier: 'deep' })).toBe('deep');
    expect(() => dispatchTierOf({ tier: 'ultra' })).toThrow('Unknown dispatch tier');
  });

  it('requires explicit confirmation for the deep tier only', () => {
    expect(deepTierGate('standard', false).allowed).toBe(true);
    expect(deepTierGate('deep', false).allowed).toBe(false);
    expect(deepTierGate('deep', false).reason).toBe('deep_tier_confirmation_required');
    expect(deepTierGate('deep', true).allowed).toBe(true);
  });
});

describe('budget decision (plan item 3)', () => {
  it('allows a dispatch within the task budget and parallel cap', () => {
    const decision = decideBudget({ spentTokens: 10_000, requestedTokens: 32_000, budget: TASK_TOKEN_BUDGET_DEFAULT, activeWorkers: 1 });
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBeNull();
  });

  it('fails closed with budget_exceeded over the cap', () => {
    const decision = decideBudget({ spentTokens: 90_000, requestedTokens: 32_000, budget: TASK_TOKEN_BUDGET_DEFAULT, activeWorkers: 0 });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('budget_exceeded');
  });

  it('fails closed with parallel_worker_cap_exceeded at the parallel cap', () => {
    const decision = decideBudget({ spentTokens: 0, requestedTokens: 32_000, budget: TASK_TOKEN_BUDGET_DEFAULT, activeWorkers: MAX_PARALLEL_WORKERS });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('parallel_worker_cap_exceeded');
  });

  it('validates maxTokens dispatch parameters', () => {
    expect(validateMaxTokens(undefined)).toBe(DEFAULT_WORKER_MAX_TOKENS);
    expect(validateMaxTokens(64_000)).toBe(64_000);
    expect(() => validateMaxTokens(0)).toThrow('maxTokens');
    expect(() => validateMaxTokens(-5)).toThrow('maxTokens');
    expect(() => validateMaxTokens(2.5)).toThrow('maxTokens');
    expect(() => validateMaxTokens('big')).toThrow('maxTokens');
  });
});

describe('Trio gate registry classification (plan item 4)', () => {
  it('classifies no gated categories by default', () => {
    expect(classifyGateCategories({})).toEqual([]);
  });

  it('classifies explicitly declared gate categories', () => {
    expect(classifyGateCategories({ capability: { gateCategories: ['security', 'send'] } })).toEqual(['security', 'send']);
  });

  it('rejects unknown gate categories fail-closed', () => {
    expect(() => classifyGateCategories({ capability: { gateCategories: ['frobnication'] } }))
      .toThrow('Unknown gate category');
  });

  it('derives gate categories from allowedOperations keyword scan', () => {
    const categories = classifyGateCategories({
      allowedOperations: { operations: ['merge', 'push', 'delete', 'send-email', 'credential', 'security-scan'] }
    });
    expect(categories).toContain('merge-push-release');
    expect(categories).toContain('destructive');
    expect(categories).toContain('send');
    expect(categories).toContain('credential');
    expect(categories).toContain('security');
  });

  it('returns a stable sorted union', () => {
    const categories = classifyGateCategories({ capability: { gateCategories: ['send', 'security'] } });
    expect(categories).toEqual(['security', 'send']);
  });
});
