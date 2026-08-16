// Trio binding validation and sha256 binding decision core.
//
// Ported from harness/trio/core/routing.mjs (assertBindingShape /
// bindingsMatch / assertAuthorityBinding) and harness/trio/core/read.mjs
// (assertTrioBinding / verifyTrioBinding comparison logic) at HEAD 275345d.
// Pure functions only: no filesystem access, no side effects. The plugin
// binds the Assignment Packet (a derived ticket; the Trio planning files are
// the durable authority) to the three Trio planning files via sha256; any
// mismatch is a hard stop (binding_mismatch).

import { createHash } from 'node:crypto';
import path from 'node:path';

import { BINDING_FILES, SHA256_PATTERN, TRIO_FILE_KEYS, TRIO_FILE_KEY_NAMES } from './constants.js';

export interface TrioFileBinding {
  path: string;
  sha256: string;
}

export interface TrioBinding {
  authorityRoot: string;
  taskId: string;
  files: Record<string, TrioFileBinding>;
}

export interface AuthorityBinding {
  binding: TrioBinding;
  bindingObservation: TrioBinding;
}

export interface BindingComparison {
  status: 'match' | 'mismatch';
  matches: boolean;
  mismatches: string[];
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function isValidTaskId(taskId: unknown): boolean {
  return typeof taskId === 'string'
    && taskId.trim() === taskId
    && taskId.length > 0
    && taskId !== '.'
    && taskId !== '..'
    && !path.isAbsolute(taskId)
    && !/[\\/]/.test(taskId)
    && !/[\u0000-\u001f\u007f]/.test(taskId);
}

export function assertValidTaskId(taskId: unknown): asserts taskId is string {
  if (!isValidTaskId(taskId)) {
    const error = new Error(`Invalid task id: ${String(taskId)}`);
    (error as { code?: string }).code = 'ERR_INVALID_TASK_ID';
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isAbsolutePath(value: unknown): value is string {
  return typeof value === 'string' && path.isAbsolute(value);
}

function assertBindingShape(binding: unknown, label: string): asserts binding is TrioBinding {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    throw new Error(`Assignment packet ${label} must be an object.`);
  }
  const source = binding as Record<string, unknown>;
  if (!isAbsolutePath(source.authorityRoot)) {
    throw new Error(`Assignment packet ${label} authorityRoot must be an absolute path.`);
  }
  if (!isValidTaskId(source.taskId)) {
    throw new Error(`Assignment packet ${label} taskId is invalid.`);
  }
  if (!source.files || typeof source.files !== 'object' || Array.isArray(source.files)) {
    throw new Error(`Assignment packet ${label} files must be an object.`);
  }
  const files = source.files as Record<string, unknown>;
  if (Object.keys(files).length !== BINDING_FILES.length
    || BINDING_FILES.some(([key]) => !Object.prototype.hasOwnProperty.call(files, key))) {
    throw new Error(`Assignment packet ${label} must contain exactly three Trio file bindings.`);
  }

  const taskDir = path.join(source.authorityRoot as string, 'planning', 'active', source.taskId as string);
  for (const [key, fileName] of BINDING_FILES) {
    const file = files[key];
    if (!file || typeof file !== 'object'
      || !isAbsolutePath((file as Record<string, unknown>).path)
      || (file as Record<string, unknown>).path !== path.join(taskDir, fileName)
      || typeof (file as Record<string, unknown>).sha256 !== 'string'
      || !SHA256_PATTERN.test((file as Record<string, unknown>).sha256 as string)) {
      throw new Error(`Assignment packet ${label} has an invalid ${key} file binding.`);
    }
  }
}

export function bindingsMatch(left: unknown, right: unknown): boolean {
  const leftSource = left as Record<string, unknown>;
  const rightSource = right as Record<string, unknown>;
  if (leftSource.authorityRoot !== rightSource.authorityRoot || leftSource.taskId !== rightSource.taskId) return false;
  return BINDING_FILES.every(([key]) => {
    const leftFile = (leftSource.files as Record<string, Record<string, unknown>>)[key];
    const rightFile = (rightSource.files as Record<string, Record<string, unknown>>)[key];
    return leftFile.path === rightFile.path
      && String(leftFile.sha256).toLowerCase() === String(rightFile.sha256).toLowerCase();
  });
}

export function assertAuthorityBinding(authority: unknown): asserts authority is AuthorityBinding {
  if (!authority || typeof authority !== 'object' || Array.isArray(authority)) {
    throw new Error('Assignment packet authority must be an object.');
  }
  const source = authority as Record<string, unknown>;
  assertBindingShape(source.binding, 'authority binding');
  assertBindingShape(source.bindingObservation, 'binding observation');
  if (!bindingsMatch(source.binding, source.bindingObservation)) {
    throw new Error('Assignment packet binding observation does not match the authority binding.');
  }
}

// read.mjs assertTrioBinding port (pure decision layer; fs side stays in the
// harness for now). Error codes mirror the harness read/store contracts.
export function assertTrioBinding(binding: unknown): asserts binding is TrioBinding {
  const trioError = (message: string, code: string): never => {
    const error = new Error(message);
    (error as { code?: string }).code = code;
    throw error;
  };
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    trioError('Trio binding must be an object.', 'ERR_TRIO_INVALID_BINDING');
  }
  const source = binding as Record<string, unknown>;
  if (!isAbsolutePath(source.authorityRoot)) {
    trioError('Trio binding authorityRoot must be an absolute path.', 'ERR_TRIO_INVALID_BINDING');
  }
  assertValidTaskId(source.taskId);
  if (!source.files || typeof source.files !== 'object' || Array.isArray(source.files)) {
    trioError('Trio binding files must be an object.', 'ERR_TRIO_INVALID_BINDING');
  }
  const files = source.files as Record<string, unknown>;
  const expectedKeys = TRIO_FILE_KEY_NAMES;
  if (Object.keys(files).length !== expectedKeys.length
    || expectedKeys.some((key) => !Object.prototype.hasOwnProperty.call(files, key))) {
    trioError('Trio binding must include exactly the three Trio files.', 'ERR_TRIO_INVALID_BINDING');
  }

  const taskDir = path.join(source.authorityRoot as string, 'planning', 'active', source.taskId as string);
  for (const fileName of Object.keys(TRIO_FILE_KEYS)) {
    const key = TRIO_FILE_KEYS[fileName];
    const file = files[key];
    const expectedPath = path.join(taskDir, fileName);
    if (!file || typeof file !== 'object'
      || (file as Record<string, unknown>).path !== expectedPath
      || !isAbsolutePath((file as Record<string, unknown>).path)
      || typeof (file as Record<string, unknown>).sha256 !== 'string'
      || !SHA256_PATTERN.test((file as Record<string, unknown>).sha256 as string)) {
      trioError(`Trio binding has an invalid ${key} entry.`, 'ERR_TRIO_INVALID_BINDING');
    }
  }
}

// verifyTrioBinding comparison logic as a pure decision: expected vs observed.
export function compareTrioBindings(expected: unknown, observed: unknown): BindingComparison {
  assertTrioBinding(expected);
  assertTrioBinding(observed);
  const expectedSource = expected as TrioBinding;
  const observedSource = observed as TrioBinding;
  const mismatches: string[] = [];
  for (const key of TRIO_FILE_KEY_NAMES) {
    const expectedFile = expectedSource.files[key];
    const observedFile = observedSource.files[key];
    if (expectedFile.path !== observedFile.path
      || expectedFile.sha256.toLowerCase() !== observedFile.sha256.toLowerCase()) {
      mismatches.push(key);
    }
  }
  return {
    status: mismatches.length === 0 ? 'match' : 'mismatch',
    matches: mismatches.length === 0,
    mismatches
  };
}

export { isRecord };
