import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArtifactManifest } from './artifact-manifest.mjs';
import { buildPlugin } from './build-plugin.mjs';
import { packDirectory, packPlugin } from './pack-plugin.mjs';
import { sha256File } from './sha256.mjs';
import { supportedPluginTargets } from './platform-contracts.mjs';

export async function buildAll({
  version,
  release = false,
  outDir,
  rootDir = process.cwd(),
  buildDir
} = {}) {
  const resolvedVersion = version ?? (await readRootVersion(rootDir));
  const releaseOut = path.resolve(outDir ?? path.resolve('dist/release', resolvedVersion));
  const buildOut = path.resolve(buildDir ?? defaultBuildDir({ outDir, releaseOut, version: resolvedVersion }));
  await rm(releaseOut, { recursive: true, force: true });
  await rm(buildOut, { recursive: true, force: true });
  await mkdir(releaseOut, { recursive: true });
  await mkdir(buildOut, { recursive: true });

  const artifacts = [];
  const runtimeRoot = await stageRuntimePackage({ rootDir, version: resolvedVersion, buildOut });
  artifacts.push(
    await packDirectory({
      sourceRoot: runtimeRoot,
      name: `harness-runtime-${resolvedVersion}.tgz`,
      target: 'runtime',
      type: 'runtime',
      outDir: releaseOut
    })
  );

  for (const target of supportedPluginTargets) {
    const build = await buildPlugin({ target, version: resolvedVersion, outDir: path.join(buildOut, 'plugins'), rootDir });
    artifacts.push(await packPlugin({ pluginRoot: build.pluginRoot, target, version: resolvedVersion, outDir: releaseOut }));
  }

  const manifest = await buildArtifactManifest({ version: resolvedVersion, artifacts });
  await writeFile(path.join(releaseOut, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(releaseOut, 'SHA256SUMS'), await renderSha256Sums(artifacts));
  await writeFile(path.join(releaseOut, 'release-notes.md'), renderReleaseNotes(resolvedVersion));

  if (!release) {
    await writeFile(path.join(releaseOut, '.development-build'), 'This build was created without --release.\n');
  }

  return {
    version: resolvedVersion,
    releaseOut,
    artifacts,
    manifest
  };
}

async function readRootVersion(rootDir) {
  const rootPackage = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
  return rootPackage.version;
}

function defaultBuildDir({ outDir, releaseOut, version }) {
  if (outDir) {
    return path.join(path.dirname(releaseOut), `.build-${path.basename(releaseOut)}`);
  }

  return path.resolve('dist/build', version);
}

async function stageRuntimePackage({ rootDir, version, buildOut }) {
  const runtimeRoot = path.join(buildOut, 'harness-runtime');
  await mkdir(runtimeRoot, { recursive: true });

  const runtimePackage = JSON.parse(
    await readFile(path.join(rootDir, 'packages/harness-runtime/package.json'), 'utf8')
  );
  runtimePackage.version = version;
  await writeFile(path.join(runtimeRoot, 'package.json'), `${JSON.stringify(runtimePackage, null, 2)}\n`);
  await cp(path.join(rootDir, 'packages/harness-runtime/bin'), path.join(runtimeRoot, 'bin'), { recursive: true });
  await cp(path.join(rootDir, 'packages/harness-runtime/src'), path.join(runtimeRoot, 'src'), { recursive: true });
  await cp(path.join(rootDir, 'packages/harness-runtime/README.md'), path.join(runtimeRoot, 'README.md'));
  await cp(path.join(rootDir, 'harness'), path.join(runtimeRoot, 'harness'), { recursive: true });
  await cp(path.join(rootDir, 'scripts'), path.join(runtimeRoot, 'scripts'), { recursive: true });
  await cp(path.join(rootDir, 'node_modules'), path.join(runtimeRoot, 'node_modules'), { recursive: true });

  return runtimeRoot;
}

async function renderSha256Sums(artifacts) {
  const lines = [];
  for (const artifact of [...artifacts].sort((left, right) => left.name.localeCompare(right.name))) {
    lines.push(`${await sha256File(artifact.path)}  ${artifact.name}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderReleaseNotes(version) {
  return [
    `# Superpowering With Files ${version}`,
    '',
    'Runtime harness plugin release with packed artifacts for Codex, Claude Code, Cursor, and GitHub Copilot.',
    '',
    'Artifacts:',
    '',
    `- harness-runtime-${version}.tgz`,
    `- harness-codex-plugin-${version}.tgz`,
    `- harness-claude-code-plugin-${version}.tgz`,
    `- harness-cursor-plugin-${version}.tgz`,
    `- harness-copilot-plugin-${version}.tgz`,
    '',
    'Use `SHA256SUMS` and `manifest.json` to verify downloaded assets.'
  ].join('\n');
}

function isMainModule() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isMainModule()) {
  await buildAll({ release: process.argv.includes('--release') });
}
