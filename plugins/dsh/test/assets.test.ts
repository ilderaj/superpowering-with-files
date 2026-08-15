import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const ASSET_SOURCES: Record<string, string> = {
  'assets/skills/trio/SKILL.md': '.agents/skills/trio/SKILL.md',
  'assets/skills/trio/dev/SKILL.md': '.agents/skills/trio/dev/SKILL.md',
  'assets/skills/trio/office/SKILL.md': '.agents/skills/trio/office/SKILL.md',
  'assets/skills/trio/safety/SKILL.md': '.agents/skills/trio/safety/SKILL.md',
  'assets/skills/chiefops/SKILL.md': 'harness/trio/governance/chiefops/SKILL.md',
  'assets/templates/entry-policy.md': 'harness/trio/templates/entry-policy.md',
  'assets/templates/task_plan.md': 'harness/trio/templates/task_plan.md',
  'assets/templates/findings.md': 'harness/trio/templates/findings.md',
  'assets/templates/progress.md': 'harness/trio/templates/progress.md'
};

describe('vendored assets (Slice 1, plan item 5)', () => {
  for (const [asset, source] of Object.entries(ASSET_SOURCES)) {
    it(asset + ' is byte-identical to ' + source, async () => {
      const vendored = await readFile(join(pluginRoot, asset));
      const original = await readFile(join(repoRoot, source));
      expect(vendored.equals(original)).toBe(true);
    });
  }

  it('ships the dsh host adaptation preamble with the four rewritten rules', async () => {
    const text = await readFile(join(pluginRoot, 'assets', 'dsh-host-adaptation.md'), 'utf8');
    expect(text).toContain('「可见 worker」重定义');
    expect(text).toContain('证据三态化');
    expect(text).toContain('approval_policy=never 语义映射');
    expect(text).toContain('不得用无记录 subagent 顶替可见 worker');
    expect(text).toContain('conversationEvents');
    expect(text).toContain('0.1.0-rc.6');
  });
});
