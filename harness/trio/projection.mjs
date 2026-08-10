import path from 'node:path';

import { canonicalizeAbsolutePath, validateV2Config } from './config.mjs';

const SURFACES = Object.freeze([
  Object.freeze({ id: 'entry', source: 'harness/trio/templates/entry-policy.md' }),
  Object.freeze({ id: 'trio', relativePath: 'trio/SKILL.md', source: 'harness/trio/skill/SKILL.md' }),
  Object.freeze({ id: 'dev', relativePath: 'trio/dev/SKILL.md', source: 'harness/trio/capabilities/dev/SKILL.md' }),
  Object.freeze({ id: 'office', relativePath: 'trio/office/SKILL.md', source: 'harness/trio/capabilities/office/SKILL.md' }),
  Object.freeze({ id: 'safety', relativePath: 'trio/safety/SKILL.md', source: 'harness/trio/capabilities/safety/SKILL.md' }),
  Object.freeze({ id: 'chiefops', relativePath: 'chiefops/SKILL.md', source: 'harness/trio/governance/chiefops/SKILL.md' })
]);

const APPROVED_TARGET_CONTRACT = Object.freeze({
  codex: Object.freeze({
    kind: 'codex',
    management: 'managed',
    targetScoped: false,
    layouts: Object.freeze({
      workspace: Object.freeze({ entryPath: 'AGENTS.md', skillRoot: '.agents/skills' }),
      'user-global': Object.freeze({ entryPath: '.codex/AGENTS.md', skillRoot: '.agents/skills' })
    })
  }),
  generic: Object.freeze({
    kind: 'generic',
    management: 'manual',
    targetScoped: true,
    layouts: Object.freeze({
      workspace: Object.freeze({ entryPath: 'entry-policy.md', skillRoot: 'skills' }),
      'user-global': Object.freeze({ entryPath: 'entry-policy.md', skillRoot: 'skills' })
    })
  })
});

const PLACEMENT_SCOPES = new Set(['workspace', 'user-global']);
const OBSERVATION_STATES = new Set(['absent', 'managed', 'unmanaged', 'unknown']);
const SHA256_REFERENCE = /^sha256:[0-9a-f]{64}$/u;

function fail(message, code = 'ERR_TRIO_PROJECTION') {
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

function assertSafeSegment(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\') ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail(`${label} must be a safe direct segment.`);
  }
}

function assertSafeRelative(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.startsWith('/') ||
    value.startsWith('\\') ||
    /^[A-Za-z]:/u.test(value) ||
    value.includes('\\') ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail(`${label} must be a safe relative path.`);
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    fail(`${label} contains an unsafe segment.`);
  }
}

function joinRelative(...parts) {
  const segments = parts.flatMap((part) => part.split('/'));
  const value = segments.join('/');
  assertSafeRelative(value, 'projected relative path');
  return value;
}

function validateTargetContract(value) {
  assertExactKeys(value, ['codex', 'generic'], 'targetContract');
  const result = {};
  for (const name of ['codex', 'generic']) {
    const target = value[name];
    const label = `targetContract.${name}`;
    const approved = APPROVED_TARGET_CONTRACT[name];
    assertExactKeys(target, ['kind', 'management', 'targetScoped', 'layouts'], label);
    if (target.kind !== approved.kind) fail(`${label}.kind does not match.`);
    if (target.management !== approved.management) fail(`${label}.management is unsupported.`);
    if (target.targetScoped !== approved.targetScoped) fail(`${label}.targetScoped is unsupported.`);
    assertExactKeys(target.layouts, ['workspace', 'user-global'], `${label}.layouts`);
    const layouts = {};
    for (const scope of ['workspace', 'user-global']) {
      const layout = target.layouts[scope];
      const approvedLayout = approved.layouts[scope];
      assertExactKeys(layout, ['entryPath', 'skillRoot'], `${label}.layouts.${scope}`);
      assertSafeRelative(layout.entryPath, `${label}.layouts.${scope}.entryPath`);
      assertSafeRelative(layout.skillRoot, `${label}.layouts.${scope}.skillRoot`);
      if (
        layout.entryPath !== approvedLayout.entryPath ||
        layout.skillRoot !== approvedLayout.skillRoot
      ) {
        fail(`${label}.layouts.${scope} must match the approved static layout.`);
      }
      layouts[scope] = {
        entryPath: approvedLayout.entryPath,
        skillRoot: approvedLayout.skillRoot
      };
    }
    result[name] = {
      kind: approved.kind,
      management: approved.management,
      targetScoped: approved.targetScoped,
      layouts
    };
  }
  return result;
}

function canonicalJoin(rootInfo, relative, label) {
  assertSafeRelative(relative, label);
  if (rootInfo.flavor === 'posix') {
    return canonicalizeAbsolutePath(path.posix.join(rootInfo.canonical, relative), label).canonical;
  }
  const windowsRoot = rootInfo.canonical.replaceAll('/', '\\');
  const windowsRelative = relative.replaceAll('/', '\\');
  return canonicalizeAbsolutePath(path.win32.join(windowsRoot, windowsRelative), label).canonical;
}

