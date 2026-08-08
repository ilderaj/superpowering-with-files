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
  await writeTrioSkills({ pluginRoot, rootDir });
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

async function writeTrioSkills({ pluginRoot, rootDir }) {
  const skills = [
    ['harness/trio/skill/SKILL.md', 'skills/trio/SKILL.md'],
    ['harness/trio/capabilities/dev/SKILL.md', 'skills/trio/dev/SKILL.md'],
    ['harness/trio/capabilities/office/SKILL.md', 'skills/trio/office/SKILL.md'],
    ['harness/trio/capabilities/safety/SKILL.md', 'skills/trio/safety/SKILL.md']
  ];

  for (const [source, destination] of skills) {
    const outputPath = path.join(pluginRoot, destination);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await cp(path.join(rootDir, source), outputPath);
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
      `This package targets ${contract.displayName} and bundles the Trio skills.`,
      '',
      'Install this packed plugin with the corresponding IDE plugin installer.'
    ].join('\n')
  );
}
