import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  assessCodexModelDefault,
  readCodexModelDefault,
  replaceCodexModelDefault
} from '../../harness/installer/lib/codex-model-config.mjs';
import { codexModelDefault } from '../../harness/installer/commands/codex-model-default.mjs';

test('reads only root model keys before the first table and requires complete opt-in expectation', async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'codex-model-config-'));
  try {
    await writeFile(
      path.join(codexHome, 'config.toml'),
      'model = "model-a # literal"\nmodel_reasoning_effort = "high"\n[profiles]\nmodel = "ignored"\n'
    );
    const result = await readCodexModelDefault({ codexHome });
    assert.equal(result.model, 'model-a # literal');
    assert.equal(result.reasoningEffort, 'high');
    await assert.rejects(
      () => assessCodexModelDefault({ codexHome, expectedModel: 'model-a # literal' }),
      /codex_model_expectation_incomplete/
    );
  } finally {
    await rm(codexHome, { recursive: true, force: true });
  }
});

test('accepts TOML literal and basic strings but rejects JSON-only escapes', async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'codex-model-config-'));
  try {
    await writeFile(
      path.join(codexHome, 'config.toml'),
      "model = 'model-\\q # literal' # TOML literal\nmodel_reasoning_effort = \"high\\u0021\"\n"
    );
    const result = await readCodexModelDefault({ codexHome });
    assert.equal(result.model, 'model-\\q # literal');
    assert.equal(result.reasoningEffort, 'high!');

    await writeFile(path.join(codexHome, 'config.toml'), 'model = "model-\\x41"\nmodel_reasoning_effort = "high"\n');
    await assert.rejects(() => readCodexModelDefault({ codexHome }), /codex_config_malformed/);
  } finally {
    await rm(codexHome, { recursive: true, force: true });
  }
});

test('migrates only the root model and returns a manual recovery artifact', async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'codex-model-config-'));
  try {
    const configPath = path.join(codexHome, 'config.toml');
    await writeFile(configPath, 'model = "model-a"\nmodel_reasoning_effort = "high"\n[table]\nmodel = "ignored"\n');
    const result = await replaceCodexModelDefault({
      codexHome,
      expectedBefore: { model: 'model-a', reasoningEffort: 'high' },
      expectedAfter: { model: 'model-b', reasoningEffort: 'high' }
    });
    assert.match(result.backupPath, /config\.toml\.model-backup-/);
    assert.match(await readFile(configPath, 'utf8'), /^model = "model-b"/);
    assert.match(await readFile(configPath, 'utf8'), /\[table\]\nmodel = "ignored"/);

    assert.equal('backupProvenance' in result, false);
    assert.match(await readFile(result.backupPath, 'utf8'), /^model = "model-a"/);
  } finally {
    await rm(codexHome, { recursive: true, force: true });
  }
});

test('removes the public rollback API and recovers only from the open backup handle', async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'codex-model-config-'));
  const configPath = path.join(codexHome, 'config.toml');
  const config = await import('../../harness/installer/lib/codex-model-config.mjs');
  try {
    await writeFile(configPath, 'model = "model-a"\nmodel_reasoning_effort = "high"\n');
    assert.equal('rollbackCodexModelDefault' in config, false);

    let backupPath;
    let configOpenCount = 0;
    let attackerInstalled = false;
    let reopenedBackupPath = false;
    const fs = await import('node:fs/promises');
    const fsOps = {
      ...fs,
      async rename(from, to) {
        await fs.rename(from, to);
        if (to === configPath && from.includes('.model-temp-')) {
          backupPath = (await fs.readdir(codexHome)).find((name) => name.includes('.model-backup-'));
          await fs.unlink(path.join(codexHome, backupPath));
          await fs.writeFile(path.join(codexHome, backupPath), 'attacker replacement');
          attackerInstalled = true;
        }
      },
      async open(file, ...args) {
        if (attackerInstalled && file === path.join(codexHome, backupPath)) reopenedBackupPath = true;
        const handle = await fs.open(file, ...args);
        if (file === configPath && ++configOpenCount === 2) {
          return {
            stat: () => handle.stat(),
            readFile: async () => { throw new Error('post_verify_failed'); },
            close: () => handle.close()
          };
        }
        return handle;
      }
    };
    await assert.rejects(
      () => replaceCodexModelDefault({
        codexHome,
        expectedBefore: { model: 'model-a', reasoningEffort: 'high' },
        expectedAfter: { model: 'model-b', reasoningEffort: 'high' },
        fsOps
      }),
      /post_verify_failed/
    );
    assert.match(await readFile(configPath, 'utf8'), /^model = "model-a"/);
    assert.equal(reopenedBackupPath, false);
    await assert.rejects(() => fs.readFile(path.join(codexHome, backupPath), 'utf8'), /ENOENT/);
  } finally {
    await rm(codexHome, { recursive: true, force: true });
  }
});

