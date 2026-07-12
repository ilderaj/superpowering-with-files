import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const SUPERPOWERS_USING_SUPERPOWERS_ROUTING_PATCH_MARKER =
  'Harness Superpowers using-superpowers routing patch';

const UPSTREAM_DESCRIPTION =
  'description: Use when starting any conversation - establishes how to find and use skills, requiring skill invocation before ANY response including clarifying questions';

const UPSTREAM_AUTOMATIC_INVOCATION_BLOCK = [
  '<EXTREMELY-IMPORTANT>',
  'If you think there is even a 1% chance a skill might apply to what you are doing, you ABSOLUTELY MUST invoke the skill.',
  '',
  'IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.',
  '',
  'This is not negotiable. This is not optional. You cannot rationalize your way out of this.',
  '</EXTREMELY-IMPORTANT>'
].join('\n');

const HARNESS_ROUTING_BLOCK = [
  '<EXTREMELY-IMPORTANT>',
  `## ${SUPERPOWERS_USING_SUPERPOWERS_ROUTING_PATCH_MARKER}`,
  '',
  'This projected starter skill is a manual-only routing reference.',
  '',
  'It must not auto-invoke at session start, worker start, or for quick and ordinary tracked work. The Harness task classification in AGENTS.md is authoritative: direct execution is the default, and Superpowers is allowed only after the current round is routed to deep-reasoning or the user explicitly requests it.',
  '',
  'A worker follows its Assignment Packet and must not load this skill merely to discover a subagent stop condition. When this skill is explicitly activated, use only the specialized skills justified by the approved deep-reasoning phase.',
  '</EXTREMELY-IMPORTANT>'
].join('\n');

export async function applySuperpowersUsingSuperpowersRoutingPatch(targetDir) {
  const skillPath = path.join(targetDir, 'SKILL.md');
  const original = await readFile(skillPath, 'utf8');
  if (original.includes(SUPERPOWERS_USING_SUPERPOWERS_ROUTING_PATCH_MARKER)) return;

  const patchedDescription = original.replace(
    UPSTREAM_DESCRIPTION,
    'description: Manual-only routing reference for Superpowers. Do not auto-invoke; use only after Harness routes the current round to deep-reasoning or the user explicitly requests Superpowers.'
  );
  const patchedActivation = patchedDescription.replace(
    UPSTREAM_AUTOMATIC_INVOCATION_BLOCK,
    HARNESS_ROUTING_BLOCK
  );
  const legacyRuleStart = patchedActivation.indexOf('\n# Using Skills\n');
  const patched =
    legacyRuleStart === -1
      ? patchedActivation
      : `${patchedActivation.slice(0, legacyRuleStart)}\n# Harness Skill Routing\n\nThe Harness classification and the user request decide whether a specialized skill is relevant. Do not turn this manual routing reference into a default skill-discovery loop.\n`;

  if (
    patched === original ||
    patchedDescription === original ||
    patchedActivation === patchedDescription ||
    legacyRuleStart === -1
  ) {
    throw new Error(`Unable to apply ${SUPERPOWERS_USING_SUPERPOWERS_ROUTING_PATCH_MARKER} to ${skillPath}`);
  }

  await writeFile(skillPath, patched, 'utf8');
}
