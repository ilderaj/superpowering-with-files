import { createHash } from 'node:crypto';

export function serializeChiefOpsBlock(type, value) {
  return ['```chiefops-json', JSON.stringify({ type, ...value }, null, 2), '```'].join('\n');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function hashChiefOpsBlock({ type, value }) {
  const normalized = JSON.stringify(canonicalize({ type, ...value }));
  return 'sha256:' + createHash('sha256').update(normalized).digest('hex');
}

export function parseChiefOpsBlocks(markdown = '') {
  const blocks = [];
  const pattern = /```chiefops-json\s*([\s\S]*?)```/g;
  let match;

  while ((match = pattern.exec(markdown)) !== null) {
    const value = JSON.parse(match[1]);
    const { type, ...rest } = value;
    blocks.push({ type, value: rest, raw: match[0] });
  }

  return blocks;
}
