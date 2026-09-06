// Dispatch decision core (Slice 2, plan items 1/3/4).
//
// Pure decision functions over packet/capability/budget/gate inputs: provider
// routing (default dsh-sdk, explicit-only codex/claude-code), dispatch tier
// classification, budget cap decision, deep-tier confirmation, and the Trio
// gate registry classification. No dsh runtime, no fs, no ctx; the fs/ctx
// orchestration lives in src/dispatch.ts.

import { CHIEF_REQUESTED_MODELS, CHIEF_WORK_ROLES, COMPLEXITY_KINDS, FLASH_EXECUTION_MODEL } from './constants.js';
import { modelIdentity, recommendedEffortOf, validateModelEffort } from './routing.js';

export const DISPATCH_PROVIDERS = Object.freeze([
  'dsh-sdk',
  'openai',
  'codex',
  'claude-code'
]) as readonly string[];

// codex/claude-code are only ever used when the packet explicitly declares
// them (report decision 7); dsh-sdk is the default.
export const EXPLICIT_ONLY_PROVIDERS = Object.freeze([
  'codex',
  'claude-code'
]) as readonly string[];

export const DEFAULT_DISPATCH_PROVIDER = 'dsh-sdk';
export const DEFAULT_DISPATCH_MODEL = 'deepseek-v4-flash';
export const DEFAULT_WORKER_MAX_TOKENS = 32_000;
export const TASK_TOKEN_BUDGET_DEFAULT = 100_000;
export const MAX_PARALLEL_WORKERS = 2;

// Registry names verified on the real dsh host (feasibility report section 2:
// subagent-dsh-sdk / subagent-codex / subagent-claude-code). Seam note: exact
// registry names are deployment-shaped; dispatch fails closed at dispatch time
// when the requested registry provider is not resolvable.
export const DISPATCH_PROVIDER_REGISTRY_NAMES = Object.freeze({
  'dsh-sdk': 'subagent-dsh-sdk',
  openai: 'subagent-dsh-sdk',
  codex: 'subagent-codex',
  'claude-code': 'subagent-claude-code'
}) as Readonly<Record<string, string>>;

export type DispatchTier = 'standard' | 'deep';

export interface DispatchProviderResolution {
  provider: string;
  model: string;
  /** Exact packet selection, before translating Host prefixes for an API. */
  requestedModel?: string;
  effort?: string;
  declared: boolean;
  source: 'packet' | 'default';
}

function objectRecord(value: unknown): Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Resolve the worker provider/model from the bound assignment packet.
 * Defaults to dsh-sdk + deepseek-v4-flash; codex/claude-code are allowed only
 * when explicitly declared AND carry an explicit model; anything else throws
 * (fail closed, no dispatch).
 */
export function resolveDispatchProvider(packet: Record<string, unknown> | null | undefined): DispatchProviderResolution {
  const capability = objectRecord(packet?.capability);
  for (const key of ['provider', 'model', 'requestedModel', 'effort', 'requestedEffort']) {
    if (capability[key] !== undefined && normalizedString(capability[key]) === null) {
      throw new Error(`Explicit ${key} must be non-empty text.`);
    }
  }
  const declaredProvider = normalizedString(capability.provider);
  const requested = normalizedString(capability.requestedModel);
  const legacy = normalizedString(capability.model);
  if (requested && legacy && requested !== legacy) {
    throw new Error('Conflicting capability.requestedModel and capability.model; bind one explicit selection.');
  }
  const declaredModel = requested ?? legacy;
  const requestedEffort = normalizedString(capability.requestedEffort);
  const legacyEffort = normalizedString(capability.effort);
  if (requestedEffort && legacyEffort && requestedEffort !== legacyEffort) {
    throw new Error('Conflicting capability.requestedEffort and capability.effort.');
  }
  const effort = requestedEffort ?? legacyEffort;
  if (declaredProvider && !DISPATCH_PROVIDERS.includes(declaredProvider)) {
    throw new Error('Unsupported dispatch provider: ' + declaredProvider);
  }
  if (declaredProvider && EXPLICIT_ONLY_PROVIDERS.includes(declaredProvider) && !declaredModel) {
    throw new Error('Dispatch provider ' + declaredProvider + ' requires an explicit model.');
  }
  const identity = declaredModel ? modelIdentity(declaredModel) : null;
  const openai = identity !== null && CHIEF_REQUESTED_MODELS.includes(identity.apiModel);
  if (declaredProvider === 'openai' && !openai) {
    throw new Error('Dispatch provider openai requires an explicit supported OpenAI model.');
  }
  if (openai && declaredProvider === 'claude-code') {
    throw new Error('OpenAI model cannot be dispatched through claude-code.');
  }
  const provider = openai && (!declaredProvider || declaredProvider === 'dsh-sdk')
    ? 'openai' : declaredProvider ?? DEFAULT_DISPATCH_PROVIDER;
  const resolvedEffort = effort ?? (openai
    ? CHIEF_WORK_ROLES.includes(normalizedString(capability.workRole) ?? '') ? 'max' : recommendedEffortOf(declaredModel!)
    : requested ? normalizedString(capability.complexity) ?? 'high' : undefined);
  if (openai || requested || resolvedEffort) {
    const policyModel = declaredModel === DEFAULT_DISPATCH_MODEL || !declaredModel ? FLASH_EXECUTION_MODEL : declaredModel;
    validateModelEffort(policyModel, resolvedEffort ?? 'high', { isChild: true });
  }
  return {
    provider,
    // Codex accepts the Host identifier. OpenAI receives only its API model.
    model: openai && provider !== 'codex' ? identity!.apiModel
      : declaredModel === FLASH_EXECUTION_MODEL && provider === 'dsh-sdk' ? DEFAULT_DISPATCH_MODEL
        : declaredModel ?? DEFAULT_DISPATCH_MODEL,
    ...(declaredModel ? { requestedModel: declaredModel } : {}),
    ...(resolvedEffort ? { effort: resolvedEffort } : {}),
    declared: declaredProvider !== null || declaredModel !== null,
    source: declaredProvider !== null || declaredModel !== null ? 'packet' : 'default'
  };
}

