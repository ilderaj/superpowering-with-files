// swf-spike probe plugin (dependency-free by design).
//
// SPIKE PURPOSE: empirically confirm the three agent-preset feasibility
// questions that the rc.6 sources answer at design level (see
// reports/audit/2026-08-17-dsh-agent-preset-spike.md):
//   1. an absolute-path row mounts a custom plugin file from the preset;
//   2. the mounted context resolves host services (approval / tokenMeter /
//      subagents) and the tools registry via ctx.get / property access;
//   3. a preset-layer listener observes `subagent/start` events for
//      descendants (the mandatory worker-record seam), and a tools guard
//      registered from this context denies tool calls (the enforcement seam).
//
// No @deepseek-ai imports on purpose: the loader imports this file via a
// `file:` URL, and shipping no bare specifiers removes the only remaining
// resolution failure mode. Register uses the plain ToolDefinition shape
// (name / description / parameters JSON Schema / output {schema, render} /
// execute).

export const name = 'swf-spike-probe';
export const inject = ['tools'];

export function apply(ctx) {
  const state = {
    started: [],
    guardArmed: {}
  };

  // ── observation seam ────────────────────────────────────────────────────
  // subagent/start payload (rc.6 lifecycle.js): { runId, provider, id, local }.
  // scopeTarget(): untagged listeners are global; tagged listeners receive
  // their own scope key and every ancestor-descendant flow upward.
  ctx.on('subagent/start', (info) => {
    state.started.push({
      runId: info && info.runId ? String(info.runId) : null,
      provider: info && info.provider ? String(info.provider) : null,
      id: info && info.id ? String(info.id) : null
    });
  });

  // ── enforcement seam (optional acceptance A5) ───────────────────────────
  // A monotonic guard denying any tool while its name is armed proves the
  // guard registry is reachable from this context and applies at execution.
  ctx.tools.guard((execution) => {
    if (execution && state.guardArmed[execution.name]) {
      return `swf-spike-guard: ${execution.name} denied while armed`;
    }
    return undefined;
  });

  const probeOutput = {
    schema: {
      type: 'object',
      properties: {
        services: {
          type: 'object',
          properties: {
            approval: { type: 'boolean' },
            tokenMeter: { type: 'boolean' },
            subagents: { type: 'boolean' },
            tools: { type: 'boolean' }
          },
          required: ['approval', 'tokenMeter', 'subagents', 'tools'],
          additionalProperties: false
        },
        started: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              runId: { type: ['string', 'null'] },
              provider: { type: ['string', 'null'] },
              id: { type: ['string', 'null'] }
            },
            required: ['runId', 'provider', 'id']
          }
        },
        layers: { type: 'object' }
      },
      required: ['services', 'started'],
      additionalProperties: false
    },
    render: (value) => JSON.stringify(value, null, 2)
  };

  const armOutput = {
    schema: {
      type: 'object',
      properties: { armed: { type: 'array', items: { type: 'string' } } },
      required: ['armed'],
      additionalProperties: false
    },
    render: (value) => JSON.stringify(value, null, 2)
  };

  // ── probe tools ─────────────────────────────────────────────────────────
  ctx.tools.register({
    name: 'swf_probe',
    description: 'SWF preset spike probe: report which host services resolve from this context and how many subagent/start events have been observed.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    output: probeOutput,
    async execute() {
      return {
        services: {
          approval: ctx.get('approval') !== undefined,
          tokenMeter: ctx.get('tokenMeter') !== undefined,
          subagents: ctx.get('subagents') !== undefined,
          tools: ctx.tools !== undefined
        },
        started: state.started,
        layers: {
          hasScope: typeof ctx[Symbol.for('dsh.scope.key')] !== 'undefined'
        }
      };
    }
  });

  ctx.tools.register({
    name: 'swf_guard_arm',
    description: 'SWF preset spike probe: arm the execution guard for one tool name, then call that tool once to observe the denial.',
    parameters: {
      type: 'object',
      properties: {
        tool: { type: 'string' }
      },
      required: ['tool'],
      additionalProperties: false
    },
    output: armOutput,
    async execute(args) {
      state.guardArmed[String(args.tool)] = true;
      return { armed: Object.keys(state.guardArmed) };
    }
  });
}