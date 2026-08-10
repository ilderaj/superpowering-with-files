export { resolveHostOperation as resolveCodexHostOperation } from '../core/routing.mjs';

const SWF_EXECUTOR_BASE = Object.freeze({
  name: 'swf_executor',
  model: 'opencode-go/deepseek-v4-flash',
  fallbackModel: null,
  description: 'SWF execution worker: executes an already accepted SWF plan without redesigning scope, architecture, interfaces, or acceptance criteria.',
  nicknameCandidates: ['SWF Executor'],
  instructions: [
    'You are the swf_executor execution worker. You execute an already accepted SWF plan',
    'and do not redesign its scope, architecture, interfaces, or acceptance criteria.',
    'Return blocked when a material decision is missing or when the pinned execution',
    'model is unavailable. Any nested delegation must use the swf_executor role again.'
  ].join(' ')
});

const SWF_EXECUTOR_EFFORTS = Object.freeze(['high', 'xhigh', 'max']);

export const SWF_EXECUTOR_PROFILES = Object.freeze(
  Object.fromEntries(SWF_EXECUTOR_EFFORTS.map((effort) => [
    effort,
    Object.freeze({ ...SWF_EXECUTOR_BASE, modelReasoningEffort: effort })
  ]))
);

export const SWF_EXECUTOR_ROLE = SWF_EXECUTOR_PROFILES.xhigh;

export function resolveSwfExecutorProfile(effort = 'xhigh') {
  if (typeof effort !== 'string' || !Object.hasOwn(SWF_EXECUTOR_PROFILES, effort)) {
    throw new TypeError(`Unsupported swf_executor profile effort: ${String(effort)}; use high, xhigh, or max.`);
  }
  return SWF_EXECUTOR_PROFILES[effort];
}

export function renderSwfExecutorAgentEntry(configFilePath, effort = 'xhigh') {
  if (typeof configFilePath !== 'string' || configFilePath.length === 0) {
    throw new TypeError('swf_executor agent entry requires a role config file path.');
  }
  const role = resolveSwfExecutorProfile(effort);
  return [
    `[agents.${role.name}]`,
    `description = "${role.description}"`,
    `config_file = "${configFilePath}"`
  ].join('\n') + '\n';
}

export function renderSwfExecutorRoleFile(effort = 'xhigh') {
  const role = resolveSwfExecutorProfile(effort);
  return [
    `name = "${role.name}"`,
    `description = "${role.description}"`,
    `nickname_candidates = [${role.nicknameCandidates.map((name) => `"${name}"`).join(', ')}]`,
    `model = "${role.model}"`,
    `model_reasoning_effort = "${role.modelReasoningEffort}"`,
    `developer_instructions = "${role.instructions}"`
  ].join('\n') + '\n';
}

export const ADAPTER_VOCABULARY = Object.freeze(['codex', 'claude_code', 'pi']);

export function adapterStatus(adapter) {
  if (adapter === 'codex') return 'implemented';
  if (adapter === 'claude_code' || adapter === 'pi') return 'unimplemented';
  throw new Error(`Unknown Host adapter: ${String(adapter)}`);
}

export function renderCodexHandoffRequest({ operation, packet, packetDigest, effort = 'xhigh' }) {
  if (typeof operation !== 'string' || operation.length === 0) {
    throw new TypeError('Codex handoff request requires a lifecycle operation.');
  }
  if (!packet || typeof packet !== 'object') {
    throw new TypeError('Codex handoff request requires an immutable Assignment Packet.');
  }
  if (typeof packetDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(packetDigest)) {
    throw new TypeError('Codex handoff request requires a stable packet digest.');
  }
  return {
    provider: 'codex',
    role: 'swf_executor',
    profile: resolveSwfExecutorProfile(effort),
    operation,
    packet,
    packetDigest,
    executed: false
  };
}
