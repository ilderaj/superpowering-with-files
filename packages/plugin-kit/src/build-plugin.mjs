import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  agentPluginsSchemaUrl,
  platformContractFor,
  trioSkillSourceMap
} from './platform-contracts.mjs';

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
  await writeTrioSkills({ pluginRoot, rootDir, contract });
  await writeReadme({ pluginRoot, contract, config });

  return {
    target,
    version,
    pluginRoot
  };
}

async function writePlatformManifest({ pluginRoot, contract, config, version }) {
  if (contract.id === 'agent-plugins') {
    await writePortableManifest({ pluginRoot, config, version });
    return;
  }

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

  manifest.interface = {
    displayName: config.displayName,
    shortDescription: config.description,
    longDescription: config.description,
    developerName: 'Superpowering With Files',
    category: 'Productivity',
    capabilities: ['Skills'],
    defaultPrompt: [
      'Classify the task with Trio before selecting a capability.'
    ]
  };

  await mkdir(path.dirname(path.join(pluginRoot, contract.manifestPath)), { recursive: true });
  await writeFile(
    path.join(pluginRoot, contract.manifestPath),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

async function writePortableManifest({ pluginRoot, config, version }) {
  const manifest = {
    $schema: agentPluginsSchemaUrl,
    name: config.name,
    version,
    description: config.description,
    author: {
      name: 'Superpowering With Files'
    },
    repository: config.repository,
    license: 'MIT',
    keywords: config.keywords
  };

  await writeFile(path.join(pluginRoot, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function writeTrioSkills({ pluginRoot, rootDir, contract }) {
  for (const { name, source } of trioSkillSourceMap) {
    const destination = contract.skillDestinations[name];
    const outputPath = path.join(pluginRoot, destination);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await cp(path.join(rootDir, source), outputPath);
  }
}

async function writeReadme({ pluginRoot, contract, config }) {
  const installLine = contract.id === 'agent-plugins'
    ? 'Install this packed plugin with an Agent Plugins-compatible client using that client\'s own procedure.'
    : 'Install this packed plugin with the corresponding IDE plugin installer.';

  await writeFile(
    path.join(pluginRoot, 'README.md'),
    [
      `# ${config.displayName}`,
      '',
      config.description,
      '',
      `This package targets ${contract.displayName} and bundles the Trio skills.`,
      '',
      installLine
    ].join('\n')
  );
}
