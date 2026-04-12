import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MARKER = 'Harness Copilot planning-with-files patch';

function copilotSkillRootSnippet() {
  return [
    'COPILOT_PLANNING_WITH_FILES_ROOT="${GITHUB_COPILOT_SKILL_ROOT:-.github/skills/planning-with-files}"',
    'if [ ! -f "$COPILOT_PLANNING_WITH_FILES_ROOT/scripts/session-catchup.py" ] && [ -n "${HOME:-}" ]; then',
    '  COPILOT_PLANNING_WITH_FILES_ROOT="$HOME/.copilot/skills/planning-with-files"',
    'fi'
  ].join('\n');
}

export async function applyCopilotPlanningPatch(targetDir) {
  const skillPath = path.join(targetDir, 'SKILL.md');
  const original = await readFile(skillPath, 'utf8');
  const patched = original
    .replaceAll('${CLAUDE_PLUGIN_ROOT}', '$COPILOT_PLANNING_WITH_FILES_ROOT')
    .replace(
      '# Planning with Files',
      [
        `# ${MARKER}`,
        '',
        'This materialized copy is maintained by Harness for GitHub Copilot.',
        'It keeps task state under `planning/active/<task-id>/` and resolves helper scripts from the Copilot skill directory.',
        '',
        '```bash',
        copilotSkillRootSnippet(),
        '```',
        '',
        '# Planning with Files'
      ].join('\n')
    );

  await writeFile(skillPath, patched);
}

export { MARKER as COPILOT_PLANNING_PATCH_MARKER };
