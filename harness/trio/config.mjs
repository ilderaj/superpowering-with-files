import { createHash } from 'node:crypto';
import path from 'node:path';

const TOP_LEVEL_KEYS = Object.freeze([
  'schemaVersion',
  'runtime',
  'scope',
  'targets',
  'ownership',
  'recovery'
]);

const SCOPE_KINDS = Object.freeze(['workspace', 'user-global', 'both']);
const PLACEMENT_SCOPES = Object.freeze(['workspace', 'user-global']);
const HOST_KINDS = Object.freeze(['codex', 'generic']);
const HOST_MODES = Object.freeze(['managed', 'manual']);
const SHA256_REFERENCE = /^sha256:[0-9a-f]{64}$/u;

function fail(message, code = 'ERR_TRIO_CONFIG') {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function assertJsonRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be a JSON record.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${label} must not use an inherited prototype.`);
  }
}

function assertExactKeys(value, keys, label) {
  assertJsonRecord(value, label);
  const expected = new Set(keys);
  const actual = Object.keys(value);
  if (
    actual.length !== keys.length ||
    actual.some((key) => !expected.has(key)) ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) {
    fail(`${label} has an unsupported or missing field.`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() === '') {
    fail(`${label} must be non-empty text.`);
  }
}

function assertOwnField(value, key, label) {
  if (!Object.hasOwn(value, key)) {
    fail(`${label}.${key} must be an own field.`);
  }
  return value[key];
}

function assertSafeSegment(value, label) {
  assertNonEmptyString(value, label);
  if (
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\') ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail(`${label} must be a safe direct segment.`);
  }
}

function canonicalAbsolutePath(value, label) {
  assertNonEmptyString(value, label);
  if (value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(`${label} must be a canonical absolute path.`);
  }

  if (value.startsWith('/')) {
    if (value.startsWith('//') || value.includes('\\') || !path.posix.isAbsolute(value)) {
      fail(`${label} must be a canonical POSIX absolute path.`);
    }
    const segments = value.slice(1).split('/');
    if (segments.length === 0 || segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
      fail(`${label} contains an empty, repeated, or escaping segment.`);
    }
    if (path.posix.normalize(value) !== value) {
      fail(`${label} is not canonical.`);
    }
    return { flavor: 'posix', canonical: value };
  }

  if (/^[A-Za-z]:/u.test(value)) {
    if (!/^[A-Za-z]:[\\/]/u.test(value)) {
      fail(`${label} must be drive-absolute, not drive-relative.`);
    }
    const usesSlash = value.includes('/');
    const usesBackslash = value.includes('\\');
    if (usesSlash && usesBackslash) {
      fail(`${label} must not mix Windows separators.`);
    }
    const separator = usesSlash ? '/' : '\\';
    const segments = value.slice(3).split(separator);
    if (segments.length === 0 || segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
      fail(`${label} contains an empty, repeated, or escaping segment.`);
    }
    const normalized = path.win32.normalize(value).replaceAll('\\', '/');
    const canonical = normalized.toLowerCase();
    if (canonical === `${canonical.slice(0, 3)}/` || canonical.endsWith('/')) {
      fail(`${label} must name a file or directory without a trailing separator.`);
    }
    return { flavor: 'windows', canonical };
  }

  fail(`${label} must be POSIX-absolute or Windows drive-absolute.`);
}

function assertSha256Reference(value, label) {
  if (typeof value !== 'string' || !SHA256_REFERENCE.test(value)) {
    fail(`${label} must be sha256 followed by 64 lowercase hexadecimal characters.`);
  }
}

function normalizeScope(scope) {
  assertExactKeys(scope, ['kind'], 'scope');
  if (!SCOPE_KINDS.includes(scope.kind)) fail('scope.kind is unsupported.');
  return { kind: scope.kind };
}

function normalizeTarget(target, index) {
  const label = `targets[${index}]`;
  assertExactKeys(target, ['id', 'enabled', 'paths', 'hostKind', 'mode'], label);
  assertSafeSegment(target.id, `${label}.id`);
  if (typeof target.enabled !== 'boolean') fail(`${label}.enabled must be boolean.`);
  if (!Array.isArray(target.paths) || !target.paths.every((entry) => typeof entry === 'string')) {
    fail(`${label}.paths must be an array of strings.`);
  }
  const canonicalPaths = target.paths.map((entry, pathIndex) => canonicalAbsolutePath(
    entry,
    `${label}.paths[${pathIndex}]`
  ));
  if (!HOST_KINDS.includes(target.hostKind)) fail(`${label}.hostKind is unsupported.`);
  if (!HOST_MODES.includes(target.mode)) fail(`${label}.mode is unsupported.`);
  if ((target.hostKind === 'codex') !== (target.id === 'codex')) {
    fail('Only the codex target identity may use the codex host kind.');
  }
  if ((target.hostKind === 'codex') !== (target.mode === 'managed')) {
    fail(`${label}.mode does not match hostKind.`);
  }
  return {
    id: target.id,
    enabled: target.enabled,
    paths: [...target.paths],
    hostKind: target.hostKind,
    mode: target.mode,
    canonicalPaths
  };
}

function normalizeOwnership(value, targetIds) {
  assertExactKeys(value, ['source', 'manifestRef', 'entries'], 'ownership');
  assertNonEmptyString(value.source, 'ownership.source');
  if (value.manifestRef !== null) assertSha256Reference(value.manifestRef, 'ownership.manifestRef');
  if (!Array.isArray(value.entries)) fail('ownership.entries must be an array.');

  const seenKeys = new Set();
  const seenPaths = new Set();
  const entries = value.entries.map((entry, index) => {
    const label = `ownership.entries[${index}]`;
    assertExactKeys(entry, ['targetId', 'path', 'identity'], label);
    assertSafeSegment(entry.targetId, `${label}.targetId`);
    if (!targetIds.has(entry.targetId)) fail('ownership entry references an unknown target.');
    const pathInfo = canonicalAbsolutePath(entry.path, `${label}.path`);
    assertSha256Reference(entry.identity, `${label}.identity`);
    const key = `${entry.targetId}\u0000${pathInfo.canonical}`;
    if (seenKeys.has(key)) fail('ownership entries contain a duplicate or ambiguous destination.');
    if (seenPaths.has(pathInfo.canonical)) fail('ownership entries contain a canonical destination collision.');
    seenKeys.add(key);
    seenPaths.add(pathInfo.canonical);
    return {
      targetId: entry.targetId,
      path: entry.path,
      identity: entry.identity
    };
  });
  return {
    source: value.source,
    manifestRef: value.manifestRef,
    entries
  };
}

function normalizeRecovery(value) {
  assertExactKeys(value, ['checkpointRef', 'rollbackRef'], 'recovery');
  for (const key of ['checkpointRef', 'rollbackRef']) {
    if (value[key] !== null) assertNonEmptyString(value[key], `recovery.${key}`);
  }
  return {
    checkpointRef: value.checkpointRef,
    rollbackRef: value.rollbackRef
  };
}

export function validateV2Config(value) {
  assertExactKeys(value, TOP_LEVEL_KEYS, 'V2 config');
  if (value.schemaVersion !== 2) fail('schemaVersion must be 2.');
  if (value.runtime !== 'trio') fail('runtime must be trio.');

  const scope = normalizeScope(value.scope);
  if (!Array.isArray(value.targets)) fail('targets must be an array.');
  const normalizedTargets = value.targets.map(normalizeTarget);
  const targetIds = new Set();
  const pathOwners = new Map();
  const targets = normalizedTargets.map(({ canonicalPaths, ...target }) => {
    if (targetIds.has(target.id)) fail(`Duplicate target id: ${target.id}`);
    targetIds.add(target.id);
    canonicalPaths.forEach(({ canonical }, index) => {
      const previous = pathOwners.get(canonical);
      if (previous) {
        fail(`Duplicate canonical retained path: ${canonical} (${previous} and ${target.id}:${index}).`);
      }
      pathOwners.set(canonical, `${target.id}:${index}`);
    });
    return target;
  });

  return {
    schemaVersion: 2,
    runtime: 'trio',
    scope,
    targets,
    ownership: normalizeOwnership(value.ownership, targetIds),
    recovery: normalizeRecovery(value.recovery)
  };
}

export function parseV2Config(input) {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch (error) {
      fail(`V2 config JSON is invalid: ${error.message}`);
    }
  }
  return validateV2Config(value);
}

function normalizeV1Targets(value) {
  assertJsonRecord(value, 'persistedState.targets');
  return Object.entries(value).map(([id, target]) => {
    const label = `persistedState.targets.${id}`;
    assertJsonRecord(target, label);
    if (!Object.hasOwn(target, 'enabled') || !Object.hasOwn(target, 'paths')) {
      fail(`${label} must declare enabled and paths.`);
    }
    assertSafeSegment(id, `${label}.id`);
    if (typeof target.enabled !== 'boolean') fail(`${label}.enabled must be boolean.`);
    if (!Array.isArray(target.paths) || !target.paths.every((entry) => typeof entry === 'string')) {
      fail(`${label}.paths must be an array of strings.`);
    }
    target.paths.forEach((entry, pathIndex) => canonicalAbsolutePath(entry, `${label}.paths[${pathIndex}]`));
    const hostKind = id === 'codex' ? 'codex' : 'generic';
    return {
      id,
      enabled: target.enabled,
      paths: [...target.paths],
      hostKind,
      mode: hostKind === 'codex' ? 'managed' : 'manual'
    };
  });
}

function manifestBytesAndText(value) {
  if (typeof value === 'string') {
    return { bytes: Buffer.from(value, 'utf8'), text: value };
  }
  if (value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    try {
      return {
        bytes,
        text: new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      };
    } catch {
      fail('projectionManifestJson must be valid UTF-8.');
    }
  }
  fail('projectionManifestJson must be exact UTF-8 JSON text.');
}

function normalizeManifestEntries(manifestJson, manifestRef, targetIds) {
  let manifest;
  try {
    manifest = JSON.parse(manifestJson);
  } catch (error) {
    fail(`projectionManifestJson is invalid: ${error.message}`);
  }
  assertJsonRecord(manifest, 'projection manifest');
  if (!Object.hasOwn(manifest, 'schemaVersion') || manifest.schemaVersion !== 1) {
    fail('projection manifest schemaVersion must be 1.');
  }
  if (!Object.hasOwn(manifest, 'entries') || !Array.isArray(manifest.entries)) {
    fail('projection manifest entries must be an array.');
  }

  const byKey = new Map();
  for (const [index, entry] of manifest.entries.entries()) {
    const label = `projectionManifest.entries[${index}]`;
    assertJsonRecord(entry, label);
    const kind = assertOwnField(entry, 'kind', label);
    const target = assertOwnField(entry, 'target', label);
    assertNonEmptyString(kind, `${label}.kind`);
    assertNonEmptyString(target, `${label}.target`);
    if (!['entry', 'skill'].includes(kind) || !targetIds.has(target)) continue;
    for (const key of ['kind', 'target', 'strategy', 'sourcePath', 'targetPath']) {
      assertNonEmptyString(assertOwnField(entry, key, label), `${label}.${key}`);
    }
    const pathInfo = canonicalAbsolutePath(entry.targetPath, `${label}.targetPath`);
    const tuple = [
      manifestRef,
      kind,
      target,
      entry.strategy,
      entry.sourcePath,
      entry.targetPath
    ];
    const identity = `sha256:${createHash('sha256').update(JSON.stringify(tuple)).digest('hex')}`;
    const key = `${target}\u0000${pathInfo.canonical}`;
    const previous = byKey.get(key);
    if (previous) {
      if (previous.identity !== identity) {
        fail('projection manifest contains conflicting ownership evidence.');
      }
      continue;
    }
    byKey.set(key, { targetId: target, path: entry.targetPath, identity });
  }
  return [...byKey.values()];
}

function normalizeRecoveryInputs(value) {
  assertJsonRecord(value, 'recoveryReferences');
  for (const key of ['checkpointRef', 'rollbackRef']) {
    if (!Object.hasOwn(value, key)) fail(`recoveryReferences.${key} is required.`);
  }
  return normalizeRecovery({
    checkpointRef: value.checkpointRef,
    rollbackRef: value.rollbackRef
  });
}

export function migrateV1ToV2(input) {
  assertExactKeys(input, [
    'persistedState',
    'projectionManifestJson',
    'projectionManifestRef',
    'recoveryReferences'
  ], 'V1 migration input');
  const { persistedState, projectionManifestJson, projectionManifestRef, recoveryReferences } = input;
  assertJsonRecord(persistedState, 'persistedState');
  if (!Object.hasOwn(persistedState, 'schemaVersion') || persistedState.schemaVersion !== 1) {
    fail('persistedState schemaVersion must be 1.');
  }
  if (!Object.hasOwn(persistedState, 'scope')) fail('persistedState.scope is required.');
  const persistedScope = persistedState.scope;
  let scopeKind;
  if (typeof persistedScope === 'string') {
    scopeKind = persistedScope;
  } else {
    assertJsonRecord(persistedScope, 'persistedState.scope');
    scopeKind = assertOwnField(persistedScope, 'kind', 'persistedState.scope');
  }
  if (!PLACEMENT_SCOPES.includes(scopeKind) && scopeKind !== 'both') {
    fail('persistedState.scope is unsupported.');
  }

  const targets = normalizeV1Targets(assertOwnField(persistedState, 'targets', 'persistedState'));
  const targetIds = new Set(targets.map((target) => target.id));
  const { bytes, text } = manifestBytesAndText(projectionManifestJson);
  if (typeof projectionManifestRef !== 'string') fail('projectionManifestRef is required.');
  assertSha256Reference(projectionManifestRef, 'projectionManifestRef');
  const actualRef = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (actualRef !== projectionManifestRef) fail('projectionManifestRef does not match exact manifest bytes.');
  const ownershipEntries = normalizeManifestEntries(text, projectionManifestRef, targetIds);
  const recovery = normalizeRecoveryInputs(recoveryReferences);

  return validateV2Config({
    schemaVersion: 2,
    runtime: 'trio',
    scope: { kind: scopeKind },
    targets,
    ownership: {
      source: 'projection-manifest',
      manifestRef: projectionManifestRef,
      entries: ownershipEntries
    },
    recovery
  });
}

export function canonicalizeAbsolutePath(value) {
  return canonicalAbsolutePath(value, 'path');
}

export { HOST_KINDS, TOP_LEVEL_KEYS };
