console.error('[swf-mjs] module scope reached');
import { installModelSelection } from '@deepseek-ai/dsh-agent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';

export const name = 'swf-runner-min';
export const inject = ['agentDefaultModel', 'agents', 'sessions'];

export function apply(ctx, config) {
  console.error('[swf-mjs] apply called');
  const exit = ctx.get('appExit');
  if (!exit) throw new Error('swf-runner-min: appExit missing');
  const io = { stdout: process.stdout, stderr: process.stderr };
  const task = config.task;
  if (typeof task !== 'string' || task.trim() === '') { io.stderr.write('no task\n'); exit(1); return; }
  // Deterministic start: poll the loader until it settles, then run.
  const started = { flag: false };
  const timer = setInterval(async () => {
    if (started.flag) return;
    const loader = ctx.get('loader');
    if (!loader) return;
    try {
      await loader.await();
    } catch { return; }
    started.flag = true;
    clearInterval(timer);
    console.error('[swf-mjs] loader settled; starting run');
    run(ctx, task, io, exit).catch((e) => { io.stderr.write('swf-runner-min: ' + (e && e.stack || e) + '\n'); exit(1); });
  }, 200);
  timer.unref();
}

async function run(ctx, task, io, exit) {
  const agents = ctx.get('agents');
  const defaultModel = ctx.get('agentDefaultModel');
  const sessions = ctx.get('sessions');
  const presets = ctx.get('agentPresets');
  if (!agents || !defaultModel || !sessions || !presets) { io.stderr.write('missing services\n'); io.exit(1); return; }
  console.error('[swf-mjs] services ok; resolve preset');
  const selection = defaultModel.currentSelection();
  const resolved = await presets.resolve();
  console.error('[swf-mjs] resolved ' + resolved.id);
  const { agent } = await agents.create({
    sessionId: SessionId('session-' + String(Math.random()).slice(2)),
    meta: { cwd: process.cwd() },
    agentOptions: { provider: selection.provider, model: selection.model },
    setup: async (agentCtx) => {
      console.error('[swf-mjs] setup: installModelSelection');
      installModelSelection(agentCtx, { current: selection, assembled: undefined });
      console.error('[swf-mjs] setup: presets.mount...');
      await presets.mount(agentCtx, resolved.id);
      console.error('[swf-mjs] setup: mount done');
    }
  });
  console.error('[swf-mjs] agent created; whenIdle...');
  await agent.whenIdle();
  const firstSeq = agent.session.seq;
  agent.followup(createUserMessage({ content: [{ type: 'text', text: task }], source: { kind: 'user' } }));
  await agent.whenIdle();
  console.error('[swf-mjs] turn done; flush');
  await sessions.flush(agent.session);
  const outcome = summarize(agent.session.events, firstSeq);
  io.stdout.write(outcome.text + '\n');
  if (outcome.reason?.kind === 'error') io.stderr.write('dsh: ' + outcome.reason.error.code + ': ' + outcome.reason.error.message + '\n');
  io.exit(outcome.reason?.kind === 'completed' ? 0 : 1);
}

function summarize(events, firstSeq) {
  let started = false, text = '', reason;
  for (const event of events) {
    if (event.seq < firstSeq) continue;
    if (event.type === 'turn/start') { started = true; continue; }
    if (!started) continue;
    if (event.type === 'assistant/message') {
      const joined = event.data.message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      if (joined !== '') text = joined;
    }
    if (event.type === 'turn/end') reason = event.data.reason;
  }
  return { text, reason };
}
