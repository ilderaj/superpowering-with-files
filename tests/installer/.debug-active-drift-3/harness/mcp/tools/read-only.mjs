import * as z from 'zod/v3';
import { getHarnessStatus } from '../../runtime/status-service.mjs';
import { runHarnessDoctor } from '../../runtime/doctor-service.mjs';
import { getActiveTaskSummary, getTaskSummary } from '../../runtime/summary-service.mjs';
import { getSyncDryRun } from '../../runtime/sync-plan-service.mjs';
import { runHarnessVerify } from '../../runtime/verify-service.mjs';

function textResult(text, structuredContent) {
  return {
    content: [{ type: 'text', text }],
    structuredContent
  };
}

export function registerReadOnlyTools(server) {
  server.registerTool(
    'harness_status',
    {
      description: 'Read Harness health status for an allow-listed root.',
      inputSchema: z.object({ root: z.string().optional() }).strict(),
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    async ({ root }) => {
      const result = await getHarnessStatus({ root });
      return textResult(`Harness status for ${result.rootDir}`, result);
    }
  );

  server.registerTool(
    'harness_doctor',
    {
      description: 'Read Harness doctor output for an allow-listed root.',
      inputSchema: z.object({ root: z.string().optional() }).strict(),
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    async ({ root }) => {
      const result = await runHarnessDoctor({ root });
      return textResult(result.ok ? 'Harness doctor passed.' : 'Harness doctor found problems.', result);
    }
  );

  server.registerTool(
    'harness_active_summary',
    {
      description: 'Read the active task summary for an allow-listed root.',
      inputSchema: z.object({ root: z.string().optional() }).strict(),
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    async ({ root }) => {
      const result = await getActiveTaskSummary({ root });
      return textResult(`Active tasks: ${result.report.counts.total}`, result.report);
    }
  );

  server.registerTool(
    'harness_task_summary',
    {
      description: 'Read a task summary for a specific active task.',
      inputSchema: z.object({ root: z.string().optional(), taskId: z.string() }).strict(),
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    async ({ root, taskId }) => {
      const result = await getTaskSummary({ root, taskId });
      return textResult(`Task summary for ${taskId}`, result);
    }
  );

  server.registerTool(
    'harness_sync_dry_run',
    {
      description: 'Read the projection diff without writing files.',
      inputSchema: z.object({ root: z.string().optional() }).strict(),
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    async ({ root }) => {
      const result = await getSyncDryRun({ root });
      return textResult(
        `Sync dry-run: create=${result.summary.create} update=${result.summary.update} stale=${result.summary.stale}`,
        result
      );
    }
  );

  server.registerTool(
    'harness_verify_read',
    {
      description: 'Read the verification report without writing files.',
      inputSchema: z.object({ root: z.string().optional() }).strict(),
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    async ({ root }) => {
      const result = await runHarnessVerify({ root });
      return textResult('Harness verification report generated.', result);
    }
  );
}