test('keeps the backup creation handle open across pathname replacement and closes it once', async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'codex-model-config-'));
  const configPath = path.join(codexHome, 'config.toml');
  const original = 'model = "model-a"\nmodel_reasoning_effort = "high"\n';
  try {
    await writeFile(configPath, original);
    const fs = await import('node:fs/promises');
    let backupPath;
    let backupOpenCount = 0;
    let backupCloseCount = 0;
    let configOpenCount = 0;
    let attackerInstalled = false;
    const fsOps = {
      ...fs,
      async open(file, ...args) {
        const handle = await fs.open(file, ...args);
        if (file.includes('.model-backup-')) {
          backupPath = file;
          backupOpenCount += 1;
          return new Proxy(handle, {
            get(target, property) {
              if (property === 'close') return async () => { backupCloseCount += 1; return target.close(); };
              const value = target[property];
              return typeof value === 'function' ? value.bind(target) : value;
            }
          });
        }
        if (file === configPath && ++configOpenCount === 2) {
          return {
            stat: () => handle.stat(),
            readFile: async () => { throw new Error('post_verify_failed'); },
            close: () => handle.close()
          };
        }
        return handle;
      },
      async chown(file, uid, gid) {
        await fs.chown(file, uid, gid);
        if (!attackerInstalled && file.includes('.model-backup-')) {
          attackerInstalled = true;
          await fs.unlink(file);
          await fs.writeFile(file, 'attacker replacement');
        }
      }
    };
    await assert.rejects(
      replaceCodexModelDefault({
        codexHome,
        expectedBefore: { model: 'model-a', reasoningEffort: 'high' },
        expectedAfter: { model: 'model-b', reasoningEffort: 'high' },
        fsOps
      }),
      /post_verify_failed/
    );
    assert.equal(await readFile(configPath, 'utf8'), original);
    assert.equal(backupOpenCount, 1);
    assert.equal(backupCloseCount, 1);
    await assert.rejects(() => readFile(backupPath, 'utf8'), /ENOENT/);
  } finally {
    await rm(codexHome, { recursive: true, force: true });
  }
});

test('preserves the original backup and reports both errors when recovery fails', async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'codex-model-config-'));
  const configPath = path.join(codexHome, 'config.toml');
  try {
    await writeFile(configPath, 'model = "model-a"\nmodel_reasoning_effort = "high"\n');
    const fs = await import('node:fs/promises');
    let configOpenCount = 0;
    let configRenames = 0;
    const fsOps = {
      ...fs,
      async open(file, ...args) {
        const handle = await fs.open(file, ...args);
        if (file === configPath && ++configOpenCount === 2) {
          return { stat: () => handle.stat(), readFile: async () => { throw new Error('post_verify_failed'); }, close: () => handle.close() };
        }
        return handle;
      },
      async rename(from, to) {
        if (to === configPath && ++configRenames === 2) throw new Error('recovery_rename_failed');
        return fs.rename(from, to);
      }
    };
    let error;
    try {
      await replaceCodexModelDefault({
        codexHome,
        expectedBefore: { model: 'model-a', reasoningEffort: 'high' },
        expectedAfter: { model: 'model-b', reasoningEffort: 'high' },
        fsOps
      });
      assert.fail('expected recovery failure');
    } catch (caught) {
      error = caught;
    }
    assert.match(error.message, /post_verify_failed/);
    assert.match(error.message, /recovery_rename_failed/);
    assert.match(error.message, /backupPath=/);
    assert.match(await readFile(configPath, 'utf8'), /^model = "model-b"/);
    assert.equal((await fs.readdir(codexHome)).some((name) => name.includes('.model-backup-')), true);
  } finally {
    await rm(codexHome, { recursive: true, force: true });
  }
});

test('rejects config and backup symlinks', async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'codex-model-config-'));
  const target = await mkdtemp(path.join(os.tmpdir(), 'codex-model-target-'));
  try {
    await writeFile(path.join(target, 'config.toml'), 'model = "model-a"\nmodel_reasoning_effort = "high"\n');
    await symlink(path.join(target, 'config.toml'), path.join(codexHome, 'config.toml'));
    await assert.rejects(() => readCodexModelDefault({ codexHome }), /codex_config_symlink/);
  } finally {
    await rm(codexHome, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test('codexModelDefault rejects incomplete opt-in assessment flags', async () => {
  await assert.rejects(
    () => codexModelDefault(['assess', '--expected-model=model-a']),
    /expected-model and expected-reasoning must be supplied together/
  );
});

test('codexModelDefault CLI performs isolated inspect, assess, and migrate without rollback', async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'codex-model-config-'));
  const originalWrite = process.stdout.write;
  const output = [];
  process.stdout.write = (chunk) => { output.push(String(chunk)); return true; };
  try {
    await writeFile(path.join(codexHome, 'config.toml'), 'model = "model-a"\nmodel_reasoning_effort = "high"\n');
    await codexModelDefault(['inspect', '--codex-home', codexHome]);
    assert.equal(JSON.parse(output.pop()).model, 'model-a');
    await codexModelDefault(['assess', '--codex-home', codexHome, '--expected-model', 'model-a', '--expected-reasoning', 'high']);
    assert.equal(JSON.parse(output.pop()).status, 'match');
    await codexModelDefault(['migrate', '--codex-home', codexHome, '--expected-model', 'model-a', '--expected-reasoning', 'high', '--model', 'model-b', '--reasoning', 'high']);
    const migrated = JSON.parse(output.pop());
    await assert.rejects(() => codexModelDefault(['rollback', '--codex-home', codexHome]), /Unknown codex-model-default command/);
  } finally {
    process.stdout.write = originalWrite;
    await rm(codexHome, { recursive: true, force: true });
  }
});
