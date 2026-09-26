import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skillEntries = [
  { sourcePath: 'trio', name: 'trio' },
  { sourcePath: 'trio/dev', name: 'dev' },
  { sourcePath: 'trio/office', name: 'office' },
  { sourcePath: 'trio/safety', name: 'safety' },
  { sourcePath: 'chiefops', name: 'chiefops' }
];

async function fileEvidence(filename) {
  try {
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink()) return { exists: true, regular: false, sha256: null };
    const bytes = await readFile(filename);
    return { exists: true, regular: true, sha256: createHash('sha256').update(bytes).digest('hex') };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, regular: false, sha256: null };
    throw error;
  }
}

function textOf(item) {
  return (item.content ?? []).map(part => part.text ?? '').join('');
}

function promptEvidence(items) {
  if (!Array.isArray(items)) throw new Error('Prompt input must be a JSON array');
  const developer = items.filter(item => item.role === 'developer').map(textOf).join('\n');
  const user = items.filter(item => item.role === 'user').map(textOf).join('\n');
  const lines = new Set(developer.split('\n'));
  const hasEntry = name => [...lines].some(line => line.startsWith(`- ${name}:`));
  return {
    developerChars: developer.length,
    userChars: user.length,
    duplicatedSkillNames: skillEntries.map(({ name }) => name).filter(name => hasEntry(name) && hasEntry(`harness-codex-plugin:${name}`))
  };
}

export async function auditPluginCutover({ project, globalAgents, pluginRoot, promptJson }) {
  const [globalPolicy, projectPolicy, manifest, prompt] = await Promise.all([
    fileEvidence(globalAgents),
    fileEvidence(path.join(project, 'AGENTS.md')),
    readFile(path.join(pluginRoot, '.codex-plugin/plugin.json'), 'utf8').then(JSON.parse),
    promptJson ? readFile(promptJson, 'utf8').then(JSON.parse).then(promptEvidence) : null
  ]);
  if (typeof manifest.version !== 'string' || !manifest.version) throw new Error('Plugin manifest has no version');
  const home = path.dirname(path.dirname(globalAgents));
  const skills = await Promise.all(skillEntries.map(async ({ name, sourcePath }) => {
    const [local, installed, agentsGlobal, codexGlobal] = await Promise.all([
      fileEvidence(path.join(project, '.agents/skills', sourcePath, 'SKILL.md')),
      fileEvidence(path.join(pluginRoot, 'skills', sourcePath, 'SKILL.md')),
      fileEvidence(path.join(home, '.agents/skills', sourcePath, 'SKILL.md')),
      fileEvidence(path.join(home, '.codex/skills', sourcePath, 'SKILL.md'))
    ]);
    return {
      name, sourcePath, local, installed,
      globalStandalone: agentsGlobal.exists || codexGlobal.exists,
      localAndPluginIdentical: local.regular && installed.regular && local.sha256 === installed.sha256
    };
  }));
  return {
    schemaVersion: 1,
    policy: {
      global: globalPolicy,
      project: projectPolicy,
      identical: globalPolicy.regular && projectPolicy.regular && globalPolicy.sha256 === projectPolicy.sha256
    },
    plugin: { version: manifest.version },
    skills,
    prompt
  };
}

function parseArgs(args) {
  const result = {};
  const keys = new Map([
    ['--project', 'project'],
    ['--global-agents', 'globalAgents'],
    ['--plugin-root', 'pluginRoot'],
    ['--prompt-json', 'promptJson']
  ]);
  for (let index = 0; index < args.length; index += 2) {
    const key = keys.get(args[index]);
    const value = args[index + 1];
    if (!key || !value || result[key] || !path.isAbsolute(value)) {
      throw new Error('Usage: audit-plugin-cutover.mjs --project ABS --global-agents ABS --plugin-root ABS [--prompt-json ABS]');
    }
    result[key] = value;
  }
  for (const key of ['project', 'globalAgents', 'pluginRoot']) {
    if (!result[key]) throw new Error(`Missing ${key}`);
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await auditPluginCutover(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
