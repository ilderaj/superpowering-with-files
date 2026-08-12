import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agentPluginsSchemaUrl,
  platformContracts,
  supportedPluginTargets,
  trioSkillSourceMap
} from '../../packages/plugin-kit/src/platform-contracts.mjs';

test('platform contracts define the Codex and Agent Plugins plugin targets', () => {
  assert.deepEqual(supportedPluginTargets, ['codex', 'agent-plugins']);

  for (const target of supportedPluginTargets) {
    const contract = platformContracts[target];
    assert.equal(contract.id, target);
    assert.equal(typeof contract.displayName, 'string');
    assert.ok(contract.requiredFiles.includes('skills/trio/SKILL.md'));
    assert.ok(contract.requiredFiles.includes('skills/chiefops/SKILL.md'));
    assert.ok(!contract.requiredFiles.includes('skills/harness/SKILL.md'));
    assert.ok(!contract.requiredFiles.includes('hooks/hooks.json'));
    assert.ok(!contract.requiredFiles.includes('.mcp.json'));
    assert.ok(!contract.requiredFiles.includes('mcp/harness-runtime.mjs'));
    assert.equal(contract.capabilities.skills, true);
    assert.equal(contract.capabilities.hooks, undefined);
    assert.notEqual(contract.capabilities.mcpStdio, true);
  }
});

test('platform contract encodes the Codex skills-only constraint', () => {
  assert.ok(platformContracts.codex.requiredFiles.includes('.codex-plugin/plugin.json'));
  assert.ok(platformContracts.codex.requiredFiles.includes('skills/trio/dev/SKILL.md'));
  assert.ok(platformContracts.codex.requiredFiles.includes('skills/trio/office/SKILL.md'));
  assert.ok(platformContracts.codex.requiredFiles.includes('skills/trio/safety/SKILL.md'));
  assert.equal(platformContracts.codex.capabilities.hooks, undefined);
  assert.notEqual(platformContracts.codex.capabilities.mcpStdio, true);
  assert.equal(platformContracts['claude-code'], undefined);
  assert.equal(platformContracts.cursor, undefined);
  assert.equal(platformContracts.copilot, undefined);
});

test('agent-plugins contract is a flat skills-only portable package', () => {
  const contract = platformContracts['agent-plugins'];

  assert.equal(contract.manifestPath, 'plugin.json');
  assert.equal(contract.packageName, 'harness-agent-plugins');
  assert.ok(contract.requiredFiles.includes('plugin.json'));
  assert.ok(contract.requiredFiles.includes('skills/trio/SKILL.md'));
  assert.ok(contract.requiredFiles.includes('skills/dev/SKILL.md'));
  assert.ok(contract.requiredFiles.includes('skills/office/SKILL.md'));
  assert.ok(contract.requiredFiles.includes('skills/safety/SKILL.md'));
  assert.ok(contract.requiredFiles.includes('skills/chiefops/SKILL.md'));
  assert.ok(!contract.requiredFiles.includes('.codex-plugin/plugin.json'));
  assert.ok(!contract.requiredFiles.includes('skills/trio/dev/SKILL.md'));
  assert.equal(contract.loadsRootInstructionFile, false);
  assert.equal(contract.capabilities.skills, true);
  assert.equal(contract.capabilities.hooks, undefined);
  assert.notEqual(contract.capabilities.mcpStdio, true);
});

test('both targets are generated from one shared Trio skill source map', () => {
  assert.deepEqual(
    trioSkillSourceMap.map((entry) => entry.name),
    ['trio', 'dev', 'office', 'safety', 'chiefops']
  );
  assert.equal(trioSkillSourceMap[0].source, 'harness/trio/skill/SKILL.md');
  assert.equal(trioSkillSourceMap[1].source, 'harness/trio/capabilities/dev/SKILL.md');
  assert.equal(trioSkillSourceMap[2].source, 'harness/trio/capabilities/office/SKILL.md');
  assert.equal(trioSkillSourceMap[3].source, 'harness/trio/capabilities/safety/SKILL.md');
  assert.equal(trioSkillSourceMap[4].source, 'harness/trio/governance/chiefops/SKILL.md');

  for (const target of supportedPluginTargets) {
    const contract = platformContracts[target];
    for (const { name } of trioSkillSourceMap) {
      assert.equal(typeof contract.skillDestinations[name], 'string');
    }
  }

  assert.equal(agentPluginsSchemaUrl, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
});
