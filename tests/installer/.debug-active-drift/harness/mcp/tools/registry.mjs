import * as z from 'zod/v3';
import { buildWritePlan } from '../../runtime/write-plan.mjs';
import { applyWritePlan } from '../../runtime/safe-apply.mjs';
import { createPolicyDigest } from '../../runtime/policy-signature.mjs';
import { diffPolicies, evaluatePolicyBundle } from '../../runtime/policy-evaluator.mjs';
import { readRegistry, writeRegistry } from '../../runtime/registry-service.mjs';
import { resolveHarnessRoot } from '../../runtime/root-policy.mjs';

function textResult(text, structuredContent) {
  return {
    content: [{ type: 'text', text }],
    structuredContent
  };
}

function parseToken(rawToken) {
  return JSON.parse(rawToken);
}

export function registerRegistryTools(server) {
  server.registerTool(
    'harness_registry_status',
    {
      description: 'Read the current Harness registry bundle for a channel.',
      inputSchema: z.object({ root: z.string().optional(), channel: z.string().default('local-dev') }).strict(),
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    async ({ root, channel }) => {
      const resolved = await resolveHarnessRoot(root);
      const bundle = await readRegistry(resolved.rootDir, channel);
      return textResult(`Registry status for ${channel}.`, { channel, bundle });
    }
  );

  server.registerTool(
    'harness_policy_evaluate',
    {
      description: 'Evaluate a policy bundle locally.',
      inputSchema: z.object({ bundle: z.any(), requireSignature: z.boolean().default(false) }).strict(),
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    async ({ bundle, requireSignature }) => {
      const result = evaluatePolicyBundle(bundle, { requireSignature, publicKeyPem: bundle?.publicKey });
      return textResult(result.ok ? 'Policy bundle accepted.' : 'Policy bundle rejected.', result);
    }
  );

  server.registerTool(
    'harness_policy_diff',
    {
      description: 'Diff a candidate policy bundle against the current channel bundle.',
      inputSchema: z.object({ root: z.string().optional(), channel: z.string().default('local-dev'), nextPolicy: z.any() }).strict(),
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    async ({ root, channel, nextPolicy }) => {
      const resolved = await resolveHarnessRoot(root);
      const currentPolicy = await readRegistry(resolved.rootDir, channel);
      const result = diffPolicies(currentPolicy, nextPolicy);
      return textResult(result.changed ? 'Policy bundle differs.' : 'Policy bundle unchanged.', result);
    }
  );

  server.registerTool(
    'harness_distribution_plan',
    {
      description: 'Prepare a distribution plan for a registry bundle.',
      inputSchema: z.object({ root: z.string().optional(), channel: z.string().default('local-dev'), bundle: z.any() }).strict()
    },
    async ({ root, channel, bundle }) => {
      const resolved = await resolveHarnessRoot(root);
      const plan = buildWritePlan({
        operation: 'distribution',
        rootDir: resolved.rootDir,
        payload: {
          channel,
          digest: createPolicyDigest(bundle),
          bundle
        },
        preview: {
          channel,
          digest: createPolicyDigest(bundle)
        }
      });
      return textResult(`Distribution plan ${plan.planId} prepared.`, plan);
    }
  );

  server.registerTool(
    'harness_distribution_apply',
    {
      description: 'Apply a distribution plan with an out-of-band approval token.',
      inputSchema: z.object({ plan: z.any(), approvalToken: z.string() }).strict()
    },
    async ({ plan, approvalToken }) => {
      const result = await applyWritePlan(plan, parseToken(approvalToken));
      return textResult('Distribution plan applied.', result);
    }
  );
}
