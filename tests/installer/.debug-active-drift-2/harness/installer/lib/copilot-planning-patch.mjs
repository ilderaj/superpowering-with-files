import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applyPlanningWithFilesCompanionPlanPatch } from './planning-with-files-companion-plan-patch.mjs';

const MARKER = 'Harness Copilot planning-with-files patch';

function copilotSkillRootSnippet({ preferGithubSkillRoot = false } = {}) {
  const preferredRoot = preferGithubSkillRoot
    ? '.github/skills/planning-with-files'
    : '.agents/skills/planning-with-files';
  const fallbackRoot = preferGithubSkillRoot
    ? '.agents/skills/planning-with-files'
    : '.github/skills/planning-with-files';

  return [
    `COPILOT_PLANNING_WITH_FILES_ROOT="\${HARNESS_AGENT_SKILL_ROOT:-\${GITHUB_COPILOT_SKILL_ROOT:-${preferredRoot}}}"`,
    'if [ ! -f "$COPILOT_PLANNING_WITH_FILES_ROOT/scripts/session-catchup.py" ] && [ -n "${HOME:-}" ]; then',
    '  COPILOT_PLANNING_WITH_FILES_ROOT="$HOME/.agents/skills/planning-with-files"',
    'fi',
    'if [ ! -f "$COPILOT_PLANNING_WITH_FILES_ROOT/scripts/session-catchup.py" ]; then',
    `  COPILOT_PLANNING_WITH_FILES_ROOT="${fallbackRoot}"`,
    '  if [ ! -f "$COPILOT_PLANNING_WITH_FILES_ROOT/scripts/session-catchup.py" ] && [ -n "${HOME:-}" ]; then',
    '    COPILOT_PLANNING_WITH_FILES_ROOT="$HOME/.copilot/skills/planning-with-files"',
    '  fi',
    'fi'
  ].join('\n');
}

export async function applyCopilotPlanningPatch(targetDir, options = {}) {
  await applyPlanningWithFilesCompanionPlanPatch(targetDir);

  const skillPath = path.join(targetDir, 'SKILL.md');
  const original = await readFile(skillPath, 'utf8');
  const patched = original
    .replaceAll('${CLAUDE_PLUGIN_ROOT}', '$COPILOT_PLANNING_WITH_FILES_ROOT')
    .replace(
      '# Planning with Files',
      original.includes(MARKER)
        ? '# Planning with Files'
        : [
            `# ${MARKER}`,
            '',
            'This materialized copy is maintained by Harness for GitHub Copilot.',
            'It keeps task state under `planning/active/<task-id>/` and resolves helper scripts from the Copilot skill directory.',
            '',
            '```bash',
            copilotSkillRootSnippet(options),
            '```',
            '',
            '# Planning with Files'
          ].join('\n')
    );

  await writeFile(skillPath, patched);
}

export { MARKER as COPILOT_PLANNING_PATCH_MARKER };
