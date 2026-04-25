import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SUPPORTED_TARGETS = new Set(['codespaces']);
const GITIGNORE_ENTRIES = ['.agent-config/checkpoints/', '.agent-config/logs/', 'reports/checkpoints/'];

function readOption(args, name, fallback) {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function usage() {
  return [
    'Usage: ./scripts/harness cloud-bootstrap --target=codespaces',
    '',
    'Options:',
    '  --target=codespaces  Generate safety-oriented devcontainer suggestions',
    '  --help, -h           Show this help message'
  ].join('\n');
}

async function readTemplate(rootDir, relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

async function writeOrSuggest(targetPath, content, mode) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const existing = await readFile(targetPath, 'utf8').catch(() => null);

  if (existing === null) {
    await writeFile(targetPath, content);
    if (mode) {
      await chmod(targetPath, mode);
    }
    return targetPath;
  }

  if (existing === content) {
    return targetPath;
  }

  const suggestedPath = `${targetPath}.harness.suggested`;
  await writeFile(suggestedPath, content);
  if (mode) {
    await chmod(suggestedPath, mode);
  }
  return suggestedPath;
}

async function ensureGitignoreEntries(rootDir, entries) {
  const gitignorePath = path.join(rootDir, '.gitignore');
  const existing = await readFile(gitignorePath, 'utf8').catch(() => '');
  const lines = existing ? existing.split(/\r?\n/) : [];
  let changed = false;

  for (const entry of entries) {
    if (lines.includes(entry)) continue;
    lines.push(entry);
    changed = true;
  }

  if (!changed) return;
  const normalized = lines.filter((line, index) => index < lines.length - 1 || line !== '');
  await writeFile(gitignorePath, `${normalized.join('\n')}\n`);
}

export async function cloudBootstrap(args = []) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    return;
  }

  const rootDir = process.cwd();
  const target = readOption(args, 'target', 'codespaces');
  if (!SUPPORTED_TARGETS.has(target)) {
    throw new Error(`Unsupported cloud bootstrap target: ${target}`);
  }

  const [devcontainerTemplate, postCreateTemplate] = await Promise.all([
    readTemplate(rootDir, 'harness/core/templates/safety/devcontainer.json'),
    readTemplate(rootDir, 'harness/core/templates/safety/postCreateCommand.sh')
  ]);

  const outputs = await Promise.all([
    writeOrSuggest(path.join(rootDir, '.devcontainer/devcontainer.json'), devcontainerTemplate),
    writeOrSuggest(path.join(rootDir, '.devcontainer/postCreateCommand.sh'), postCreateTemplate, 0o755)
  ]);

  await ensureGitignoreEntries(rootDir, GITIGNORE_ENTRIES);
  console.log(`Generated ${target} safety bootstrap: ${outputs.join(', ')}`);
}