function placementScopeAllowed(configScope, scope) {
  return configScope === 'both' || configScope === scope;
}

function validatePlacement(value, index, targetMap, targetContract) {
  const label = `placements[${index}]`;
  assertExactKeys(value, ['targetId', 'targetPath', 'scope', 'root'], label);
  assertSafeSegment(value.targetId, `${label}.targetId`);
  const target = targetMap.get(value.targetId);
  if (!target) fail(`${label} references an unknown target.`);
  if (!PLACEMENT_SCOPES.has(value.scope)) fail(`${label}.scope is unsupported.`);
  if (!target.paths.includes(value.targetPath)) {
    fail(`${label}.targetPath must exactly match retained target evidence.`);
  }
  const targetPath = canonicalizeAbsolutePath(value.targetPath, `${label}.targetPath`);
  const root = canonicalizeAbsolutePath(value.root, `${label}.root`);
  if (targetPath.flavor !== root.flavor) fail(`${label} mixes path flavors.`);
  if (target.hostKind === 'codex') {
    const expectedTargetPath = canonicalJoin(
      root,
      targetContract.codex.layouts[value.scope].entryPath,
      `${label}.expectedTargetPath`
    );
    if (targetPath.canonical !== expectedTargetPath) {
      fail(`${label}.targetPath must match the Codex ${value.scope} layout under root.`);
    }
  }
  return {
    targetId: value.targetId,
    targetPath: value.targetPath,
    scope: value.scope,
    root: value.root,
    targetPathInfo: targetPath,
    rootInfo: root
  };
}

function validatePlacements(value, config, targetContract) {
  if (!Array.isArray(value)) fail('placements must be an array.');
  const targetMap = new Map(config.targets.map((target) => [target.id, target]));
  const seen = new Set();
  const placements = value.map((placement, index) => {
    const normalized = validatePlacement(placement, index, targetMap, targetContract);
    const key = `${normalized.targetId}\u0000${normalized.targetPathInfo.canonical}`;
    if (seen.has(key)) fail('placements contain a duplicate target/path binding.');
    seen.add(key);
    if (!normalized.targetId || !placementScopeAllowed(config.scope.kind, normalized.scope)) {
      fail(`placements[${index}].scope is not allowed by config scope.`);
    }
    if (!targetMap.get(normalized.targetId).enabled) fail('Disabled targets cannot have placements.');
    return normalized;
  });
  return placements;
}

function validateCardinality(config, placements) {
  const byTarget = new Map();
  for (const placement of placements) {
    const list = byTarget.get(placement.targetId) ?? [];
    list.push(placement);
    byTarget.set(placement.targetId, list);
  }
  for (const target of config.targets) {
    const targetPlacements = byTarget.get(target.id) ?? [];
    if (!target.enabled) {
      if (targetPlacements.length > 0) fail('Disabled targets cannot have placements.');
      continue;
    }
    if (target.hostKind === 'codex') {
      if (target.paths.length === 0) fail('Managed Codex targets require retained paths.');
      const expectedCount = config.scope.kind === 'both' ? 2 : 1;
      if (target.paths.length !== expectedCount || targetPlacements.length !== expectedCount) {
        fail('Managed Codex path and placement cardinality is invalid.');
      }
      const scopes = targetPlacements.map((placement) => placement.scope).sort();
      const expectedScopes = config.scope.kind === 'both'
        ? ['user-global', 'workspace']
        : [config.scope.kind];
      if (scopes.join(',') !== expectedScopes.join(',')) {
        fail('Managed Codex placements must cover the configured scope exactly.');
      }
    } else if (target.paths.length === 0) {
      if (targetPlacements.length > 0) fail('Empty generic targets cannot have placements.');
    } else if (targetPlacements.length !== target.paths.length) {
      fail('Generic target paths must each have exactly one placement.');
    }

    const retained = new Set(target.paths);
    for (const placement of targetPlacements) {
      if (!retained.has(placement.targetPath)) fail('Placement path is not retained by its target.');
    }
  }
  for (const target of config.targets) {
    const targetPlacements = byTarget.get(target.id) ?? [];
    if (new Set(targetPlacements.map((placement) => placement.targetPath)).size !== targetPlacements.length) {
      fail('Target placements contain a duplicate retained path.');
    }
  }
  return byTarget;
}

function destinationFor(target, contract, placement, surface) {
  const layout = contract.layouts[placement.scope];
  const relative = surface.id === 'entry'
    ? layout.entryPath
    : joinRelative(layout.skillRoot, surface.relativePath);
  const scoped = contract.targetScoped
    ? joinRelative('manual', target.id, relative)
    : relative;
  return canonicalJoin(placement.rootInfo, scoped, `${target.id}.${surface.id}.destination`);
}

