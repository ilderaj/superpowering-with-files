// swf-spike probe plugin (dependency-free). v3
// SPIKE PURPOSE: empirically confirm the agent-preset feasibility questions
// (see reports/audit/2026-08-17-dsh-agent-preset-spike.md): absolute-path row
// mount, host-service resolution from the preset layer, subagent/start
// observation, ctx.tools.guard enforcement.
export const name = 'swf-spike-probe';
export const inject = ['tools'];

export function apply(ctx) {
  const state = { started: [], guarded: {} };

  ctx.on('subagent/start', (info) => {
    state.started.push({
      runId: info && info.runId != null ? String(info.runId) : '',
      provider: info && info.provider != null ? String(info.provider) : '',
      id: info && info.id != null ? String(info.id) : ''
    });
    console.error('[probe] subagent/start observed: ' + JSON.stringify(state.started));
  });

  ctx.tools.guard((execution) => {
    if (execution && state.guarded[execution.name]) {
      return 'swf-spike-guard: ' + execution.name + ' denied while armed';
    }
    return undefined;
  });

  const probeSchema = { type: 'object' };

  ctx.tools.register({
    name: 'swf_probe',
    description: 'SWF preset spike probe: report which host services resolve from this context and how many subagent/start events have been observed.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: probeSchema, render: (value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
    async execute() {
      const out = {
        services: {
          approval: ctx.get('approval') !== undefined,
          tokenMeter: ctx.get('tokenMeter') !== undefined,
          subagents: ctx.get('subagents') !== undefined,
          tools: ctx.tools !== undefined
        },
        started: state.started,
        note: 'probe ok'
      };
      return out;
    }
  });

  ctx.tools.register({
    name: 'swf_guard_arm',
    description: 'SWF preset spike probe: arm the execution guard for one tool name; the next call of that tool is denied with swf-spike-guard.',
    parameters: {
      type: 'object',
      properties: { tool: { type: 'string' } },
      required: ['tool'],
      additionalProperties: false
    },
    output: {
      schema: {
        type: 'object',
        properties: { armed: { type: 'array', items: { type: 'string' } } },
        required: ['armed'],
        additionalProperties: false
      },
      render: (value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]
    },
    async execute(args) {
      state.guarded[String(args.tool)] = true;
      return { armed: Object.keys(state.guarded) };
    }
  });
}