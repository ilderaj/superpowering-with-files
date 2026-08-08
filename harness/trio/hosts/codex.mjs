export { resolveHostOperation as resolveCodexHostOperation } from '../core/routing.mjs';

export const SWF_EXECUTOR_ROLE = Object.freeze({
  name: 'swf_executor',
  model: 'opencode-go/deepseek-v4-flash',
  modelReasoningEffort: 'xhigh',
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

export function renderSwfExecutorAgentEntry(configFilePath) {
  if (typeof configFilePath !== 'string' || configFilePath.length === 0) {
    throw new TypeError('swf_executor agent entry requires a role config file path.');
  }
  return [
    `[agents.${SWF_EXECUTOR_ROLE.name}]`,
    `description = "${SWF_EXECUTOR_ROLE.description}"`,
    `config_file = "${configFilePath}"`
  ].join('\n') + '\n';
}

export function renderSwfExecutorRoleFile() {
  return [
    `name = "${SWF_EXECUTOR_ROLE.name}"`,
    `description = "${SWF_EXECUTOR_ROLE.description}"`,
    `nickname_candidates = [${SWF_EXECUTOR_ROLE.nicknameCandidates.map((name) => `"${name}"`).join(', ')}]`,
    `model = "${SWF_EXECUTOR_ROLE.model}"`,
    `model_reasoning_effort = "${SWF_EXECUTOR_ROLE.modelReasoningEffort}"`,
    `developer_instructions = "${SWF_EXECUTOR_ROLE.instructions}"`
  ].join('\n') + '\n';
}
