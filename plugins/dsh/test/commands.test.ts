import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { evidenceRecord } from '../src/core/index.js';
import {
  createSwfCommands,
  parseKeyValueArgs,
  parseSwfCommand,
  routeHandler
} from '../src/commands.js';
import { createSessionTracker } from '../src/detect.js';
import { readPacket, writeEvidence } from '../src/packet.js';
import { makeInvocation, makeMockCtx, makePacketInputFor, runCommand, withTmpRoot } from './helpers.js';

describe('/swf command parsing', () => {
  it('parses route / bind / status / accept subcommands', () => {
    expect(parseSwfCommand(' route workRole=executing').subcommand).toBe('route');
    expect(parseSwfCommand('bind alpha-task {}').subcommand).toBe('bind');
    expect(parseSwfCommand('  status alpha-task /root').subcommand).toBe('status');
    expect(parseSwfCommand('accept alpha-task /root').subcommand).toBe('accept');
    expect(() => parseSwfCommand('frobnicate x')).toThrow('Usage: /swf');
  });

  it('parses key=value arguments', () => {
    expect(parseKeyValueArgs(['a=1', 'b=two words'])).toEqual({ a: '1', b: 'two words' });
    expect(() => parseKeyValueArgs(['naked'])).toThrow('Expected key=value');
  });
});

describe('/swf route', () => {
  it('routes a quick task inline', () => {
    const result = routeHandler(makeInvocation(' route taskClass=quick'));
    expect(result.kind).toBe('success');
    const body = JSON.parse((result as { text: string }).text);
    expect(body.taskClass).toBe('quick');
    expect(body.createTrio).toBe(false);
  });

  it('routes a tracked task to trio creation', () => {
    const result = routeHandler(makeInvocation(' route tracked=1 phases=2'));
    expect(result.kind).toBe('success');
    const body = JSON.parse((result as { text: string }).text);
    expect(body.taskClass).toBe('tracked');
    expect(body.createTrio).toBe(true);
  });
});

describe('/swf bind', () => {
  it('binds a valid packet and persists swf-packet.json with a match observation', async () => {
    await withTmpRoot(async (root) => {
      const { ctx, commands } = makeMockCtx();
      for (const def of createSwfCommands(ctx, createSessionTracker(ctx))) {
        ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'alpha-task');
      const result = await runCommand(commands, 'bind alpha-task ' + JSON.stringify(input));
      expect(result.kind).toBe('success');
      const body = JSON.parse((result as { text: string }).text);
      expect(body.status).toBe('bound');
      expect(body.bindingObservation.status).toBe('match');
      expect(body.packetDigest).toBeTruthy();
      const stored = JSON.parse(await readFile(join(root, 'planning', 'active', 'alpha-task', 'swf-packet.json'), 'utf8'));
      expect(stored.schema).toBe('swf-dsh/packet');
      expect(stored.packetDigest).toBe(body.packetDigest);
    });
  });

  it('stops on binding_mismatch without writing a packet', async () => {
    await withTmpRoot(async (root) => {
      const { ctx, commands } = makeMockCtx();
      for (const def of createSwfCommands(ctx, createSessionTracker(ctx))) {
        ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'alpha-task');
      // tamper with task_plan.md AFTER the binding was computed
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(root, 'planning', 'active', 'alpha-task', 'task_plan.md'), 'tampered\\n', 'utf8');
      const result = await runCommand(commands, 'bind alpha-task ' + JSON.stringify(input));
      expect(result.kind).toBe('error');
      expect((result as { text: string }).text).toContain('binding_mismatch');
      await expect(
        import('node:fs/promises').then(({ access }) => access(join(root, 'planning', 'active', 'alpha-task', 'swf-packet.json')))
      ).rejects.toThrow();
    });
  });

  it('refuses a path-like CLI task id before any packet or evidence write', async () => {
    await withTmpRoot(async (root) => {
      const { ctx, commands } = makeMockCtx();
      for (const def of createSwfCommands(ctx, createSessionTracker(ctx))) {
        ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'alpha-task');
      const result = await runCommand(commands, 'bind ../../escape ' + JSON.stringify(input));
      expect(result.kind).toBe('error');
      expect((result as { text: string }).text).toContain('invalid task id');
      const { access } = await import('node:fs/promises');
      await expect(access(join(root, 'escape', 'swf-packet.json'))).rejects.toThrow();
    });
  });

  it('refuses to bind a packet under a task id that differs from the packet authority task', async () => {
    await withTmpRoot(async (root) => {
      const { ctx, commands } = makeMockCtx();
      for (const def of createSwfCommands(ctx, createSessionTracker(ctx))) {
        ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'alpha-task');
      const result = await runCommand(commands, 'bind beta-task ' + JSON.stringify(input));
      expect(result.kind).toBe('error');
      expect((result as { text: string }).text).toContain('binding task mismatch');
      const { access } = await import('node:fs/promises');
      await expect(access(join(root, 'planning', 'active', 'beta-task', 'swf-packet.json'))).rejects.toThrow();
    });
  });

  it('records worker evidence as unknown when no dispatch record exists', async () => {
    await withTmpRoot(async (root) => {
      const { ctx, commands } = makeMockCtx();
      for (const def of createSwfCommands(ctx, createSessionTracker(ctx))) {
        ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'alpha-task');
      await runCommand(commands, 'bind alpha-task ' + JSON.stringify(input));
      const worker = JSON.parse(await readFile(join(root, 'planning', 'active', 'alpha-task', 'evidence', 'worker.json'), 'utf8'));
      expect(worker.state).toBe('unknown');
      expect(worker.authenticated).toBe(false);
    });
  });
});

