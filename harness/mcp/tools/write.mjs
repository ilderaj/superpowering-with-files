import * as z from 'zod/v3';
import path from 'node:path';
import { buildWritePlan } from '../../runtime/write-plan.mjs';
import { createApprovalToken } from '../../runtime/approval-token.mjs';
import { applyWritePlan } from '../../runtime/safe-apply.mjs';
import { readState } from '../../installer/lib/state.mjs';
import { getSyncDryRun } from '../../runtime/sync-plan-service.mjs';
import { resolveHarnessRoot } from '../../runtime/root-policy.mjs';

function textResult(text, structuredContent) {
  return {
    content: [{ type: 'text', text }],
    structuredContent
  };
}

async function buildInstallPreview(rootDir) {
  const state = await readState(rootDir);
  return {
    scope: state.scope,
    targets: Object.keys(state.targets),
    projectionMode: state.projectionMode
  };
}

function parseToken(rawToken) {
  return JSON.parse(rawToken);
}

export function registerWriteTools(server) {
  server.registerTool(
    'harness_install_plan',
    {
      description: 'Prepare an install plan without applying it.',
      inputSchema: z.object({ root: z.string().optional(), args: z.array(z.string()).default([]) }).strict()
    },
    async ({ root, args }) => {
      const resolved = await resolveHarnessRoot(root);
      const plan = buildWritePlan({
        operation: 'install',
        rootDir: resolved.rootDir,
        payload: { args },
        preview: await buildInstallPreview(resolved.rootDir)
      });
      return textResult(`Install plan ${plan.planId} prepared.`, plan);
    }
  );

  server.registerTool(
    'harness_install_apply',
    {
      description: 'Apply an install plan with an out-of-band approval token.',
      inputSchema: z.object({ plan: z.any(), approvalToken: z.string() }).strict()
    },
    async ({ plan, approvalToken }) => {
      const result = await applyWritePlan(plan, parseToken(approvalToken));
      return textResult('Install plan applied.', result);
    }
  );

  server.registerTool(
    'harness_sync_plan',
    {
      description: 'Prepare a sync plan without applying it.',
      inputSchema: z.object({ root: z.string().optional() }).strict()
    },
    async ({ root }) => {
      const resolved = await resolveHarnessRoot(root);
      const preview = await getSyncDryRun({ root: resolved.rootDir });
      const plan = buildWritePlan({
        operation: 'sync',
        rootDir: resolved.rootDir,
        payload: { args: [] },
        preview
      });
      return textResult(`Sync plan ${plan.planId} prepared.`, plan);
    }
  );

  server.registerTool(
    'harness_sync_apply',
    {
      description: 'Apply a sync plan with an out-of-band approval token.',
      inputSchema: z.object({ plan: z.any(), approvalToken: z.string() }).strict()
    },
    async ({ plan, approvalToken }) => {
      const result = await applyWritePlan(plan, parseToken(approvalToken));
      return textResult('Sync plan applied.', result);
    }
  );

  server.registerTool(
    'harness_checkpoint_plan',
    {
      description: 'Prepare a checkpoint plan without applying it.',
      inputSchema: z.object({ root: z.string().optional(), args: z.array(z.string()).default([]) }).strict()
    },
    async ({ root, args }) => {
      const resolved = await resolveHarnessRoot(root);
      const plan = buildWritePlan({
        operation: 'checkpoint',
        rootDir: resolved.rootDir,
        payload: { args },
        preview: { command: './scripts/harness checkpoint' }
      });
      return textResult(`Checkpoint plan ${plan.planId} prepared.`, plan);
    }
  );

  server.registerTool(
    'harness_checkpoint_apply',
    {
      description: 'Apply a checkpoint plan with an out-of-band approval token.',
      inputSchema: z.object({ plan: z.any(), approvalToken: z.string() }).strict()
    },
    async ({ plan, approvalToken }) => {
      const result = await applyWritePlan(plan, parseToken(approvalToken));
      return textResult('Checkpoint plan applied.', result);
    }
  );

  server.registerTool(
    'harness_record_progress',
    {
      description: 'Append a record block to task-scoped planning files with approval.',
      inputSchema: z
        .object({
          root: z.string().optional(),
          taskId: z.string(),
          file: z.enum(['task_plan', 'findings', 'progress']),
          title: z.string(),
          body: z.string(),
          approvalToken: z.string()
        })
        .strict()
    },
    async ({ root, taskId, file, title, body, approvalToken }) => {
      const resolved = await resolveHarnessRoot(root);
      const plan = buildWritePlan({
        operation: 'record_progress',
        rootDir: resolved.rootDir,
        payload: {
          args: ['--task', taskId, '--file', file, '--title', title, '--body', body]
        },
        preview: {
          taskId,
          filePath: path.join('planning/active', taskId, `${file}.md`)
        }
      });
      const result = await applyWritePlan(plan, parseToken(approvalToken));
      return textResult(`Appended record to ${file}.`, result);
    }
  );

  server.registerTool(
    'harness_record_execution_receipt',
    {
      description: 'Persist an execution-unit receipt through the approved write path.',
      inputSchema: z
        .object({
          root: z.string().optional(),
          taskId: z.string(),
          unitId: z.string(),
          mode: z.enum(['inline', 'subagent', 'manual', 'external']),
          resultStatus: z.enum(['done_with_evidence', 'blocked', 'failed', 'abandoned']),
          startedAt: z.string(),
          finishedAt: z.string(),
          changedFiles: z.array(z.string()).default([]),
          verificationCommands: z.array(z.any()).default([]),
          artifactsProduced: z.array(z.any()).default([]),
          followups: z.array(z.any()).default([]),
          syncBackRef: z.string(),
          notes: z.string().optional(),
          approvalToken: z.string()
        })
        .strict()
    },
    async ({
      root,
      taskId,
      unitId,
      mode,
      resultStatus,
      startedAt,
      finishedAt,
      changedFiles,
      verificationCommands,
      artifactsProduced,
      followups,
      syncBackRef,
      notes,
      approvalToken
    }) => {
      const resolved = await resolveHarnessRoot(root);
      const plan = buildWritePlan({
        operation: 'record_execution_receipt',
        rootDir: resolved.rootDir,
        payload: {
          taskId,
          receipt: {
            schemaVersion: 1,
            taskId,
            unitId,
            actor: 'pending-approval-token',
            mode,
            resultStatus,
            startedAt,
            finishedAt,
            changedFiles,
            verificationCommands,
            artifactsProduced,
            followups,
            syncBackRef,
            ...(notes ? { notes } : {})
          }
        },
        preview: { taskId, unitId, resultStatus, syncBackRef }
      });
      const result = await applyWritePlan(plan, parseToken(approvalToken));
      return textResult('Execution receipt recorded.', result);
    }
  );

  server.registerTool(
    'harness_record_followup_closure',
    {
      description: 'Persist follow-up closure evidence through the approved write path.',
      inputSchema: z
        .object({
          root: z.string().optional(),
          taskId: z.string(),
          unitId: z.string(),
          followupId: z.string(),
          mode: z.enum(['inline', 'subagent', 'manual', 'external']),
          closureStatus: z.enum(['resolved', 'waived']),
          closedAt: z.string(),
          reason: z.string(),
          evidenceRef: z.string(),
          syncBackRef: z.string(),
          approvalToken: z.string()
        })
        .strict()
    },
    async ({
      root,
      taskId,
      unitId,
      followupId,
      mode,
      closureStatus,
      closedAt,
      reason,
      evidenceRef,
      syncBackRef,
      approvalToken
    }) => {
      const resolved = await resolveHarnessRoot(root);
      const plan = buildWritePlan({
        operation: 'record_followup_closure',
        rootDir: resolved.rootDir,
        payload: {
          taskId,
          closure: {
            schemaVersion: 1,
            taskId,
            unitId,
            followupId,
            closureStatus,
            actor: 'pending-approval-token',
            mode,
            closedAt,
            reason,
            evidenceRef,
            syncBackRef
          }
        },
        preview: { taskId, followupId, closureStatus, syncBackRef }
      });
      const result = await applyWritePlan(plan, parseToken(approvalToken));
      return textResult('Follow-up closure recorded.', result);
    }
  );

  server.registerTool(
    'harness_debug_approve_plan',
    {
      description: 'Development-only helper that signs a plan out-of-band for tests.',
      inputSchema: z.object({ plan: z.any(), actor: z.string().default('test-runner') }).strict()
    },
    async ({ plan, actor }) => {
      if (process.env.HARNESS_MCP_ALLOW_DEBUG_APPROVE !== '1') {
        throw new Error('Debug approval tool is disabled.');
      }
      const token = await createApprovalToken(plan.rootDir, plan, { actor });
      return textResult('Debug approval token created.', token);
    }
  );
}
