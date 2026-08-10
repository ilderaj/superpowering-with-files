import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  platformContracts,
  supportedPluginTargets
} from '../../packages/plugin-kit/src/platform-contracts.mjs';

test('platform contracts define only the Codex plugin target', () => {
  assert.deepEqual(supportedPluginTargets, ['codex']);

  for (const target of supportedPluginTargets) {
    const contract = platformContracts[target];
    assert.equal(contract.id, target);
    assert.equal(typeof contract.displayName, 'string');
    assert.ok(contract.requiredFiles.includes('skills/trio/SKILL.md'));
    assert.ok(contract.requiredFiles.includes('skills/trio/dev/SKILL.md'));
    assert.ok(contract.requiredFiles.includes('skills/trio/office/SKILL.md'));
    assert.ok(contract.requiredFiles.includes('skills/trio/safety/SKILL.md'));
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
  assert.equal(platformContracts.codex.capabilities.hooks, undefined);
  assert.notEqual(platformContracts.codex.capabilities.mcpStdio, true);
  assert.equal(platformContracts['claude-code'], undefined);
  assert.equal(platformContracts.cursor, undefined);
  assert.equal(platformContracts.copilot, undefined);
});
