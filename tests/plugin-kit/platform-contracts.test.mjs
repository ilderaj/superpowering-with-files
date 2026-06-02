import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  platformContracts,
  supportedPluginTargets
} from '../../packages/plugin-kit/src/platform-contracts.mjs';

test('platform contracts define the four supported plugin targets', () => {
  assert.deepEqual(supportedPluginTargets, ['codex', 'claude-code', 'cursor', 'copilot']);

  for (const target of supportedPluginTargets) {
    const contract = platformContracts[target];
    assert.equal(contract.id, target);
    assert.equal(typeof contract.displayName, 'string');
    assert.ok(contract.requiredFiles.includes('skills/harness/SKILL.md'));
    assert.ok(contract.requiredFiles.includes('.mcp.json'));
    assert.ok(contract.requiredFiles.includes('mcp/harness-runtime.mjs'));
    assert.equal(contract.capabilities.skills, true);
    assert.equal(contract.capabilities.hooks, true);
    assert.equal(contract.capabilities.mcpStdio, true);
  }
});

test('platform contracts encode known platform-specific constraints', () => {
  assert.ok(platformContracts.codex.requiredFiles.includes('.codex-plugin/plugin.json'));
  assert.ok(platformContracts['claude-code'].requiredFiles.includes('.claude-plugin/plugin.json'));
  assert.ok(platformContracts['claude-code'].requiredFiles.includes('.mcp.json'));
  assert.ok(platformContracts.cursor.requiredFiles.includes('plugin.json'));
  assert.ok(platformContracts.copilot.requiredFiles.includes('plugin.json'));

  assert.equal(platformContracts['claude-code'].loadsRootInstructionFile, false);
  assert.equal(platformContracts.copilot.capabilities.cloudMcpToolsOnly, true);
});
