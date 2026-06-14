import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderTokenAuditMarkdown, runTokenAudit } from '../../harness/runtime/token-audit-service.mjs';

async function writeRollout(root, relativePath, records) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(
    target,
    `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
    'utf8'
  );
}

function sessionMeta({
  id,
  timestamp,
  cwd,
  source = 'vscode'
}) {
  return {
    timestamp,
    type: 'session_meta',
    payload: {
      id,
      timestamp,
      cwd,
      source,
      model_provider: 'openai'
    }
  };
}

function turnContext({ timestamp, model, effort = 'medium', cwd }) {
  return {
    timestamp,
    type: 'turn_context',
    payload: {
      turn_id: `${model}-${timestamp}`,
      cwd,
      model,
      effort
    }
  };
}

function tokenCount({ timestamp, totalUsage }) {
  return {
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: totalUsage,
        last_token_usage: totalUsage,
        model_context_window: 258400
      }
    }
  };
}

function taskTouch({ timestamp, taskId }) {
  return {
    timestamp,
    type: 'response_item',
    payload: {
      type: 'function_call',
      name: 'exec_command',
      arguments: `{"cmd":"sed -n '1,200p' planning/active/${taskId}/task_plan.md"}`
    }
  };
}

test('runTokenAudit aggregates weekly rollout logs into stable workspace and thread summaries', async () => {
  const sessionsRoot = await mkdtemp(path.join(os.tmpdir(), 'token-audit-runtime-'));

  try {
    await writeRollout(sessionsRoot, '2026/06/10/rollout-main-alpha.jsonl', [
      sessionMeta({
        id: 'main-alpha',
        timestamp: '2026-06-10T01:00:00Z',
        cwd: '/workspace/SuperpoweringWithFiles'
      }),
      turnContext({
        timestamp: '2026-06-10T01:01:00Z',
        cwd: '/workspace/SuperpoweringWithFiles',
        model: 'gpt-5.4'
      }),
      taskTouch({
        timestamp: '2026-06-10T01:02:00Z',
        taskId: 'goal-round-start-protocol'
      }),
      tokenCount({
        timestamp: '2026-06-10T01:03:00Z',
        totalUsage: {
          input_tokens: 200,
          cached_input_tokens: 100,
          output_tokens: 20,
          total_tokens: 220
        }
      })
    ]);

    await writeRollout(sessionsRoot, '2026/06/11/rollout-main-beta.jsonl', [
      sessionMeta({
        id: 'main-beta',
        timestamp: '2026-06-11T01:00:00Z',
        cwd: '/workspace/BabyCry'
      }),
      turnContext({
        timestamp: '2026-06-11T01:01:00Z',
        cwd: '/workspace/BabyCry',
        model: 'gpt-5.4-mini'
      }),
      taskTouch({
        timestamp: '2026-06-11T01:02:00Z',
        taskId: 'release-automation-skill-20260613'
      }),
      tokenCount({
        timestamp: '2026-06-11T01:03:00Z',
        totalUsage: {
          input_tokens: 180,
          cached_input_tokens: 100,
          output_tokens: 50,
          total_tokens: 180
        }
      })
    ]);

    await writeRollout(sessionsRoot, '2026/06/12/rollout-subagent-gamma.jsonl', [
      sessionMeta({
        id: 'subagent-gamma',
        timestamp: '2026-06-12T01:00:00Z',
        cwd: '/workspace/SuperpoweringWithFiles',
        source: {
          subagent: {
            thread_spawn: {
              parent_thread_id: 'main-alpha',
              depth: 1,
              agent_nickname: 'Godel',
              agent_role: 'worker'
            }
          }
        }
      }),
      turnContext({
        timestamp: '2026-06-12T01:01:00Z',
        cwd: '/workspace/SuperpoweringWithFiles',
        model: 'gpt-5.4-mini'
      }),
      taskTouch({
        timestamp: '2026-06-12T01:02:00Z',
        taskId: 'goal-round-start-protocol'
      }),
      tokenCount({
        timestamp: '2026-06-12T01:03:00Z',
        totalUsage: {
          input_tokens: 150,
          cached_input_tokens: 100,
          output_tokens: 60,
          total_tokens: 200
        }
      })
    ]);

    await writeRollout(sessionsRoot, '2026/05/20/rollout-out-of-range.jsonl', [
      sessionMeta({
        id: 'old-session',
        timestamp: '2026-05-20T01:00:00Z',
        cwd: '/workspace/SuperpoweringWithFiles'
      }),
      turnContext({
        timestamp: '2026-05-20T01:01:00Z',
        cwd: '/workspace/SuperpoweringWithFiles',
        model: 'gpt-5.4'
      }),
      tokenCount({
        timestamp: '2026-05-20T01:02:00Z',
        totalUsage: {
          input_tokens: 999,
          cached_input_tokens: 999,
          output_tokens: 999,
          total_tokens: 999
        }
      })
    ]);

    const report = await runTokenAudit({
      sessionsRoot,
      dateFrom: '2026-06-07T00:00:00Z',
      dateTo: '2026-06-14T23:59:59Z'
    });

    assert.equal(report.sessionCount, 3);
    assert.equal(report.totals.totalTokens, 600);
    assert.equal(report.totals.cachedInputTokens, 300);
    assert.equal(report.totals.freshProxy, 360);
    assert.equal(report.breakdowns.threadSource.main.sessions, 2);
    assert.equal(report.breakdowns.threadSource.subagent.sessions, 1);
    assert.equal(report.breakdowns.models['gpt-5.4'].sessions, 1);
    assert.equal(report.breakdowns.models['gpt-5.4-mini'].sessions, 2);
    assert.equal(report.breakdowns.workspaces['/workspace/SuperpoweringWithFiles'].sessions, 2);
    assert.equal(report.leaderboards.tasks[0].taskFamilyHint, 'goal-round-start-protocol (heuristic)');
    assert.equal(report.leaderboards.tasks[0].totalTokens, 420);
    assert.equal(report.leaderboards.tasks[1].taskFamilyHint, 'release-automation-skill (heuristic)');
    assert.equal(report.leaderboards.sessions[0].sessionId, 'main-alpha');
    assert.equal(report.leaderboards.sessions[0].totalTokens, 220);

    const markdown = renderTokenAuditMarkdown(report);
    assert.match(markdown, /# Weekly token audit/);
    assert.match(markdown, /Total tokens: 600/);
    assert.match(markdown, /Cached input tokens: 300/);
    assert.match(markdown, /Fresh proxy: 360/);
    assert.match(markdown, /Main vs subagent:/);
    assert.match(markdown, /Model mix:/);
    assert.match(markdown, /Top task-family hints:/);
    assert.match(markdown, /goal-round-start-protocol \(heuristic\)/);
    assert.match(markdown, /release-automation-skill \(heuristic\)/);
    assert.match(markdown, /SuperpoweringWithFiles \(\/workspace\/SuperpoweringWithFiles\)/);
  } finally {
    await rm(sessionsRoot, { recursive: true, force: true });
  }
});

test('runTokenAudit rejects invalid explicit audit window values', async () => {
  await assert.rejects(
    runTokenAudit({
      sessionsRoot: '/tmp/unused',
      dateFrom: 'not-a-date'
    }),
    /Invalid date-from: not-a-date/
  );

  await assert.rejects(
    runTokenAudit({
      sessionsRoot: '/tmp/unused',
      dateTo: 'still-not-a-date'
    }),
    /Invalid date-to: still-not-a-date/
  );

  await assert.rejects(
    runTokenAudit({
      sessionsRoot: '/tmp/unused',
      dateFrom: '2026-06-14T23:59:59Z',
      dateTo: '2026-06-07T00:00:00Z'
    }),
    /Invalid audit window/
  );
});
