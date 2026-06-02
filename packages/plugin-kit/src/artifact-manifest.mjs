import path from 'node:path';
import { stat } from 'node:fs/promises';
import { sha256File } from './sha256.mjs';

export async function buildArtifactManifest({ version, artifacts }) {
  const entries = [];

  for (const artifact of artifacts) {
    const info = await stat(artifact.path);
    entries.push({
      name: path.basename(artifact.path),
      target: artifact.target,
      type: artifact.type,
      size: info.size,
      sha256: await sha256File(artifact.path)
    });
  }

  return {
    schemaVersion: 1,
    version,
    generatedAt: new Date().toISOString(),
    artifacts: entries.sort((left, right) => left.name.localeCompare(right.name))
  };
}
