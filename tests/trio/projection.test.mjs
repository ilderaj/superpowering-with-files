import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseV2Config } from '../../harness/trio/config.mjs';
import { projectConfig } from '../../harness/trio/projection.mjs';
import { readState, writeState } from '../../harness/installer/lib/state.mjs';
import { adjudicatePermission } from '../../harness/trio/core/routing.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APPROVED_TARGET_CONTRACT = Object.freeze({
  codex: {
    kind: 'codex',
    management: 'managed',
    targetScoped: false,
    layouts: {
      workspace: { entryPath: 'AGENTS.md', skillRoot: '.agents/skills' },
      'user-global': { entryPath: '.codex/AGENTS.md', skillRoot: '.agents/skills' }
    }
  },
  generic: {
    kind: 'generic',
    management: 'manual',
    targetScoped: true,
    layouts: {
      workspace: { entryPath: 'entry-policy.md', skillRoot: 'skills' },
      'user-global': { entryPath: 'entry-policy.md', skillRoot: 'skills' }
    }
  }
});
const RUNTIME_TARGET_CONTRACT = JSON.parse(await readFile(
  path.join(REPO_ROOT, 'harness/trio/runtime-targets.json'),
  'utf8'
));
const MATERIALIZED_TRIO_OUTPUTS = Object.freeze([
  ['harness/trio/templates/entry-policy.md', 'AGENTS.md'],
  ['harness/trio/skill/SKILL.md', '.agents/skills/trio/SKILL.md'],
  ['harness/trio/capabilities/dev/SKILL.md', '.agents/skills/trio/dev/SKILL.md'],
  ['harness/trio/capabilities/office/SKILL.md', '.agents/skills/trio/office/SKILL.md'],
  ['harness/trio/capabilities/safety/SKILL.md', '.agents/skills/trio/safety/SKILL.md']
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function identity(label) {
  return `sha256:${sha256(label)}`;
}

function codexTarget(targetPath = '/fixture/home/.codex/AGENTS.md', enabled = true) {
  return {
    id: 'codex',
    enabled,
    paths: targetPath === null ? [] : [targetPath],
    hostKind: 'codex',
    mode: 'managed'
  };
}

function genericTarget(id, targetPath, enabled = true) {
  return {
    id,
    enabled,
    paths: targetPath === null ? [] : [targetPath],
    hostKind: 'generic',
    mode: 'manual'
  };
}

function validConfig({
  scope = 'user-global',
  targets = [codexTarget()],
  ownership = { source: 'caller-observation', manifestRef: null, entries: [] },
  recovery = { checkpointRef: null, rollbackRef: null }
} = {}) {
  return {
    schemaVersion: 2,
    runtime: 'trio',
    scope: { kind: scope },
    targets,
    ownership,
    recovery
  };
}

function targetContract() {
  return structuredClone(RUNTIME_TARGET_CONTRACT);
}

function withObjectPrototypeValues(values, callback) {
  const previous = new Map();
  try {
    for (const [key, value] of Object.entries(values)) {
      previous.set(key, Object.getOwnPropertyDescriptor(Object.prototype, key));
      Object.defineProperty(Object.prototype, key, {
        configurable: true,
        enumerable: false,
        writable: true,
        value
      });
    }
    return callback();
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(Object.prototype, key, descriptor);
      else delete Object.prototype[key];
    }
  }
}

function codexDestinations(root, scope = 'user-global') {
  const entry = scope === 'workspace' ? `${root}/AGENTS.md` : `${root}/.codex/AGENTS.md`;
  return [
    entry,
    `${root}/.agents/skills/trio/SKILL.md`,
    `${root}/.agents/skills/trio/dev/SKILL.md`,
    `${root}/.agents/skills/trio/office/SKILL.md`,
    `${root}/.agents/skills/trio/safety/SKILL.md`,
    `${root}/.agents/skills/chiefops/SKILL.md`
  ];
}

function genericDestinations(root, targetId) {
  const base = `${root}/manual/${targetId}`;
  return [
    `${base}/entry-policy.md`,
    `${base}/skills/trio/SKILL.md`,
    `${base}/skills/trio/dev/SKILL.md`,
    `${base}/skills/trio/office/SKILL.md`,
    `${base}/skills/trio/safety/SKILL.md`,
    `${base}/skills/chiefops/SKILL.md`
  ];
}

function placement(targetId, targetPath, scope = 'user-global', root = '/fixture/home') {
  return { targetId, targetPath, scope, root };
}

function absentObservations(destinations) {
  return Object.fromEntries(destinations.map((destination) => [destination, { state: 'absent' }]));
}

function projectWithAbsent(config, placements, contract = targetContract()) {
  const destinations = projectConfig({
    config,
    targetContract: contract,
    placements,
    pathObservations: {}
  }).descriptors.map((descriptor) => descriptor.destination);
  return projectConfig({
    config,
    targetContract: contract,
    placements,
    pathObservations: absentObservations(destinations)
  });
}

function markdownSection(markdown, heading) {
  const start = markdown.indexOf(`## ${heading}`);
  assert.notEqual(start, -1, `Missing section: ${heading}`);
  const rest = markdown.slice(start + heading.length + 3);
  const next = rest.indexOf('\n## ');
  return next === -1 ? rest : rest.slice(0, next);
}

function assertEntryPolicyContract(markdown) {
  const route = markdownSection(markdown, 'Route First');
  assert.match(route, /Route first, then choose effort or execution topology\./i);
  assert.match(route, /before a worker, fan-out, or effort intent is selected/i);

  const authority = markdownSection(markdown, 'Durable Authority');
  assert.match(authority, /sole durable task authority/i);
  assert.match(authority, /Host owns worker lifecycle, continuation, permissions/i);
  assert.match(authority, /Actual model and effort remain unknown without authenticated Host evidence/i);

  const capability = markdownSection(markdown, 'Capability Selection');
  assert.match(capability, /Each task selects exactly one capability family: `dev`, `office`, or `safety`/i);
  assert.match(capability, /not a durable task type/i);
  assert.match(capability, /creates no authority/i);

  const inventory = markdownSection(markdown, 'Projected Inventory');
  assert.match(inventory, /entry policy/i);
  assert.match(inventory, /trio\/SKILL\.md/i);
  assert.match(inventory, /trio\/dev\/SKILL\.md/i);
  assert.match(inventory, /trio\/office\/SKILL\.md/i);
  assert.match(inventory, /trio\/safety\/SKILL\.md/i);
  assert.match(inventory, /chiefops\/SKILL\.md/i);
  assert.match(inventory, /governance companion/i);
  assert.match(inventory, /not a fifth capability pack/i);
  assert.match(inventory, /not a runner/i);

  const gates = markdownSection(markdown, 'Human Gates');
  assert.match(gates, /applicable Host and human gate/i);
  assert.match(gates, /Routing never grants permission/i);
  assert.match(gates, /worker completion remains a candidate until Chief acceptance and Trio writeback/i);
}

test('V2 config and projection expose pure public seams', () => {
  const config = parseV2Config(validConfig());
  const result = projectWithAbsent(
    config,
    [placement('codex', '/fixture/home/.codex/AGENTS.md')]
  );

  assert.deepEqual(Object.keys(config), [
    'schemaVersion',
    'runtime',
    'scope',
    'targets',
    'ownership',
    'recovery'
  ]);
  assert.equal(config.targets[0].paths[0], '/fixture/home/.codex/AGENTS.md');
  assert.equal(result.descriptors.length, 6);
  assert.deepEqual(result.descriptors.map((descriptor) => descriptor.action), [
    'create',
    'create',
    'create',
    'create',
    'create',
    'create'
  ]);
  assert.deepEqual(result.descriptors.map((descriptor) => descriptor.destination), codexDestinations('/fixture/home'));
});

test('projection wrapper requires exactly four own fields', () => {
  const wrapper = {
    config: parseV2Config(validConfig({
      targets: [
        codexTarget(),
        genericTarget('cursor', '/fixture/home/.cursor/instructions/trio.md')
      ]
    })),
    targetContract: targetContract(),
    placements: [
      placement('codex', '/fixture/home/.codex/AGENTS.md'),
      placement('cursor', '/fixture/home/.cursor/instructions/trio.md')
    ],
    pathObservations: {}
  };

  assert.equal(projectConfig(wrapper).descriptors.length, 12);
  assert.equal(projectConfig(JSON.parse(JSON.stringify(wrapper))).descriptors.length, 12);
  withObjectPrototypeValues(wrapper, () => {
    assert.throws(
      () => projectConfig({}),
      (error) => error?.code === 'ERR_TRIO_PROJECTION'
    );
  });

  for (const key of Object.keys(wrapper)) {
    const missing = { ...wrapper };
    delete missing[key];
    assert.throws(
      () => projectConfig(missing),
      (error) => error?.code === 'ERR_TRIO_PROJECTION'
    );
  }
  assert.throws(
    () => projectConfig({ ...wrapper, extra: true }),
    (error) => error?.code === 'ERR_TRIO_PROJECTION'
  );
});

test('projection preserves evidence paths while using caller placements for Host layout', () => {
  const config = parseV2Config(validConfig({
    ownership: {
      source: 'projection-manifest',
      manifestRef: identity('manifest'),
      entries: [
        { targetId: 'codex', path: '/fixture/home/.agents/skills/trio/SKILL.md', identity: identity('trio') }
      ]
    }
  }));
  const destinations = codexDestinations('/fixture/home');
  const result = projectConfig({
    config,
    targetContract: targetContract(),
    placements: [placement('codex', '/fixture/home/.codex/AGENTS.md')],
    pathObservations: {
      [destinations[0]]: { state: 'absent' },
      [destinations[1]]: { state: 'managed', identity: identity('trio') },
      [destinations[2]]: { state: 'unmanaged' },
      [destinations[3]]: { state: 'unknown' },
      [destinations[4]]: { state: 'managed', identity: identity('other') },
      [destinations[5]]: { state: 'absent' }
    }
  });

  assert.deepEqual(result.descriptors.map((descriptor) => descriptor.action), [
    'create',
    'update',
    'preserve',
    'preserve',
    'preserve',
    'create'
  ]);
  assert.equal(result.descriptors[1].retainedTargetPath, '/fixture/home/.codex/AGENTS.md');
  assert.equal(result.descriptors[1].destination, '/fixture/home/.agents/skills/trio/SKILL.md');
  assert.equal(result.descriptors.some((descriptor) => descriptor.action === 'overwrite'), false);
  assert.equal(result.conflicts.length, 3);
});

test('generic targets use target-scoped manual destinations and never update', () => {
  const config = parseV2Config(validConfig({
    targets: [genericTarget('cursor', '/fixture/home/.cursor/instructions/trio.md')]
  }));
  const placementRecord = placement(
    'cursor',
    '/fixture/home/.cursor/instructions/trio.md'
  );
  const result = projectWithAbsent(config, [placementRecord]);
  const destinations = genericDestinations('/fixture/home', 'cursor');

  assert.deepEqual(result.descriptors.map((descriptor) => descriptor.destination), destinations);
  assert.equal(result.descriptors.every((descriptor) => descriptor.execution === 'manual'), true);
  assert.equal(result.descriptors.every((descriptor) => descriptor.action === 'create'), true);

  const existing = projectConfig({
    config,
    targetContract: targetContract(),
    placements: [placementRecord],
    pathObservations: {
      [destinations[0]]: { state: 'managed', identity: identity('cursor-entry') }
    }
  });
  assert.equal(existing.descriptors[0].action, 'preserve');
  assert.equal(existing.descriptors[0].conflict, true);
  assert.equal(existing.descriptors.some((descriptor) => descriptor.action === 'update'), false);
});

test('generic empty paths return an explicit manual pending conflict', () => {
  const config = parseV2Config(validConfig({
    targets: [genericTarget('cursor', null)]
  }));
  const result = projectConfig({
    config,
    targetContract: targetContract(),
    placements: [],
    pathObservations: {}
  });

  assert.deepEqual(result.descriptors, []);
  assert.deepEqual(result.conflicts, [{
    targetId: 'cursor',
    destination: null,
    execution: 'manual_pending',
    reason: 'no-retained-destination'
  }]);
});

test('managed Codex scope cardinality is exact and two-sided', () => {
  const workspacePath = '/fixture/workspace/AGENTS.md';
  const globalPath = '/fixture/home/.codex/AGENTS.md';
  const validBoth = parseV2Config(validConfig({
    scope: 'both',
    targets: [{ ...codexTarget(workspacePath), paths: [workspacePath, globalPath] }]
  }));
  const bothResult = projectWithAbsent(validBoth, [
    placement('codex', workspacePath, 'workspace', '/fixture/workspace'),
    placement('codex', globalPath, 'user-global', '/fixture/home')
  ]);
  assert.equal(bothResult.descriptors.length, 12);
  assert.deepEqual(
    [...new Set(bothResult.descriptors.map((descriptor) => descriptor.destination))].sort(),
    [...codexDestinations('/fixture/workspace', 'workspace'), ...codexDestinations('/fixture/home')].sort()
  );

  const invalidCases = [
    [
      validConfig({ scope: 'workspace', targets: [codexTarget(null)] }),
      [],
      /managed Codex|cardinality|empty/i
    ],
    [
      validConfig({ scope: 'user-global', targets: [{ ...codexTarget(), paths: [globalPath, '/fixture/other/AGENTS.md'] }] }),
      [placement('codex', globalPath)],
      /cardinality|placement/i
    ],
    [
      validBoth,
      [placement('codex', workspacePath, 'workspace', '/fixture/workspace')],
      /both|two|placement|cardinality/i
    ],
    [
      validBoth,
      [
        placement('codex', workspacePath, 'user-global', '/fixture/workspace'),
        placement('codex', globalPath, 'user-global', '/fixture/home')
      ],
      /scope|workspace|global/i
    ],
    [
      validBoth,
      [
        placement('codex', workspacePath, 'workspace', '/fixture/workspace'),
        placement('codex', workspacePath, 'workspace', '/fixture/workspace')
      ],
      /duplicate|ambiguous|placement/i
    ]
  ];
  for (const [configInput, placements, pattern] of invalidCases) {
    assert.throws(
      () => projectConfig({
        config: configInput,
        targetContract: targetContract(),
        placements,
        pathObservations: {}
      }),
      pattern
    );
  }

  const disabled = parseV2Config(validConfig({
    targets: [codexTarget(null, false)]
  }));
  const disabledResult = projectConfig({
    config: disabled,
    targetContract: targetContract(),
    placements: [],
    pathObservations: {}
  });
  assert.deepEqual(disabledResult, { descriptors: [], conflicts: [] });
});

test('placement identity and scope must bind retained absolute evidence', () => {
  const config = parseV2Config(validConfig());
  for (const badPlacement of [
    placement('codex', '/fixture/other/AGENTS.md'),
    placement('codex', '/fixture/home/.codex/AGENTS.md', 'workspace', '/fixture/home'),
    placement('codex', '/fixture/home/.codex/AGENTS.md', 'user-global', 'C:/fixture/home'),
    { targetId: 'codex', targetPath: '/fixture/home/.codex/AGENTS.md', scope: 'user-global' }
  ]) {
    assert.throws(
      () => projectConfig({
        config,
        targetContract: targetContract(),
        placements: [badPlacement],
        pathObservations: {}
      }),
      /placement|retained|root|scope|absolute/i
    );
  }
});

test('managed Codex workspace placement requires its exact layout root', () => {
  const retainedPath = '/fixture/workspace/AGENTS.md';
  const config = parseV2Config(validConfig({
    scope: 'workspace',
    targets: [codexTarget(retainedPath)]
  }));

  assert.throws(
    () => projectConfig({
      config,
      targetContract: targetContract(),
      placements: [placement('codex', retainedPath, 'workspace', '/fixture/wrong-workspace')],
      pathObservations: {}
    }),
    /targetPath|layout|root|Codex/i
  );
});

test('managed Codex user-global placement requires its exact layout root', () => {
  const retainedPath = '/fixture/home/.codex/AGENTS.md';
  const config = parseV2Config(validConfig({ targets: [codexTarget(retainedPath)] }));

  assert.throws(
    () => projectConfig({
      config,
      targetContract: targetContract(),
      placements: [placement('codex', retainedPath, 'user-global', '/fixture/wrong-home')],
      pathObservations: {}
    }),
    /targetPath|layout|root|Codex/i
  );
});

test('managed Codex rejects unmatched retained evidence instead of treating it as a join root', () => {
  const retainedPath = '/fixture/archive/custom-entry.md';
  const config = parseV2Config(validConfig({ targets: [codexTarget(retainedPath)] }));

  assert.throws(
    () => projectConfig({
      config,
      targetContract: targetContract(),
      placements: [placement('codex', retainedPath, 'user-global', '/fixture/home')],
      pathObservations: {}
    }),
    /targetPath|layout|root|Codex/i
  );
});

test('managed Codex both scope rejects workspace and user-global relabeling', () => {
  const workspacePath = '/fixture/workspace/AGENTS.md';
  const globalPath = '/fixture/home/.codex/AGENTS.md';
  const config = parseV2Config(validConfig({
    scope: 'both',
    targets: [{ ...codexTarget(workspacePath), paths: [workspacePath, globalPath] }]
  }));

  assert.throws(
    () => projectConfig({
      config,
      targetContract: targetContract(),
      placements: [
        placement('codex', workspacePath, 'user-global', '/fixture/workspace'),
        placement('codex', globalPath, 'workspace', '/fixture/home')
      ],
      pathObservations: {}
    }),
    /targetPath|layout|root|Codex/i
  );
});

test('projection requires the approved target contract values before descriptors', () => {
  const config = parseV2Config(validConfig());
  const placements = [placement('codex', '/fixture/home/.codex/AGENTS.md')];
  const mutations = [
    ['codex entry', (contract) => { contract.codex.layouts['user-global'].entryPath = 'rogue-entry.md'; }],
    ['codex skill root', (contract) => { contract.codex.layouts.workspace.skillRoot = '.rogue/skills'; }],
    ['generic entry', (contract) => { contract.generic.layouts.workspace.entryPath = 'rogue-entry.md'; }],
    ['generic skill root', (contract) => { contract.generic.layouts['user-global'].skillRoot = 'rogue-skills'; }],
    ['generic management', (contract) => { contract.generic.management = 'managed'; }]
  ];
  const accepted = [];

  for (const [label, mutate] of mutations) {
    const contract = targetContract();
    mutate(contract);
    try {
      projectConfig({ config, targetContract: contract, placements, pathObservations: {} });
      accepted.push(label);
    } catch {
      // The public seam must reject all contract drift before descriptors exist.
    }
  }

  assert.deepEqual(accepted, []);
});

test('projection rejects inherited, extra, and canonical-duplicate observations', () => {
  const config = parseV2Config(validConfig());
  const placements = [placement('codex', '/fixture/home/.codex/AGENTS.md')];
  const destinations = codexDestinations('/fixture/home');

  const inherited = Object.create({ [destinations[0]]: { state: 'absent' } });
  assert.throws(
    () => projectConfig({ config, targetContract: targetContract(), placements, pathObservations: inherited }),
    /plain|prototype|record/i
  );

  const extra = { ...absentObservations(destinations), '/fixture/home/extra.md': { state: 'absent' } };
  assert.throws(
    () => projectConfig({ config, targetContract: targetContract(), placements, pathObservations: extra }),
    /extra|observation|destination/i
  );

  const windows = parseV2Config(validConfig({
    targets: [genericTarget('cursor', 'C:/Fixture/Home/entry.md')]
  }));
  const windowPlacement = placement('cursor', 'C:/Fixture/Home/entry.md', 'user-global', 'C:/Fixture/Home');
  assert.throws(
    () => projectConfig({
      config: windows,
      targetContract: targetContract(),
      placements: [windowPlacement],
      pathObservations: {
        'C:/Fixture/Home/manual/cursor/entry-policy.md': { state: 'absent' },
        'c:\\fixture\\home\\manual\\cursor\\entry-policy.md': { state: 'absent' }
      }
    }),
    /duplicate|canonical|observation/i
  );
});

test('projection rejects a computed destination inherited from Object.prototype', () => {
  const config = parseV2Config(validConfig());
  const placements = [placement('codex', '/fixture/home/.codex/AGENTS.md')];
  const destination = codexDestinations('/fixture/home')[0];
  assert.equal(Object.getOwnPropertyDescriptor(Object.prototype, destination), undefined);

  Object.defineProperty(Object.prototype, destination, {
    configurable: true,
    enumerable: true,
    value: { state: 'absent' }
  });
  try {
    assert.throws(
      () => projectConfig({ config, targetContract: targetContract(), placements, pathObservations: {} }),
      /inherited|own|observation|prototype/i
    );
  } finally {
    delete Object.prototype[destination];
  }
});

test('projection rejects global lexical destination collisions before actions', () => {
  const config = parseV2Config(validConfig({
    targets: [{
      ...genericTarget('cursor', '/fixture/evidence/cursor-a.md'),
      paths: ['/fixture/evidence/cursor-a.md', '/fixture/evidence/cursor-b.md']
    }]
  }));
  assert.throws(
    () => projectConfig({
      config,
      targetContract: targetContract(),
      placements: [
        placement('cursor', '/fixture/evidence/cursor-a.md'),
        placement('cursor', '/fixture/evidence/cursor-b.md')
      ],
      pathObservations: {}
    }),
    /collision|canonical|destination/i
  );
});

test('V2 path validation supports explicit POSIX and Windows lexical flavors', () => {
  const windows = parseV2Config(validConfig({
    targets: [genericTarget('cursor', 'C:\\Fixture\\Home\\entry.md')]
  }));
  assert.equal(windows.targets[0].paths[0], 'C:\\Fixture\\Home\\entry.md');

  const posixCaseDistinct = parseV2Config(validConfig({
    targets: [
      genericTarget('upper', '/Fixture/Home/entry.md'),
      genericTarget('lower', '/fixture/home/entry.md')
    ]
  }));
  assert.equal(posixCaseDistinct.targets.length, 2);

  for (const badPath of [
    'relative/entry.md',
    'C:relative\\entry.md',
    '\\\\server\\share\\entry.md',
    '//server/share/entry.md',
    'C:/Fixture\\Home/entry.md',
    'C:/Fixture//Home/entry.md',
    'C:/Fixture/./entry.md',
    'C:/Fixture/../entry.md',
    '/fixture//home/entry.md',
    '/fixture/home/../entry.md',
    '/fixture/home/./entry.md',
    '/fixture/home/entry.md/'
  ]) {
    assert.throws(
      () => parseV2Config(validConfig({ targets: [genericTarget('bad', badPath)] })),
      /absolute|canonical|segment|separator|path|escape/i
    );
  }

  assert.throws(
    () => parseV2Config(validConfig({
      targets: [
        genericTarget('one', 'C:/Fixture/Home/entry.md'),
        genericTarget('two', 'c:\\fixture\\home\\entry.md')
      ]
    })),
    /duplicate|canonical/i
  );
});

test('V2 validation rejects top-level, target, ownership, and prototype mutations', () => {
  const source = validConfig();
  assert.deepEqual(parseV2Config(JSON.stringify(source)), source);

  for (const mutation of [
    { ...source, schemaVersion: 1 },
    { ...source, runtime: 'other' },
    { ...source, extra: true },
    { ...source, scope: { kind: 'workspace', extra: true } },
    { ...source, targets: [{ ...source.targets[0], mode: 'manual' }] },
    { ...source, targets: [{ ...source.targets[0], paths: ['/fixture/home/AGENTS.md', '/fixture/home/AGENTS.md'] }] },
    { ...source, ownership: { ...source.ownership, extra: true } },
    { ...source, recovery: { checkpointRef: null } }
  ]) {
    assert.throws(() => parseV2Config(mutation), /config|runtime|schema|scope|target|path|ownership|recovery|duplicate/i);
  }

  const inherited = Object.assign(Object.create({ schemaVersion: 2 }), source);
  delete inherited.schemaVersion;
  assert.throws(() => parseV2Config(inherited), /plain|prototype|schema/i);
});

test('static target contract and entry policy expose the approved V2 surfaces', async () => {
  const entryPolicy = await readFile(
    path.join(REPO_ROOT, 'harness/trio/templates/entry-policy.md'),
    'utf8'
  );

  assert.deepEqual(RUNTIME_TARGET_CONTRACT, APPROVED_TARGET_CONTRACT);
  assertEntryPolicyContract(entryPolicy);
});

test('materialized Trio entry and capability outputs match their authoritative source bytes', async () => {
  const mismatches = [];
  for (const [sourcePath, outputPath] of MATERIALIZED_TRIO_OUTPUTS) {
    try {
      const [source, output] = await Promise.all([
        readFile(path.join(REPO_ROOT, sourcePath)),
        readFile(path.join(REPO_ROOT, outputPath))
      ]);
      if (!output.equals(source)) {
        mismatches.push(`${outputPath} must exactly match ${sourcePath}`);
      }
    } catch (error) {
      mismatches.push(`${outputPath}: ${error.code ?? error.message}`);
    }
  }
  assert.deepEqual(mismatches, []);
});

test('entry policy validator rejects route-before-effort inversion', async () => {
  const entryPolicy = await readFile(
    path.join(REPO_ROOT, 'harness/trio/templates/entry-policy.md'),
    'utf8'
  );
  const mutation = entryPolicy.replace(
    'Route first, then choose effort or execution topology.',
    'Choose effort or execution topology, then route the task.'
  );
  assert.notEqual(mutation, entryPolicy);
  assert.throws(() => assertEntryPolicyContract(mutation), /route|before/i);
});

test('entry policy validator rejects weakened authority, capability, inventory, and human gate clauses', async () => {
  const entryPolicy = await readFile(
    path.join(REPO_ROOT, 'harness/trio/templates/entry-policy.md'),
    'utf8'
  );
  const mutations = [
    [
      'The Trio planning files are the sole durable task authority',
      'The Trio planning files are one durable task authority'
    ],
    [
      'Each task selects exactly one capability family',
      'Each task selects one or more capability families'
    ],
    [
      'not a durable task type and creates no authority',
      'a durable task type and creates another authority'
    ],
    [
      'not a fifth capability pack',
      'is an additional capability pack'
    ],
    [
      'Routing never grants permission',
      'Routing grants permission'
    ]
  ];
  for (const [from, to] of mutations) {
    const mutation = entryPolicy.replace(from, to);
    assert.notEqual(mutation, entryPolicy);
    assert.throws(() => assertEntryPolicyContract(mutation), /authority|capability|durable|fifth|permission/i);
  }
});

test('entry policy validator rejects a ChiefOps capability or runner weakening', async () => {
  const entryPolicy = await readFile(
    path.join(REPO_ROOT, 'harness/trio/templates/entry-policy.md'),
    'utf8'
  );
  const mutations = [
    [
      'The ChiefOps companion is a governance companion outside the three capability families',
      'The ChiefOps companion is a fifth capability family alongside dev, office, and safety'
    ],
    [
      'not a runner, scheduler, registry, or fourth task-state surface',
      'and may act as a runner when the Chief is busy'
    ]
  ];
  for (const [from, to] of mutations) {
    const mutation = entryPolicy.replace(from, to);
    assert.notEqual(mutation, entryPolicy);
    assert.throws(() => assertEntryPolicyContract(mutation), /fifth|runner|capability|governance/i);
  }
});

test('state bridge dual-reads strict V2 without creating a projection manifest', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'trio-v2-state-'));
  try {
    const config = validConfig();
    await writeState(rootDir, config);
    const stored = await readState(rootDir);
    assert.deepEqual(stored, config);
    assert.deepEqual(
      Object.keys(JSON.parse(await readFile(path.join(rootDir, '.harness', 'state.json'), 'utf8'))),
      ['schemaVersion', 'runtime', 'scope', 'targets', 'ownership', 'recovery']
    );
    await assert.rejects(readFile(path.join(rootDir, '.harness', 'projections.json')), /ENOENT/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('materialized Codex outputs stay blocked by the scope gate even when allow-listed, sandbox-writable, and approved', () => {
  const destinations = codexDestinations('/fixture/home', 'workspace');
  const materialized = destinations.map((destination) => destination.replace('/fixture/home/', ''));
  const sha256 = 'c'.repeat(64);
  const taskDir = '/tmp/trio-projection-authority/planning/active/projection-scope-task';
  const binding = {
    authorityRoot: '/tmp/trio-projection-authority',
    taskId: 'projection-scope-task',
    files: {
      taskPlan: { path: `${taskDir}/task_plan.md`, sha256 },
      findings: { path: `${taskDir}/findings.md`, sha256 },
      progress: { path: `${taskDir}/progress.md`, sha256 }
    }
  };
  const packet = {
    authority: { binding, bindingObservation: binding },
    currentSlice: { name: 'projection-scope-proof' },
    nonGoals: [],
    proof: { primary: ['projection proof'] },
    capability: { workRole: 'chief', requestedModel: 'gpt-5.6-sol', requestedEffort: 'max' },
    allowedOperations: { files: materialized },
    deadline: { stopConditions: [] },
    expectedReturn: { status: ['candidate_done', 'blocked'] }
  };

  assert.equal(materialized.length, 6);
  for (const target of materialized) {
    const result = adjudicatePermission({
      assignmentPacket: packet,
      targetPaths: [target],
      permissionIntent: { sandboxMode: 'full_access', writableRoots: [] },
      hostObservation: {
        authenticated: true,
        evidenceRef: 'sandbox-writable-1',
        actualSandbox: 'full_access',
        actualWritableRoots: []
      },
      approval: { kind: 'user', granted: true }
    });
    assert.equal(result.verdict, 'blocked', target);
    assert.equal(result.stage, 'scope', target);
    assert.match(result.reason, /generated_target/, target);
    assert.equal(result.approvalEligible, false, target);
    assert.equal(result.stages.sandbox.decision, 'skipped', target);
    assert.equal(result.stages.approval.decision, 'skipped', target);
  }
});

test('ChiefOps source carries the six operative permission-ordering clauses', async () => {
  const chiefOps = await readFile(
    path.join(REPO_ROOT, 'harness/trio/governance/chiefops/SKILL.md'),
    'utf8'
  );
  const clauses = [
    /permission scope before creating or spawning any worker/i,
    /least privilege.{0,160}task-specific writable roots/i,
    /Full Access is an explicit exception/i,
    /recheck the frozen scope before any escalation or review/i,
    /approval only resolves host restriction and never expands allowed paths/i,
    /(generated|materialized) surfaces are never direct-written through escalation/i
  ];
  for (const clause of clauses) {
    assert.match(chiefOps, clause);
  }
});
