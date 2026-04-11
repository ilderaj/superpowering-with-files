import { readFile } from 'node:fs/promises';
import path from 'node:path';

const strategies = new Set(['link', 'materialize']);

export async function projectionForSkill(rootDir, skillName, target) {
  const [index, metadata] = await Promise.all([
    readFile(path.join(rootDir, 'harness/core/skills/index.json'), 'utf8').then(JSON.parse),
    readFile(path.join(rootDir, 'harness/core/metadata/platforms.json'), 'utf8').then(JSON.parse)
  ]);

  if (!metadata.platforms[target]) {
    throw new Error(`Unknown target: ${target}`);
  }

  const skill = index.skills[skillName];

  if (!skill) {
    throw new Error(`Unknown skill: ${skillName}`);
  }

  const strategy = skill.projection[target] || skill.projection.default;
  if (!strategies.has(strategy)) {
    throw new Error(`Unsupported projection strategy: ${strategy}`);
  }

  return {
    skillName,
    target,
    strategy,
    source: path.join(rootDir, skill.baselinePath),
    patch: skill.patches ? skill.patches[target] : undefined
  };
}
