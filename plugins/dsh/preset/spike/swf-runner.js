// swf-spike one-shot runner for the headless bundle.
//
// Replicates the shipped headless runner (dsh-headless/lib/index.js) but adds
// the agent-preset composition step that the web host's apiproxy performs:
// `agents.create({ ..., setup })` calls `agentPresets.mount(agentCtx, id)`
// inside the agent's setup, so a session on this bundle joins the preset the
// same way a web session does. Task text comes from the headlessStartup
// provider (the CLI positional), exactly like the shipped runner.

import { randomUUID } from 'node:crypto';
import { installModelSelection } from '@deepseek-ai/dsh-agent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';

export const name = 'swf-runner';
export const inject = ['agentDefaultModel', 'agents', 'sessions', 'headlessStartup'];

function summarize(events, firstSeq) {
  let started = false;
  let text = '';
  let reason;
  for (const event of events) {
    if (event.seq < firstSeq) continue;
    if (event.type === 'turn/start') { started = true; continue; }
    if (!started) continue;
    if (event.type === 'assistant/message') {
      const joined = event.data.message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text).join('');
      if (joined !== '') text = joined;
    }
    if (event.type === 'turn/end') reason = event.data.reason;
  }
  return { text, reason };
}

async function run(ctx, task, io) {
  await ctx.get('loader')?.await();
  const agents = ctx.get('agents');
  const defaultModel = ctx.get('agentDefaultModel');
  const sessions = ctx.get('sessions');
  const presets = ctx.get('agentPresets');
  if (agents === undefined || defaultModel === undefined || sessions === undefined || presets === undefined) {
    io.stderr.write('dsh: swf-runner requires agents + agentDefaultModel + sessions + agentPresets\n');
    io.exit(1);
    return;
  }
  const selection = defaultModel.currentSelection();
  // Resolve the roster default (swf-spike for this spike). Fail loudly when
  // the roster cannot resolve it — that is the spike acceptance signal.
  let presetId;
  try {
    presetId = (await presets.resolve()).id;
  } catch (error) {
    io.stderr.write('dsh: swf-runner preset resolve failed: ' + String(error && error.message || error) + '\n');
    io.exit(1);
    return;
  }
  const { agent } = await agents.create({
    sessionId: SessionId('session-' + randomUUID()),
    meta: { cwd: process.cwd() },
    agentOptions: {
      provider: selection.provider,
      model: selection.model
    },
    setup: async (agentCtx) => {
      installModelSelection(agentCtx, { current: selection, assembled: undefined });
      await presets.mount(agentCtx, presetId);
    }
  });
  await agent.whenIdle();
  const firstSeq = agent.session.seq;
  agent.followup(createUserMessage({
    content: [{ type: 'text', text: task }],
    source: { kind: 'user' }
  }));
  await agent.whenIdle();
  await sessions.flush(agent.session);
  const outcome = summarize(agent.session.events, firstSeq);
  io.stdout.write(outcome.text + '\n');
  if (outcome.reason?.kind === 'error') {
    io.stderr.write('dsh: ' + outcome.reason.error.code + ': ' + outcome.reason.error.message + '\n');
  }
  io.exit(outcome.reason?.kind === 'completed' ? 0 : 1);
}

export function apply(ctx, config) {
  const exit = ctx.get('appExit');
  if (exit === undefined) throw new Error('swf-runner: the launcher must provide ctx.appExit');
  const io = { stdout: process.stdout, stderr: process.stderr };
  const task = ctx.headlessStartup?.task ?? config.task;
  if (typeof task !== 'string' || task.trim() === '') {
    io.stderr.write('dsh: swf-runner: a task is required\n');
    exit(1);
    return;
  }
  ctx.on('ready', () => {
    run(ctx, task, io).catch((error) => {
      io.stderr.write('dsh: ' + String(error && error.stack || error) + '\n');
      exit(1);
    });
  });
}