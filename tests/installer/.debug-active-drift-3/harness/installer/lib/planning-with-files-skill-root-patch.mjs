import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applyPlanningWithFilesCompanionPlanPatch } from './planning-with-files-companion-plan-patch.mjs';

const MARKER = 'Harness planning-with-files skill-root resolution patch';
const LEGACY_COPILOT_MARKER = 'Harness Copilot planning-with-files patch';
const LEGACY_COPILOT_BLOCK = new RegExp(`# ${LEGACY_COPILOT_MARKER}\\n\\n[\\s\\S]*?\\\`\\\`\\\`\\n\\n`);
const EXISTING_SHARED_BLOCK = new RegExp(`# ${MARKER}\\n\\n[\\s\\S]*?\\\`\\\`\\\`\\n\\n`);
const UPSTREAM_POWERSHELL_LINE =
  '& (Get-Command python -ErrorAction SilentlyContinue).Source "$env:USERPROFILE\\.claude\\skills\\planning-with-files\\scripts\\session-catchup.py" (Get-Location)';

function planningSkillRootSnippet({ preferGithubSkillRoot = false } = {}) {
  const preferredWorkspaceRoot = preferGithubSkillRoot
    ? '.github/skills/planning-with-files'
    : '.agents/skills/planning-with-files';
  const fallbackWorkspaceRoot = preferGithubSkillRoot
    ? '.agents/skills/planning-with-files'
    : '.github/skills/planning-with-files';

  return [
    `HARNESS_PLANNING_WITH_FILES_ROOT="\${HARNESS_AGENT_SKILL_ROOT:-\${GITHUB_COPILOT_SKILL_ROOT:-${preferredWorkspaceRoot}}}"`,
    'if [ ! -f "$HARNESS_PLANNING_WITH_FILES_ROOT/scripts/session-catchup.py" ] && [ -n "${HOME:-}" ]; then',
    '  HARNESS_PLANNING_WITH_FILES_ROOT="$HOME/.agents/skills/planning-with-files"',
    'fi',
    'if [ ! -f "$HARNESS_PLANNING_WITH_FILES_ROOT/scripts/session-catchup.py" ]; then',
    `  HARNESS_PLANNING_WITH_FILES_ROOT="${fallbackWorkspaceRoot}"`,
    'fi',
    'if [ ! -f "$HARNESS_PLANNING_WITH_FILES_ROOT/scripts/session-catchup.py" ] && [ -n "${HOME:-}" ]; then',
    '  for candidate in "$HOME/.cursor/skills/planning-with-files" "$HOME/.copilot/skills/planning-with-files" "$HOME/.claude/skills/planning-with-files"; do',
    '    if [ -f "$candidate/scripts/session-catchup.py" ]; then',
    '      HARNESS_PLANNING_WITH_FILES_ROOT="$candidate"',
    '      break',
    '    fi',
    '  done',
    'fi'
  ].join('\n');
}

function planningSkillRootPowerShellSnippet({ preferGithubSkillRoot = false } = {}) {
  const preferredWorkspaceRoot = preferGithubSkillRoot
    ? '.github/skills/planning-with-files'
    : '.agents/skills/planning-with-files';
  const fallbackWorkspaceRoot = preferGithubSkillRoot
    ? '.agents/skills/planning-with-files'
    : '.github/skills/planning-with-files';

  return [
    '$planningWithFilesCandidates = @(',
    '  $env:HARNESS_AGENT_SKILL_ROOT,',
    '  $env:GITHUB_COPILOT_SKILL_ROOT,',
    `  '${preferredWorkspaceRoot}',`,
    `  '${fallbackWorkspaceRoot}',`,
    "  (Join-Path $env:USERPROFILE '.agents/skills/planning-with-files'),",
    "  (Join-Path $env:USERPROFILE '.cursor/skills/planning-with-files'),",
    "  (Join-Path $env:USERPROFILE '.copilot/skills/planning-with-files'),",
    "  (Join-Path $env:USERPROFILE '.claude/skills/planning-with-files')",
    ') | Where-Object { $_ }',
    '$planningWithFilesRoot = $planningWithFilesCandidates | Where-Object {',
    "  Test-Path (Join-Path $_ 'scripts/session-catchup.py')",
    '} | Select-Object -First 1',
    "& (Get-Command python -ErrorAction SilentlyContinue).Source (Join-Path $planningWithFilesRoot 'scripts/session-catchup.py') (Get-Location)"
  ].join('\n');
}

export async function applyPlanningWithFilesSkillRootPatch(targetDir, options = {}) {
  await applyPlanningWithFilesCompanionPlanPatch(targetDir);

  const skillPath = path.join(targetDir, 'SKILL.md');
  const original = await readFile(skillPath, 'utf8');
  const withoutLegacyBlocks = original.replace(LEGACY_COPILOT_BLOCK, '').replace(EXISTING_SHARED_BLOCK, '');
  const patched = withoutLegacyBlocks
    .replaceAll('${CLAUDE_PLUGIN_ROOT}', '$HARNESS_PLANNING_WITH_FILES_ROOT')
    .replaceAll('COPILOT_PLANNING_WITH_FILES_ROOT', 'HARNESS_PLANNING_WITH_FILES_ROOT')
    .replace(UPSTREAM_POWERSHELL_LINE, planningSkillRootPowerShellSnippet(options))
    .replace(
      '# Planning with Files',
      [
        `# ${MARKER}`,
        '',
        'This materialized copy is maintained by Harness for Agent Skills compatible tools.',
        'It keeps task state under `planning/active/<task-id>/` and resolves helper scripts from the projected skill directory.',
        '',
        '```bash',
        planningSkillRootSnippet(options),
        '```',
        '',
        '# Planning with Files'
      ].join('\n')
    );

  await writeFile(skillPath, patched);
}

export { MARKER as PLANNING_WITH_FILES_SKILL_ROOT_PATCH_MARKER };