describe('/swf status', () => {
  it('reports packet digest, binding observation, and evidence kinds', async () => {
    await withTmpRoot(async (root) => {
      const { ctx, commands } = makeMockCtx();
      const tracker = createSessionTracker(ctx);
      for (const def of createSwfCommands(ctx, tracker)) {
        ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'alpha-task');
      await runCommand(commands, 'bind alpha-task ' + JSON.stringify(input));
      const result = await runCommand(commands, 'status alpha-task ' + root);
      expect(result.kind).toBe('success');
      const body = JSON.parse((result as { text: string }).text);
      expect(body.taskId).toBe('alpha-task');
      expect(body.packetDigest).toBeTruthy();
      expect(body.bindingObservation.status).toBe('match');
      expect(body.evidenceKinds).toEqual(['worker']);
    });
  });

  it('errors when no packet exists', async () => {
    await withTmpRoot(async (root) => {
      const { ctx, commands } = makeMockCtx();
      for (const def of createSwfCommands(ctx, createSessionTracker(ctx))) {
        ctx.commands.register(def);
      }
      const result = await runCommand(commands, 'status alpha-task ' + root);
      expect(result.kind).toBe('error');
      expect((result as { text: string }).text).toContain('no packet');
    });
  });
});

describe('/swf accept', () => {
  it('accepts host-claimed evidence after an explicit dsh approval grant', async () => {
    await withTmpRoot(async (root) => {
      const { ctx, commands, approvalCalls } = makeMockCtx({ approvalOutcome: 'allowed-once' });
      for (const def of createSwfCommands(ctx, createSessionTracker(ctx))) {
        ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'alpha-task');
      await runCommand(commands, 'bind alpha-task ' + JSON.stringify(input));
      const hostClaimed = evidenceRecord({ sessionId: 's-1', provider: 'dsh-sdk', declaredModel: 'deepseek-v4-flash' });
      await writeEvidence({ authorityRoot: root, taskId: 'alpha-task', kind: 'worker', record: hostClaimed });
      const packet = await readPacket(root, 'alpha-task');
      await writeEvidence({
        authorityRoot: root,
        taskId: 'alpha-task',
        kind: 'worker-result',
        record: hostClaimed,
        extra: { runId: 's-1', stopReason: 'completed', packetDigest: packet!.packetDigest }
      });

      const result = await runCommand(commands, 'accept alpha-task ' + root);
      expect(result.kind).toBe('success');
      const body = JSON.parse((result as { text: string }).text);
      expect(body.accepted).toBe(true);
      expect(body.evidenceState).toBe('host-claimed');
      expect(body.humanConfirmed).toBe(true);
      expect(approvalCalls).toHaveLength(1);
      expect(approvalCalls[0]!.toolName).toBe('swf.accept');
      const acceptance = JSON.parse(await readFile(join(root, 'planning', 'active', 'alpha-task', 'evidence', 'acceptance.json'), 'utf8'));
      expect(acceptance.extra.humanConfirmed).toBe(true);
    });
  });

  it('fails closed when approval is not granted', async () => {
    await withTmpRoot(async (root) => {
      const { ctx, commands } = makeMockCtx({ approvalOutcome: 'rejected' });
      for (const def of createSwfCommands(ctx, createSessionTracker(ctx))) {
        ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'alpha-task');
      await runCommand(commands, 'bind alpha-task ' + JSON.stringify(input));
      await writeEvidence({
        authorityRoot: root,
        taskId: 'alpha-task',
        kind: 'worker',
        record: evidenceRecord({ sessionId: 's-1', provider: 'dsh-sdk', declaredModel: 'deepseek-v4-flash' })
      });
      const packet = await readPacket(root, 'alpha-task');
      await writeEvidence({
        authorityRoot: root,
        taskId: 'alpha-task',
        kind: 'worker-result',
        record: evidenceRecord({ sessionId: 's-1', provider: 'dsh-sdk', declaredModel: 'deepseek-v4-flash' }),
        extra: { runId: 's-1', stopReason: 'completed', packetDigest: packet!.packetDigest }
      });
      const result = await runCommand(commands, 'accept alpha-task ' + root);
      expect(result.kind).toBe('error');
      expect((result as { text: string }).text).toContain('not granted');
    });
  });

  it('refuses acceptance when the worker-result belongs to a different run', async () => {
    await withTmpRoot(async (root) => {
      const { ctx, commands } = makeMockCtx({ approvalOutcome: 'allowed-once' });
      for (const def of createSwfCommands(ctx, createSessionTracker(ctx))) {
        ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'alpha-task');
      await runCommand(commands, 'bind alpha-task ' + JSON.stringify(input));
      const hostClaimed = evidenceRecord({ sessionId: 's-1', provider: 'dsh-sdk', declaredModel: 'deepseek-v4-flash' });
      await writeEvidence({ authorityRoot: root, taskId: 'alpha-task', kind: 'worker', record: hostClaimed });
      const packet = await readPacket(root, 'alpha-task');
      await writeEvidence({
        authorityRoot: root,
        taskId: 'alpha-task',
        kind: 'worker-result',
        record: hostClaimed,
        extra: { runId: 'other-run', stopReason: 'completed', packetDigest: packet!.packetDigest }
      });
      const result = await runCommand(commands, 'accept alpha-task ' + root);
      expect(result.kind).toBe('error');
      expect((result as { text: string }).text).toContain('does not match');
    });
  });

  it('rejects unknown evidence even with human confirmation', async () => {
    await withTmpRoot(async (root) => {
      const { ctx, commands } = makeMockCtx({ approvalOutcome: 'allowed-once' });
      for (const def of createSwfCommands(ctx, createSessionTracker(ctx))) {
        ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'alpha-task');
      await runCommand(commands, 'bind alpha-task ' + JSON.stringify(input)); // worker evidence stays unknown
      const result = await runCommand(commands, 'accept alpha-task ' + root);
      expect(result.kind).toBe('error');
      expect((result as { text: string }).text).toContain('unknown');
    });
  });
});
