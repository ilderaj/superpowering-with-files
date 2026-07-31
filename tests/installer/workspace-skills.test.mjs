import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  applyWorkspaceSkills,
  checkWorkspaceSkills,
  classifyWorkspaceSkillPlan,
  planWorkspaceSkills,
  readWorkspaceSkillProfile,
  workspaceSkills,
  workspaceProjectionManifestPath,
  workspaceSkillProfilePath
} from '../../harness/installer/commands/workspace-skills.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture
} from '../helpers/harness-fixture.mjs';
import {
  createProjectionManifest,
  readProjectionManifest,
  writeProjectionManifest
} from '../../harness/installer/lib/projection-manifest.mjs';
import { listSkillCatalogProjections } from '../../harness/installer/lib/skill-projection.mjs';

test('workspace skill profile is committed, portable, and workspace-only', async () => {
  const root = await createHarnessFixture();
  try {
    const profile = await readWorkspaceSkillProfile(root);

    assert.equal(workspaceSkillProfilePath(root), path.join(root, 'harness/workspace-skill-profile.json'));
    assert.equal(profile.schemaVersion, 1);
    assert.equal(profile.skillProfile, 'hybrid-candidate');
    assert.equal(profile.deploymentProfile, 'standard');
    assert.equal(profile.projectionMode, 'portable');
    assert.deepEqual(profile.targets, ['codex', 'claude-code']);
    assert.equal(
      workspaceProjectionManifestPath(root),
      path.join(root, '.harness/workspace-skill-projections.json')
    );
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace commands keep a retired committed profile runnable without rewriting it', async () => {
  const root = await createHarnessFixture();
  try {
    const profilePath = workspaceSkillProfilePath(root);
    const retiredProfile = {
      ...JSON.parse(await readFile(profilePath, 'utf8')),
      skillProfile: 'second-opinion-advisory'
    };
    await writeFile(profilePath, `${JSON.stringify(retiredProfile, null, 2)}\n`);

    assert.equal((await readWorkspaceSkillProfile(root)).skillProfile, 'standard');
    await workspaceSkills(['sync'], { rootDir: root });
    await workspaceSkills(['check'], { rootDir: root });
    await workspaceSkills(['plan'], { rootDir: root });
    assert.equal(JSON.parse(await readFile(profilePath, 'utf8')).skillProfile, 'second-opinion-advisory');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace sync prunes manifest-owned retired skill projections during profile migration', async () => {
  const root = await createHarnessFixture();
  try {
    const profilePath = workspaceSkillProfilePath(root);
    const retiredProfile = {
      ...JSON.parse(await readFile(profilePath, 'utf8')),
      skillProfile: 'second-opinion-advisory'
    };
    const retiredTargets = [
      path.join(root, '.agents/skills/second-opinion-advisory'),
      path.join(root, '.claude/skills/second-opinion-advisory')
    ];
    await writeFile(profilePath, `${JSON.stringify(retiredProfile, null, 2)}\n`);
    for (const targetPath of retiredTargets) {
      await mkdir(targetPath, { recursive: true });
      await writeFile(path.join(targetPath, 'SKILL.md'), '# Retired\n');
    }
    await writeProjectionManifest(
      root,
      createProjectionManifest(retiredTargets.map((targetPath) => ({ kind: 'skill', targetPath }))),
      { relativePath: '.harness/workspace-skill-projections.json' }
    );

    const plan = await planWorkspaceSkills({ rootDir: root, profile: await readWorkspaceSkillProfile(root) });
    const actions = await classifyWorkspaceSkillPlan({ rootDir: root, plan });
    assert.deepEqual(actions.prune, retiredTargets);
    assert.deepEqual(actions.preserve, []);
    await applyWorkspaceSkills({ rootDir: root, plan });

    for (const targetPath of retiredTargets) {
      await assert.rejects(access(targetPath), /ENOENT/);
    }
    const manifest = await readProjectionManifest(root, { relativePath: '.harness/workspace-skill-projections.json' });
    assert.ok(manifest.entries.every((entry) => !retiredTargets.includes(entry.targetPath)));
    assert.equal((await checkWorkspaceSkills({ rootDir: root, plan })).ok, true);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace skill plan contains skills only and never resolves personal global paths', async () => {
  const root = await createHarnessFixture();
  try {
    const plan = await planWorkspaceSkills({
      rootDir: root,
      profile: await readWorkspaceSkillProfile(root)
    });

    assert.ok(plan.skillWrites.length > 0);
    assert.ok(plan.skillWrites.every((entry) => entry.kind === 'skill'));
    assert.ok(plan.skillWrites.every((entry) => entry.targetPath.startsWith(`${root}${path.sep}`)));
    assert.ok(plan.skillWrites.every((entry) => !entry.targetPath.includes('/Users/')));
    assert.deepEqual(plan.entryWrites, []);
    assert.deepEqual(plan.hookWrites, []);
    assert.deepEqual(plan.managedWrites, []);
    assert.ok(plan.skillWrites.some((entry) => entry.skillName === 'tdd'));
    assert.ok(plan.skillWrites.some((entry) => entry.skillName === 'planning-with-files'));
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace planning does not read or write personal control-plane files', async () => {
  const root = await createHarnessFixture();
  try {
    await mkdir(path.join(root, '.harness'), { recursive: true });
    const stateBytes = '{"personal":"state-sentinel"}\n';
    const manifestBytes = '{"personal":"manifest-sentinel"}\n';
    await writeFile(path.join(root, '.harness/state.json'), stateBytes);
    await writeFile(path.join(root, '.harness/projections.json'), manifestBytes);

    await planWorkspaceSkills({ rootDir: root, profile: await readWorkspaceSkillProfile(root) });

    assert.equal(await readFile(path.join(root, '.harness/state.json'), 'utf8'), stateBytes);
    assert.equal(await readFile(path.join(root, '.harness/projections.json'), 'utf8'), manifestBytes);
    await assert.rejects(access(workspaceProjectionManifestPath(root)), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace check compares rendered content without requiring a runtime manifest', async () => {
  const root = await createHarnessFixture();
  try {
    const plan = await planWorkspaceSkills({ rootDir: root, profile: await readWorkspaceSkillProfile(root) });
    const result = await checkWorkspaceSkills({ rootDir: root, plan });

    assert.equal(result.ok, false);
    assert.equal(result.missing.length, plan.skillWrites.length);
    assert.deepEqual(result.contentDrift, []);
    assert.deepEqual(result.extraKnown, []);
    assert.deepEqual(result.unknownPreserved, []);
    await assert.rejects(access(workspaceProjectionManifestPath(root)), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace manifest uses an independent path from the personal projection manifest', async () => {
  const root = await createHarnessFixture();
  try {
    const relativePath = '.harness/workspace-skill-projections.json';
    const workspaceManifest = {
      schemaVersion: 1,
      entries: [{ kind: 'skill', targetPath: path.join(root, '.agents/skills/tdd') }]
    };

    await writeProjectionManifest(root, workspaceManifest, { relativePath });

    assert.deepEqual(await readProjectionManifest(root, { relativePath }), workspaceManifest);
    assert.deepEqual(await readProjectionManifest(root), { schemaVersion: 1, entries: [] });
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace sync materializes missing skills and writes only the workspace manifest', async () => {
  const root = await createHarnessFixture();
  try {
    await mkdir(path.join(root, '.harness'), { recursive: true });
    const stateBytes = '{"personal":"state-sentinel"}\n';
    const manifestBytes = '{"personal":"manifest-sentinel"}\n';
    await writeFile(path.join(root, '.harness/state.json'), stateBytes);
    await writeFile(path.join(root, '.harness/projections.json'), manifestBytes);
    const plan = await planWorkspaceSkills({ rootDir: root, profile: await readWorkspaceSkillProfile(root) });

    await applyWorkspaceSkills({ rootDir: root, plan, takeover: false });

    assert.equal((await checkWorkspaceSkills({ rootDir: root, plan })).ok, true);
    assert.equal(await readFile(path.join(root, '.harness/state.json'), 'utf8'), stateBytes);
    assert.equal(await readFile(path.join(root, '.harness/projections.json'), 'utf8'), manifestBytes);
    const workspaceManifest = await readProjectionManifest(root, {
      relativePath: '.harness/workspace-skill-projections.json'
    });
    assert.equal(workspaceManifest.entries.length, plan.skillWrites.length);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace catalog includes unprofiled legacy skills for safe stale classification', async () => {
  const root = await createHarnessFixture();
  try {
    const catalog = await listSkillCatalogProjections({
      rootDir: root,
      homeDir: root,
      scope: 'workspace',
      target: 'codex'
    });
    assert.ok(catalog.some((entry) => entry.skillName === 'using-superpowers'));
    assert.ok(catalog.some((entry) => entry.skillName === 'brainstorming'));
    assert.ok(catalog.some((entry) => entry.skillName === 'tdd'));
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace takeover prunes known stale skills and preserves unknown workspace skills', async () => {
  const root = await createHarnessFixture();
  try {
    const stalePath = path.join(root, '.agents/skills/using-superpowers');
    const unknownPath = path.join(root, '.agents/skills/user-owned-skill');
    await cp(
      path.join(root, 'harness/upstream/superpowers/skills/using-superpowers'),
      stalePath,
      { recursive: true }
    );
    await mkdir(unknownPath, { recursive: true });
    await writeFile(path.join(unknownPath, 'SKILL.md'), '# User owned\n');
    const plan = await planWorkspaceSkills({ rootDir: root, profile: await readWorkspaceSkillProfile(root) });

    assert.deepEqual((await checkWorkspaceSkills({ rootDir: root, plan })).extraKnown, [stalePath]);
    await applyWorkspaceSkills({ rootDir: root, plan, takeover: true });

    const result = await checkWorkspaceSkills({ rootDir: root, plan });
    assert.equal(result.ok, true);
    assert.deepEqual(result.unknownPreserved, [unknownPath]);
    await assert.rejects(access(stalePath), /ENOENT/);
    assert.equal(await readFile(path.join(unknownPath, 'SKILL.md'), 'utf8'), '# User owned\n');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace sync prunes owned skills from a target removed from the desired profile', async () => {
  const root = await createHarnessFixture();
  try {
    const initialProfile = await readWorkspaceSkillProfile(root);
    const initialPlan = await planWorkspaceSkills({ rootDir: root, profile: initialProfile });
    await applyWorkspaceSkills({ rootDir: root, plan: initialPlan });

    const claudeSkillRoot = path.join(root, '.claude/skills');
    const removedTargets = initialPlan.skillWrites
      .filter((entry) => entry.targetPath.startsWith(`${claudeSkillRoot}${path.sep}`))
      .map((entry) => entry.targetPath)
      .sort();
    assert.ok(removedTargets.length > 0);

    const codexOnlyPlan = await planWorkspaceSkills({
      rootDir: root,
      profile: { ...initialProfile, targets: ['codex'] }
    });
    const beforeSync = await checkWorkspaceSkills({ rootDir: root, plan: codexOnlyPlan });
    assert.deepEqual(beforeSync.extraKnown, removedTargets);

    await applyWorkspaceSkills({ rootDir: root, plan: codexOnlyPlan });

    assert.equal((await checkWorkspaceSkills({ rootDir: root, plan: codexOnlyPlan })).ok, true);
    for (const targetPath of removedTargets) {
      await assert.rejects(access(targetPath), /ENOENT/);
    }
    const workspaceManifest = await readProjectionManifest(root, {
      relativePath: '.harness/workspace-skill-projections.json'
    });
    assert.ok(workspaceManifest.entries.every((entry) => entry.targetPath.startsWith(`${root}/.agents/skills/`)));
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace takeover refuses a modified desired skill without an ownership receipt', async () => {
  const root = await createHarnessFixture();
  try {
    const desiredPath = path.join(root, '.agents/skills/tdd');
    await mkdir(desiredPath, { recursive: true });
    await writeFile(path.join(desiredPath, 'SKILL.md'), '# Same name, user content\n');
    const plan = await planWorkspaceSkills({ rootDir: root, profile: await readWorkspaceSkillProfile(root) });

    await assert.rejects(
      applyWorkspaceSkills({ rootDir: root, plan, takeover: true }),
      /Refusing modified workspace skill takeover/
    );
    assert.equal(await readFile(path.join(desiredPath, 'SKILL.md'), 'utf8'), '# Same name, user content\n');
  } finally {
    await removeHarnessFixture(root);
  }
});

test('first adoption requires explicit takeover even when content matches rendered output', async () => {
  const root = await createHarnessFixture();
  try {
    const plan = await planWorkspaceSkills({ rootDir: root, profile: await readWorkspaceSkillProfile(root) });
    const desired = plan.skillWrites.find((entry) => entry.targetPath.endsWith('/tdd'));
    await cp(desired.sourcePath, desired.targetPath, { recursive: true });
    await assert.rejects(
      applyWorkspaceSkills({ rootDir: root, plan }),
      /without --takeover/
    );
    await assert.rejects(access(workspaceProjectionManifestPath(root)), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace apply validates all conflicts before pruning and rejects escaped targets', async () => {
  const root = await createHarnessFixture();
  try {
    const stalePath = path.join(root, '.agents/skills/using-superpowers');
    const modifiedPath = path.join(root, '.agents/skills/tdd');
    await cp(path.join(root, 'harness/upstream/superpowers/skills/using-superpowers'), stalePath, { recursive: true });
    await mkdir(modifiedPath, { recursive: true });
    await writeFile(path.join(modifiedPath, 'SKILL.md'), '---\nname: tdd\n---\n# User modified\n');
    const plan = await planWorkspaceSkills({ rootDir: root, profile: await readWorkspaceSkillProfile(root) });
    await assert.rejects(applyWorkspaceSkills({ rootDir: root, plan, takeover: true }), /Refusing modified/);
    assert.equal(await readFile(path.join(stalePath, 'SKILL.md'), 'utf8').then((text) => text.length > 0), true);

    const escaped = structuredClone(plan);
    escaped.skillWrites[0].targetPath = path.join(root, 'outside/skill');
    await assert.rejects(applyWorkspaceSkills({ rootDir: root, plan: escaped, takeover: true }), /escapes declared skill roots/);
    await assert.rejects(access(path.join(root, 'outside/skill')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace takeover rejects a known directory containing an internal symlink', async () => {
  const root = await createHarnessFixture();
  try {
    const desiredPath = path.join(root, '.agents/skills/tdd');
    const plan = await planWorkspaceSkills({ rootDir: root, profile: await readWorkspaceSkillProfile(root) });
    const desired = plan.skillWrites.find((entry) => entry.targetPath === desiredPath);
    await cp(desired.sourcePath, desiredPath, { recursive: true });
    await symlink('/tmp', path.join(desiredPath, 'unsafe-link'));
    await assert.rejects(applyWorkspaceSkills({ rootDir: root, plan, takeover: true }), /Refusing modified/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace apply rejects a symlinked declared skill root before writing outside the repository', async () => {
  const root = await createHarnessFixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), 'workspace-skill-root-escape-'));
  try {
    await mkdir(path.join(root, '.agents'), { recursive: true });
    await symlink(outside, path.join(root, '.agents/skills'));
    const plan = await planWorkspaceSkills({ rootDir: root, profile: await readWorkspaceSkillProfile(root) });
    await assert.rejects(
      applyWorkspaceSkills({ rootDir: root, plan, takeover: true }),
      /symlink or non-directory ancestor/
    );
    await assert.rejects(
      checkWorkspaceSkills({ rootDir: root, plan }),
      /symlink or non-directory ancestor/
    );
    await assert.rejects(
      classifyWorkspaceSkillPlan({ rootDir: root, plan }),
      /symlink or non-directory ancestor/
    );
    await assert.rejects(access(path.join(outside, 'tdd')), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
    await rm(outside, { recursive: true, force: true });
  }
});

test('workspace check detects nested deletion, extra file, marker-body drift, and symlink replacement', async () => {
  const root = await createHarnessFixture();
  try {
    const plan = await planWorkspaceSkills({ rootDir: root, profile: await readWorkspaceSkillProfile(root) });
    await applyWorkspaceSkills({ rootDir: root, plan });
    const codebase = path.join(root, '.agents/skills/codebase-design');
    await rm(path.join(codebase, 'DEEPENING.md'));
    await writeFile(path.join(root, '.agents/skills/tdd/EXTRA.md'), 'extra');
    const reviewPath = path.join(root, '.agents/skills/code-review/SKILL.md');
    await writeFile(reviewPath, (await readFile(reviewPath, 'utf8')).replace('Standards', 'Standards drift'));
    const domain = path.join(root, '.agents/skills/domain-modeling');
    await rm(domain, { recursive: true });
    await symlink(path.join(root, 'harness/upstream/mattpocock-skills/skills/engineering/domain-modeling'), domain);

    const result = await checkWorkspaceSkills({ rootDir: root, plan });
    for (const targetPath of [codebase, path.join(root, '.agents/skills/tdd'), path.join(root, '.agents/skills/code-review'), domain]) {
      assert.ok(result.contentDrift.includes(targetPath), targetPath);
    }
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace sync leaves global and backup-shaped sentinels byte-identical', async () => {
  const root = await createHarnessFixture();
  try {
    const sentinels = new Map([
      [path.join(root, '.harness/state.json'), '{"global":"state"}\n'],
      [path.join(root, '.harness/projections.json'), '{"global":"projection"}\n'],
      [path.join(root, '.harness/backups/index.json'), '{"backup":"index"}\n'],
      [path.join(root, '.agents/skills/user-owned/SKILL.md'), '# Global sentinel\n']
    ]);
    for (const [filePath, bytes] of sentinels) {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, bytes);
    }
    const plan = await planWorkspaceSkills({ rootDir: root, profile: await readWorkspaceSkillProfile(root) });
    await applyWorkspaceSkills({ rootDir: root, plan });
    for (const [filePath, bytes] of sentinels) assert.equal(await readFile(filePath, 'utf8'), bytes);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace-skills set changes only the committed desired profile', async () => {
  const root = await createHarnessFixture();
  try {
    await mkdir(path.join(root, '.harness'), { recursive: true });
    const sentinel = '{"global":"unchanged"}\n';
    await writeFile(path.join(root, '.harness/state.json'), sentinel);
    await workspaceSkills(['set', '--skill-profile=matt-pilot'], { rootDir: root });
    assert.equal((await readWorkspaceSkillProfile(root)).skillProfile, 'matt-pilot');
    assert.equal(await readFile(path.join(root, '.harness/state.json'), 'utf8'), sentinel);
    await assert.rejects(access(workspaceProjectionManifestPath(root)), /ENOENT/);
  } finally {
    await removeHarnessFixture(root);
  }
});

test('workspace profile rollback restores the first inventory without changing global bytes', async () => {
  const root = await createHarnessFixture();
  try {
    await mkdir(path.join(root, '.harness'), { recursive: true });
    const globalState = '{"global":"state"}\n';
    const globalManifest = '{"global":"manifest"}\n';
    await writeFile(path.join(root, '.harness/state.json'), globalState);
    await writeFile(path.join(root, '.harness/projections.json'), globalManifest);
    const standardProfile = await readWorkspaceSkillProfile(root);
    const standardPlan = await planWorkspaceSkills({ rootDir: root, profile: standardProfile });
    await applyWorkspaceSkills({ rootDir: root, plan: standardPlan });
    const firstInventory = standardPlan.skillWrites.map((entry) => entry.targetPath).sort();

    const officeProfile = { ...standardProfile, skillProfile: 'office' };
    await writeFile(workspaceSkillProfilePath(root), `${JSON.stringify(officeProfile, null, 2)}\n`);
    const officePlan = await planWorkspaceSkills({ rootDir: root, profile: officeProfile });
    await applyWorkspaceSkills({ rootDir: root, plan: officePlan });

    await writeFile(workspaceSkillProfilePath(root), `${JSON.stringify(standardProfile, null, 2)}\n`);
    const restoredPlan = await planWorkspaceSkills({ rootDir: root, profile: standardProfile });
    await applyWorkspaceSkills({ rootDir: root, plan: restoredPlan });
    assert.equal((await checkWorkspaceSkills({ rootDir: root, plan: restoredPlan })).ok, true);
    assert.deepEqual(restoredPlan.skillWrites.map((entry) => entry.targetPath).sort(), firstInventory);
    assert.equal(await readFile(path.join(root, '.harness/state.json'), 'utf8'), globalState);
    assert.equal(await readFile(path.join(root, '.harness/projections.json'), 'utf8'), globalManifest);
  } finally {
    await removeHarnessFixture(root);
  }
});
