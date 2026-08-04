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
  await writeHarnessSkill({ pluginRoot, target, config });
  await writeHookConfig({ pluginRoot, rootDir, target });
  await writePlatformExtras(pluginRoot, target);
  await writeReadme({ pluginRoot, contract, config });

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
    keywords: ['harness', 'planning', contract.id],
    skills: './skills/'
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

  manifest.hooks = './hooks/hooks.json';

  await mkdir(path.dirname(path.join(pluginRoot, contract.manifestPath)), { recursive: true });
  await writeFile(
    path.join(pluginRoot, contract.manifestPath),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

async function writeHarnessSkill({ pluginRoot, target, config }) {
  await mkdir(path.join(pluginRoot, 'skills/harness'), { recursive: true });
  await writeFile(
    path.join(pluginRoot, 'skills/harness/SKILL.md'),
    [
      '---',
      'name: harness',
      `description: Use the Harness plugin for ${config.displayName} governance, tracked planning, and hooks.`,
      '---',
      '',
      '# Harness',
      '',
      'Use this plugin for Harness-managed planning, governance, and hooks.',
      '',
      'The plugin package is generated from repository source files and intentionally excludes live task state.',
      '',
      `Target platform: ${target}`
    ].join('\n')
  );
}

async function writeHookConfig({ pluginRoot, rootDir, target }) {
  const hooksRoot = path.join(pluginRoot, 'hooks');
  const planningHooksRoot = path.join(rootDir, 'harness/core/hooks/planning-with-files');
  await mkdir(hooksRoot, { recursive: true });
  await cp(path.join(planningHooksRoot, 'scripts'), hooksRoot, { recursive: true });
  await cp(path.join(rootDir, 'harness/core/hooks/runtime-hook-evidence.sh'), path.join(hooksRoot, 'runtime-hook-evidence.sh'));

  const template = JSON.parse(
    await readFile(path.join(planningHooksRoot, planningHookTemplateFile(target)), 'utf8')
  );
  const hookConfig = rewritePlanningHookTemplate(template, target);
  await writeFile(path.join(hooksRoot, 'hooks.json'), `${JSON.stringify(hookConfig, null, 2)}\n`);
}

async function writePlatformExtras(pluginRoot, target) {
  if (target === 'cursor') {
    await mkdir(path.join(pluginRoot, 'rules'), { recursive: true });
    await writeFile(
      path.join(pluginRoot, 'rules/harness.mdc'),
      '# Harness\n\nUse Harness tracked planning files for durable task state.\n'
    );
  }

  if (target === 'copilot') {
    await mkdir(path.join(pluginRoot, 'instructions'), { recursive: true });
    await writeFile(
      path.join(pluginRoot, 'instructions/harness.instructions.md'),
      '# Harness\n\nUse Harness tracked planning files for durable task state.\n'
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
      `This package targets ${contract.displayName} and bundles a Harness skill and hooks.`,
      '',
      'Install this packed plugin with the corresponding IDE plugin installer.'
    ].join('\n')
  );
}

function planningHookTemplateFile(target) {
  switch (target) {
    case 'codex':
      return 'codex-hooks.json';
    case 'claude-code':
      return 'claude-hooks.json';
    case 'cursor':
      return 'cursor-hooks.json';
    case 'copilot':
      return 'copilot-hooks.json';
    default:
      throw new Error(`Unsupported planning hook template target: ${target}`);
  }
}

function rewritePlanningHookTemplate(template, target) {
  const hooks = {};

  for (const [eventName, entries] of Object.entries(template.hooks ?? {})) {
    hooks[eventName] = entries.map((entry) => rewriteHookEntry(entry, target));
  }

  return template.version ? { version: template.version, hooks } : { hooks };
}

function rewriteHookEntry(entry, target) {
  const nextEntry = structuredClone(entry);

  if (Array.isArray(nextEntry.hooks)) {
    nextEntry.hooks = nextEntry.hooks.map((hook) => rewriteNestedHook(hook, target));
    return nextEntry;
  }

  if (typeof nextEntry.command === 'string') {
    nextEntry.command = rewriteHookCommandString(nextEntry.command, target);
  }

  if (typeof nextEntry.bash === 'string') {
    nextEntry.bash = rewriteHookCommandString(nextEntry.bash, target);
  }

  return nextEntry;
}

function rewriteNestedHook(hook, target) {
  const nextHook = { ...hook };
  if (typeof nextHook.command === 'string') {
    nextHook.command = rewriteHookCommandString(nextHook.command, target);
  }
  if (typeof nextHook.bash === 'string') {
    nextHook.bash = rewriteHookCommandString(nextHook.bash, target);
  }
  return nextHook;
}

function rewriteHookCommandString(command, target) {
  let nextCommand = command;
  for (const scriptPath of [...sourceHookScriptPaths(target)].sort((left, right) => right.length - left.length)) {
    nextCommand = nextCommand.replaceAll(scriptPath, './hooks/task-scoped-hook.sh');
  }
  return nextCommand;
}

function sourceHookScriptPaths(target) {
  switch (target) {
    case 'codex':
      return ['.codex/hooks/task-scoped-hook.sh', '$HOME/.codex/hooks/task-scoped-hook.sh'];
    case 'claude-code':
      return ['.claude/hooks/task-scoped-hook.sh', '$HOME/.claude/hooks/task-scoped-hook.sh'];
    case 'cursor':
      return ['.cursor/hooks/task-scoped-hook.sh', '$HOME/.cursor/hooks/task-scoped-hook.sh'];
    case 'copilot':
      return ['.github/hooks/task-scoped-hook.sh', '$HOME/.copilot/hooks/task-scoped-hook.sh'];
    default:
      throw new Error(`Unsupported hook command target: ${target}`);
  }
}
