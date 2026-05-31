import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { platformContractFor } from './platform-contracts.mjs';

export async function buildPlugin({ target, version, outDir, rootDir = process.cwd() }) {
  const contract = platformContractFor(target);
  const configPath = path.join(rootDir, 'plugins', target, 'plugin.harness.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const pluginRoot = path.join(outDir, contract.packageName);

  if (config.target !== target) {
    throw new Error(`Plugin config target mismatch: expected ${target}, got ${config.target}`);
  }

  await rm(pluginRoot, { recursive: true, force: true });
  await mkdir(pluginRoot, { recursive: true });
  await writePlatformManifest({ pluginRoot, contract, config, version });
  await writeMcpConfig({ pluginRoot, target, config });
  await writeHarnessSkill({ pluginRoot, target, config });
  await writeMcpWrapper(pluginRoot);
  await writeHookConfig(pluginRoot, target);
  await writePlatformExtras(pluginRoot, target);
  await writeReadme({ pluginRoot, contract, config });
  await copyRuntime({ rootDir, pluginRoot });

  return {
    target,
    version,
    pluginRoot
  };
}

async function writePlatformManifest({ pluginRoot, contract, config, version }) {
  const manifest = {
    name: config.name,
    version,
    description: config.description,
    author: {
      name: 'Superpowering With Files'
    },
    license: 'MIT',
    keywords: ['harness', 'planning', 'mcp', contract.id],
    skills: './skills/',
    mcpServers: './.mcp.json'
  };

  if (contract.id !== 'claude-code') {
    manifest.interface = {
      displayName: config.displayName,
      shortDescription: config.description,
      longDescription: config.description,
      developerName: 'Superpowering With Files',
      category: 'Productivity',
      capabilities: ['Skills', 'MCP', 'Hooks'],
      defaultPrompt: [
        'Start a tracked Harness planning task.',
        'Run Harness doctor and summarize risks.',
        'Record progress for the active task.'
      ]
    };
  }

  if (contract.id !== 'codex') {
    manifest.hooks = './hooks/hooks.json';
  }

  await mkdir(path.dirname(path.join(pluginRoot, contract.manifestPath)), { recursive: true });
  await writeFile(
    path.join(pluginRoot, contract.manifestPath),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

async function writeMcpConfig({ pluginRoot, target, config }) {
  await writeFile(
    path.join(pluginRoot, '.mcp.json'),
    `${JSON.stringify(
      {
        mcpServers: {
          [config.components.mcp.serverName]: {
            command: 'node',
            args: ['./mcp/harness-runtime.mjs']
          }
        }
      },
      null,
      2
    )}\n`
  );
}

async function writeHarnessSkill({ pluginRoot, target, config }) {
  await mkdir(path.join(pluginRoot, 'skills/harness'), { recursive: true });
  await writeFile(
    path.join(pluginRoot, 'skills/harness/SKILL.md'),
    [
      '---',
      'name: harness',
      `description: Use the Harness Runtime plugin for ${config.displayName} governance, tracked planning, hooks, and MCP tools.`,
      '---',
      '',
      '# Harness Runtime',
      '',
      'Use this plugin as the runtime entrypoint for Harness-managed planning, governance, hooks, and MCP tools.',
      '',
      'The plugin package is generated from repository source files and intentionally excludes live task state.',
      '',
      `Target platform: ${target}`
    ].join('\n')
  );
}

async function writeMcpWrapper(pluginRoot) {
  await mkdir(path.join(pluginRoot, 'mcp'), { recursive: true });
  await writeFile(
    path.join(pluginRoot, 'mcp/harness-runtime.mjs'),
    [
      '#!/usr/bin/env node',
      "import { spawnSync } from 'node:child_process';",
      "import path from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      '',
      'const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");',
      'const serverPath = path.join(pluginRoot, "runtime/harness/mcp/stdio.mjs");',
      'const result = spawnSync(process.execPath, [serverPath, ...process.argv.slice(2)], {',
      '  cwd: process.cwd(),',
      "  stdio: 'inherit'",
      '});',
      '',
      'if (result.error) throw result.error;',
      'process.exit(result.status ?? 1);',
      ''
    ].join('\n')
  );
}

async function writeHookConfig(pluginRoot, target) {
  await mkdir(path.join(pluginRoot, 'hooks'), { recursive: true });
  const eventName = target === 'claude-code' ? 'UserPromptSubmit' : 'userPromptSubmit';
  await writeFile(
    path.join(pluginRoot, 'hooks/hooks.json'),
    `${JSON.stringify({ hooks: { [eventName]: [] } }, null, 2)}\n`
  );
}

async function writePlatformExtras(pluginRoot, target) {
  if (target === 'cursor') {
    await mkdir(path.join(pluginRoot, 'rules'), { recursive: true });
    await writeFile(
      path.join(pluginRoot, 'rules/harness.mdc'),
      '# Harness Runtime\n\nUse Harness tracked planning files for durable task state.\n'
    );
  }

  if (target === 'copilot') {
    await mkdir(path.join(pluginRoot, 'instructions'), { recursive: true });
    await writeFile(
      path.join(pluginRoot, 'instructions/harness.instructions.md'),
      '# Harness Runtime\n\nUse Harness tracked planning files for durable task state.\n'
    );
  }
}

async function writeReadme({ pluginRoot, contract, config }) {
  await writeFile(
    path.join(pluginRoot, 'README.md'),
    [
      `# ${config.displayName}`,
      '',
      config.description,
      '',
      `This package targets ${contract.displayName} and bundles Harness runtime files, a Harness skill, hooks, and an MCP stdio wrapper.`,
      '',
      'Install this packed plugin with the corresponding IDE plugin installer.'
    ].join('\n')
  );
}

async function copyRuntime({ rootDir, pluginRoot }) {
  const runtimeRoot = path.join(pluginRoot, 'runtime');
  await mkdir(runtimeRoot, { recursive: true });
  await cp(path.join(rootDir, 'harness'), path.join(runtimeRoot, 'harness'), {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}planning${path.sep}active`)
  });
  await cp(path.join(rootDir, 'scripts'), path.join(runtimeRoot, 'scripts'), { recursive: true });
  await cp(path.join(rootDir, 'node_modules'), path.join(runtimeRoot, 'node_modules'), { recursive: true });
}