/**
 * Dispatch tier: 'deep' when the packet's complexity is max (or an explicit
 * tier declaration says so); the deep tier requires explicit confirmation.
 */
export function dispatchTierOf(capability: unknown): DispatchTier {
  const source = objectRecord(capability);
  const tier = normalizedString(source.tier);
  if (tier !== null) {
    if (tier !== 'standard' && tier !== 'deep') {
      throw new Error('Unknown dispatch tier: ' + tier);
    }
    return tier;
  }
  const complexity = normalizedString(source.complexity);
  if (complexity !== null && !COMPLEXITY_KINDS.includes(complexity)) {
    throw new Error('Unknown complexity: ' + complexity);
  }
  return complexity === 'max' ? 'deep' : 'standard';
}

/** Deep tier needs an explicit human/Chief confirmation; standard never does. */
export function deepTierGate(tier: DispatchTier, deepConfirmed: unknown): { allowed: boolean; reason: string | null } {
  if (tier !== 'deep') return { allowed: true, reason: null };
  return deepConfirmed === true
    ? { allowed: true, reason: null }
    : { allowed: false, reason: 'deep_tier_confirmation_required' };
}

export interface BudgetInput {
  spentTokens: number;
  requestedTokens: number;
  budget: number;
  activeWorkers: number;
  maxParallelWorkers?: number;
}

export interface BudgetDecision {
  allowed: boolean;
  reason: string | null;
}

/** Budget cap decision: parallel worker cap first, then the token budget. */
export function decideBudget(input: BudgetInput): BudgetDecision {
  const maxParallel = input.maxParallelWorkers ?? MAX_PARALLEL_WORKERS;
  if (input.activeWorkers >= maxParallel) {
    return { allowed: false, reason: 'parallel_worker_cap_exceeded' };
  }
  if (input.spentTokens + input.requestedTokens > input.budget) {
    return { allowed: false, reason: 'budget_exceeded' };
  }
  return { allowed: true, reason: null };
}

/** Per-dispatch maxTokens: a positive safe integer, defaulting to 32k. */
export function validateMaxTokens(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_WORKER_MAX_TOKENS;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error('maxTokens must be a positive safe integer.');
  }
  return value;
}

// Trio gate registry (plan item 4 / report decision 10): the planning
// authority's human-gate list — destructive, external, credential, security,
// send, and merge/push/release — decided from the packet. dsh approval is the
// interactive channel only; the registry is the decision.
export const GATED_CATEGORIES = Object.freeze([
  'destructive',
  'external',
  'credential',
  'security',
  'send',
  'merge-push-release'
]) as readonly string[];

const GATE_KEYWORDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  destructive: Object.freeze(['delete', 'rm ', 'remove', 'drop', 'destroy', 'wipe', 'truncate', 'unlink']),
  external: Object.freeze(['external', 'webhook', 'notify', 'publish', 'deploy']),
  credential: Object.freeze(['credential', 'secret', 'token', 'password', 'api-key', 'apikey']),
  security: Object.freeze(['security', 'sudo', 'escalate', 'exploit', 'pentest']),
  send: Object.freeze(['send', 'email', 'message', 'post', 'dm', 'sms']),
  'merge-push-release': Object.freeze(['merge', 'push', 'release', 'publish', 'deploy', 'tag', 'pr', 'commit'])
});

/**
 * Classify the gated categories that apply to one task from its packet:
 * explicit capability.gateCategories plus a keyword scan over
 * allowedOperations.operations. Sorted stable union.
 */
export function classifyGateCategories(packet: Record<string, unknown> | null | undefined): string[] {
  const categories = new Set<string>();
  const capability = objectRecord(packet?.capability);
  const declared = capability.gateCategories;
  if (declared !== undefined) {
    if (!Array.isArray(declared)) {
      throw new Error('capability.gateCategories must be an array.');
    }
    for (const entry of declared) {
      const normalized = normalizedString(entry);
      if (!normalized || !GATED_CATEGORIES.includes(normalized)) {
        throw new Error('Unknown gate category: ' + String(entry));
      }
      categories.add(normalized);
    }
  }
  // allowedOperations is accepted in two shapes (both produced by the
  // bind flow): an object envelope { files, operations } and a plain
  // operation-name array. Both must feed the keyword scan — reducing an
  // array through objectRecord() would silently drop every gated keyword
  // and let push/release/destructive operations skip the human gate.
  const allowed = packet?.allowedOperations;
  const operations = Array.isArray(allowed)
    ? allowed
    : Array.isArray(objectRecord(allowed).operations)
      ? objectRecord(allowed).operations
      : null;
  if (Array.isArray(operations)) {
    for (const operation of operations) {
      const opName = String(operation).toLowerCase();
      for (const [category, keywords] of Object.entries(GATE_KEYWORDS)) {
        if (keywords.some((keyword) => opName.includes(keyword))) {
          categories.add(category);
        }
      }
    }
  }
  return [...categories].sort();
}
