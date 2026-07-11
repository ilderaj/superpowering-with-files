import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, chown, open, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const defaultFsOps = { chmod, chown, open, rename, rm, stat, constants };

function configPath(codexHome) {
  return path.join(codexHome, 'config.toml');
}

function getConstants(fsOps) {
  return fsOps.constants ?? constants;
}

function parseRootAssignments(contents) {
  const lines = contents.split(/\n/);
  const entries = {};
  let seenTable = false;

  for (const [lineIndex, line] of lines.entries()) {
    if (/^\s*\[/.test(line)) {
      seenTable = true;
      continue;
    }
    const keyMatch = line.match(/^(\s*(model|model_reasoning_effort)\s*=\s*)("(?:\\.|[^"])*"|'[^']*')(.*)$/);
    const looksLikeRootKey = /^\s*(model|model_reasoning_effort)\s*=/.test(line);
    if (!keyMatch) {
      if (!seenTable && looksLikeRootKey) throw new Error('codex_config_malformed');
      continue;
    }
    if (seenTable) continue;
    const [, prefix, key, literal, suffix] = keyMatch;
    if (!/^\s*(?:#.*)?$/.test(suffix)) throw new Error('codex_config_malformed');
    if (entries[key]) throw new Error('codex_config_duplicate_root_key');
    entries[key] = { value: parseTomlString(literal), lineIndex, prefix, suffix, quote: literal[0] };
  }

  if (!entries.model || !entries.model_reasoning_effort) {
    throw new Error('codex_config_missing_root_key');
  }
  return { lines, entries };
}

function parseTomlString(literal) {
  if (literal.startsWith("'")) return literal.slice(1, -1);
  const body = literal.slice(1, -1);
  let output = '';
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char !== '\\') {
      output += char;
      continue;
    }
    const escape = body[++index];
    const simple = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };
    if (Object.hasOwn(simple, escape)) {
      output += simple[escape];
      continue;
    }
    const digits = escape === 'u' ? 4 : escape === 'U' ? 8 : 0;
    if (!digits) throw new Error('codex_config_malformed');
    const hex = body.slice(index + 1, index + 1 + digits);
    if (!new RegExp(`^[0-9a-fA-F]{${digits}}$`).test(hex)) throw new Error('codex_config_malformed');
    const codePoint = Number.parseInt(hex, 16);
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) throw new Error('codex_config_malformed');
    output += String.fromCodePoint(codePoint);
    index += digits;
  }
  return output;
}

function serializeTomlString(value, quote) {
  if (quote === "'") {
    if (value.includes("'")) throw new Error('codex_config_literal_replacement_unsafe');
    return `'${value}'`;
  }
  return JSON.stringify(value);
}

async function readConfig(codexHome, fsOps) {
  const file = configPath(codexHome);
  let handle;
  try {
    handle = await fsOps.open(file, getConstants(fsOps).O_RDONLY | getConstants(fsOps).O_NOFOLLOW);
  } catch (error) {
    if (error?.code === 'ELOOP') throw new Error('codex_config_symlink');
    throw error;
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error('codex_config_invalid');
    const contents = await handle.readFile({ encoding: 'utf8' });
    return { file, metadata, contents, parsed: parseRootAssignments(contents) };
  } finally {
    await handle.close();
  }
}

export async function readCodexModelDefault({ codexHome, fsOps = defaultFsOps }) {
  const result = await readConfig(codexHome, fsOps);
  return {
    model: result.parsed.entries.model.value,
    reasoningEffort: result.parsed.entries.model_reasoning_effort.value,
    configPath: result.file,
    mode: result.metadata.mode,
    uid: result.metadata.uid,
    gid: result.metadata.gid
  };
}

export async function assessCodexModelDefault({ codexHome, expectedModel, expectedReasoning, fsOps = defaultFsOps }) {
  if (Boolean(expectedModel) !== Boolean(expectedReasoning)) throw new Error('codex_model_expectation_incomplete');
  const observed = await readCodexModelDefault({ codexHome, fsOps });
  if (!expectedModel) return { status: 'unrequested', observed };
  return {
    status: observed.model === expectedModel && observed.reasoningEffort === expectedReasoning ? 'match' : 'mismatch',
    observed
  };
}

function tempPath(file, kind) {
  return path.join(path.dirname(file), `.${path.basename(file)}.${kind}-${randomUUID()}`);
}