function validateObservation(value, destination) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`path observation for ${destination} must be a JSON record.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`path observation for ${destination} must not use an inherited prototype.`);
  }
  if (!Object.hasOwn(value, 'state') || !OBSERVATION_STATES.has(value.state)) {
    fail(`path observation for ${destination} has an unsupported state.`);
  }
  const expected = value.state === 'managed' ? ['state', 'identity'] : ['state'];
  assertExactKeys(value, expected, `path observation for ${destination}`);
  if (value.state === 'managed' && (typeof value.identity !== 'string' || !SHA256_REFERENCE.test(value.identity))) {
    fail(`managed path observation for ${destination} needs a sha256 identity.`);
  }
  return value.state === 'managed'
    ? { state: value.state, identity: value.identity }
    : { state: value.state };
}

function normalizeObservations(value, destinations) {
  assertJsonRecord(value, 'pathObservations');
  const prototype = Object.getPrototypeOf(value);
  if (prototype) {
    for (const key of Object.getOwnPropertyNames(prototype)) {
      try {
        const info = canonicalizeAbsolutePath(key, `pathObservations.${key}`);
        if (destinations.has(info.canonical)) {
          fail(`pathObservations inherits a computed destination: ${key}.`);
        }
      } catch (error) {
        if (error?.code !== 'ERR_TRIO_CONFIG') throw error;
      }
    }
  }
  const normalized = new Map();
  for (const destination of Object.keys(value)) {
    const info = canonicalizeAbsolutePath(destination, `pathObservations.${destination}`);
    if (normalized.has(info.canonical)) fail('pathObservations contain a canonical duplicate.');
    if (!destinations.has(info.canonical)) fail(`pathObservations contains an extra destination: ${destination}.`);
    normalized.set(info.canonical, validateObservation(value[destination], destination));
  }
  return normalized;
}

function normalizeOwnershipEntries(config) {
  const entries = new Map();
  for (const entry of config.ownership.entries) {
    const info = canonicalizeAbsolutePath(entry.path, 'ownership.path');
    const key = `${entry.targetId}\u0000${info.canonical}`;
    if (entries.has(key)) fail('ownership contains a duplicate canonical destination.');
    entries.set(key, entry.identity);
  }
  return entries;
}

function descriptorAction(descriptor, observation, ownershipIdentity, managed) {
  if (observation.state === 'absent') {
    return {
      ...descriptor,
      action: 'create',
      execution: managed ? 'managed' : 'manual'
    };
  }
  if (managed && observation.state === 'managed' && ownershipIdentity === observation.identity) {
    return {
      ...descriptor,
      action: 'update',
      execution: 'managed',
      identity: ownershipIdentity
    };
  }
  const reason = observation.state === 'unknown'
    ? 'destination-observation-unknown'
    : observation.state === 'managed' && !ownershipIdentity
      ? 'managed-ownership-unproven'
      : observation.state === 'managed'
        ? 'managed-identity-mismatch'
        : 'destination-unmanaged';
  return {
    ...descriptor,
    action: 'preserve',
    execution: 'manual',
    conflict: true,
    reason
  };
}

export function projectConfig(input) {
  assertExactKeys(input, [
    'config',
    'targetContract',
    'placements',
    'pathObservations'
  ], 'projection input');
  const { config, targetContract, placements, pathObservations } = input;
  const validated = validateV2Config(config);
  const contract = validateTargetContract(targetContract);
  const normalizedPlacements = validatePlacements(placements, validated, contract);
  const byTarget = validateCardinality(validated, normalizedPlacements);
  const ownership = normalizeOwnershipEntries(validated);
  const descriptors = [];
  const conflicts = [];
  const destinationOwners = new Map();

  for (const target of validated.targets) {
    if (!target.enabled) continue;
    const targetContract = contract[target.hostKind];
    const targetPlacements = byTarget.get(target.id) ?? [];
    if (target.hostKind === 'generic' && target.paths.length === 0) {
      conflicts.push({
        targetId: target.id,
        destination: null,
        execution: 'manual_pending',
        reason: 'no-retained-destination'
      });
      continue;
    }
    for (const placement of targetPlacements) {
      for (const surface of SURFACES) {
        const destination = destinationFor(target, targetContract, placement, surface);
        const previous = destinationOwners.get(destination);
        if (previous) {
          fail(`Canonical destination collision between ${previous} and ${target.id}:${surface.id}.`);
        }
        destinationOwners.set(destination, `${target.id}:${surface.id}`);
        descriptors.push({
          targetId: target.id,
          surface: surface.id,
          source: surface.source,
          destination,
          retainedTargetPath: placement.targetPath,
          scope: placement.scope,
          root: placement.root,
          hostKind: target.hostKind,
          management: targetContract.management,
          canonicalDestination: destination
        });
      }
    }
  }

  const observations = normalizeObservations(pathObservations, new Set(destinationOwners.keys()));
  for (const descriptor of descriptors) {
    const observation = observations.get(descriptor.destination) ?? { state: 'unknown' };
    const ownershipIdentity = ownership.get(`${descriptor.targetId}\u0000${descriptor.destination}`) ?? null;
    const result = descriptorAction(
      descriptor,
      observation,
      ownershipIdentity,
      descriptor.management === 'managed'
    );
    descriptors[descriptors.indexOf(descriptor)] = result;
    if (result.conflict) {
      conflicts.push({
        targetId: result.targetId,
        surface: result.surface,
        destination: result.destination,
        reason: result.reason
      });
    }
  }
  return { descriptors, conflicts };
}

export { SURFACES };
