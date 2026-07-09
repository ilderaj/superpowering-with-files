export function serializeChiefOpsBlock(type, value) {
  return ['```chiefops-json', JSON.stringify({ type, ...value }, null, 2), '```'].join('\n');
}

export function parseChiefOpsBlocks(markdown = '') {
  const blocks = [];
  const pattern = /```chiefops-json\s*([\s\S]*?)```/g;
  let match;

  while ((match = pattern.exec(markdown)) !== null) {
    const value = JSON.parse(match[1]);
    const { type, ...rest } = value;
    blocks.push({ type, value: rest });
  }

  return blocks;
}