async function writeNewFile({ file, metadata, contents, fsOps, retainHandle = false }) {
  const accessMode = retainHandle ? getConstants(fsOps).O_RDWR : getConstants(fsOps).O_WRONLY;
  const flags = accessMode | getConstants(fsOps).O_CREAT | getConstants(fsOps).O_EXCL;
  const handle = await fsOps.open(file, flags, metadata.mode);
  let retained = false;
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await fsOps.chmod(file, metadata.mode);
    await fsOps.chown(file, metadata.uid, metadata.gid);
    if (retainHandle) {
      retained = true;
      return handle;
    }
  } finally {
    if (!retained) await handle.close();
  }
  return null;
}

async function readOpenHandle(handle) {
  const metadata = await handle.stat();
  if (!metadata.isFile()) throw new Error('codex_model_backup_invalid');
  const buffer = Buffer.alloc(metadata.size);
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
    if (bytesRead === 0) throw new Error('codex_model_backup_read_failed');
    offset += bytesRead;
  }
  return buffer;
}

async function recoverFromOpenBackup({ file, metadata, backupHandle, fsOps }) {
  const recoveryTemp = tempPath(file, 'model-recovery-temp');
  try {
    const contents = await readOpenHandle(backupHandle);
    await writeNewFile({ file: recoveryTemp, metadata, contents, fsOps });
    await fsOps.rename(recoveryTemp, file);
  } finally {
    await fsOps.rm(recoveryTemp, { force: true }).catch(() => {});
  }
}

function recoveryError(migrationError, recoveryFailure, backupPath) {
  const error = new Error(
    `codex_model_migration_failed: ${migrationError.message}; codex_model_recovery_failed: ${recoveryFailure.message}; backupPath=${backupPath}`
  );
  error.migrationError = migrationError;
  error.recoveryError = recoveryFailure;
  error.backupPath = backupPath;
  return error;
}

export async function replaceCodexModelDefault({ codexHome, expectedBefore, expectedAfter, fsOps = defaultFsOps }) {
  const result = await readConfig(codexHome, fsOps);
  const before = { model: result.parsed.entries.model.value, reasoningEffort: result.parsed.entries.model_reasoning_effort.value };
  if (before.model !== expectedBefore.model || before.reasoningEffort !== expectedBefore.reasoningEffort) {
    throw new Error('codex_model_expected_before_mismatch');
  }
  if (expectedAfter.reasoningEffort !== before.reasoningEffort) throw new Error('codex_model_reasoning_change_forbidden');

  const backupPath = tempPath(result.file, 'model-backup');
  const replacementTemp = tempPath(result.file, 'model-temp');
  let backupHandle;
  let replaced = false;
  let preserveBackup = false;
  try {
    backupHandle = await writeNewFile({
      file: backupPath,
      metadata: result.metadata,
      contents: result.contents,
      fsOps,
      retainHandle: true
    });

    const { lineIndex, prefix, suffix, quote } = result.parsed.entries.model;
    result.parsed.lines[lineIndex] = prefix + serializeTomlString(expectedAfter.model, quote) + suffix;
    await writeNewFile({ file: replacementTemp, metadata: result.metadata, contents: result.parsed.lines.join('\n'), fsOps });
    const current = await fsOps.stat(result.file);
    if (current.dev !== result.metadata.dev || current.ino !== result.metadata.ino) throw new Error('codex_config_identity_changed');
    await fsOps.rename(replacementTemp, result.file);
    replaced = true;

    const after = await readCodexModelDefault({ codexHome, fsOps });
    if (after.model !== expectedAfter.model || after.reasoningEffort !== expectedAfter.reasoningEffort) {
      throw new Error('codex_model_verify_failed');
    }
    return { backupPath, before, after: { model: after.model, reasoningEffort: after.reasoningEffort } };
  } catch (migrationFailure) {
    if (!replaced) throw migrationFailure;
    try {
      await recoverFromOpenBackup({ file: result.file, metadata: result.metadata, backupHandle, fsOps });
      await fsOps.rm(backupPath, { force: true });
      throw migrationFailure;
    } catch (failure) {
      if (failure === migrationFailure) throw failure;
      preserveBackup = true;
      throw recoveryError(migrationFailure, failure, backupPath);
    }
  } finally {
    await backupHandle?.close();
    await fsOps.rm(replacementTemp, { force: true }).catch(() => {});
    if (!preserveBackup && !replaced) await fsOps.rm(backupPath, { force: true }).catch(() => {});
  }
}
