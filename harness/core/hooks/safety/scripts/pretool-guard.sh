#!/usr/bin/env bash
set -euo pipefail

# This guard is activated when a safety/cloud-safe policyProfile installs the safety hook bundle.
platform="${1:-unknown}"
payload="$(cat)"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script_name="$(basename "${BASH_SOURCE[0]}")"
script_path="$script_dir/$script_name"

source_runtime_hook_evidence_helper() {
  local helper
  for helper in \
    "$script_dir/runtime-hook-evidence.sh" \
    "$script_dir/../../runtime-hook-evidence.sh"; do
    if [ -f "$helper" ]; then
      # shellcheck source=/dev/null
      . "$helper"
      return 0
    fi
  done

  return 1
}

source_runtime_hook_evidence_helper || true

project_root="${HARNESS_PROJECT_ROOT:-}"
if [ -z "$project_root" ] && command -v git >/dev/null 2>&1; then
  project_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
fi
if [ -z "$project_root" ]; then
  project_root="$(pwd)"
fi

config_dir="${HARNESS_SAFETY_CONFIG_DIR:-}"
if [ -z "$config_dir" ]; then
  if [ -d "$project_root/.agent-config/safety" ]; then
    config_dir="$project_root/.agent-config/safety"
  elif [ -d "$HOME/.agent-config/safety" ]; then
    config_dir="$HOME/.agent-config/safety"
  elif [ -d "$project_root/harness/core/safety" ]; then
    config_dir="$project_root/harness/core/safety"
  elif [ -d "$script_dir/../../../safety" ]; then
    config_dir="$(cd "$script_dir/../../../safety" && pwd)"
  else
    config_dir="$project_root"
  fi
fi

log_dir="${HARNESS_SAFETY_LOG_DIR:-$HOME/.agent-config/logs}"
mkdir -p "$log_dir"

PAYLOAD="$payload" \
PLATFORM="$platform" \
PROJECT_ROOT="$project_root" \
CONFIG_DIR="$config_dir" \
LOG_DIR="$log_dir" \
node <<'NODE'
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const payloadText = process.env.PAYLOAD && process.env.PAYLOAD.trim() ? process.env.PAYLOAD : '{}';
function parsePayloadText(text) {
  try {
    return { payload: JSON.parse(text), rawText: text, parseError: null };
  } catch (error) {
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return { payload: JSON.parse(objectMatch[0]), rawText: text, parseError: null };
      } catch {}
    }
    return { payload: {}, rawText: text, parseError: error };
  }
}
const { payload, rawText, parseError } = parsePayloadText(payloadText);
const platform = process.env.PLATFORM ?? 'unknown';
const projectRoot = path.resolve(process.env.PROJECT_ROOT ?? process.cwd());
const configDir = process.env.CONFIG_DIR ?? projectRoot;
const logDir = process.env.LOG_DIR ?? path.join(os.homedir(), '.agent-config', 'logs');

function get(obj, dottedPath) {
  return dottedPath.split('.').reduce((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return current[key];
    }
    return undefined;
  }, obj);
}

function firstString(paths) {
  for (const candidate of paths) {
    const value = get(payload, candidate);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function extractEmbeddedCommand(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) return '';

  const match = rawText.match(/"(command|rawCommand)"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!match) return '';

  try {
    const decoded = JSON.parse(`"${match[2]}"`);
    return typeof decoded === 'string' && decoded.trim() ? decoded.trim() : '';
  } catch {
    return match[2].trim();
  }
}

function commandFromPayload(rawText) {
  const direct = firstString([
    'command',
    'toolInput.command',
    'tool_input.command',
    'input.command',
    'bash.command',
    'rawCommand'
  ]);
  if (direct) return direct;

  for (const candidate of ['arguments', 'toolInput.arguments', 'tool_input.arguments']) {
    const value = get(payload, candidate);
    if (Array.isArray(value) && value.length > 0) {
      return value.join(' ');
    }
  }

  const embedded = extractEmbeddedCommand(rawText);
  if (embedded) return embedded;

  return typeof rawText === 'string' ? rawText.trim() : '';
}

function expandHomePatterns(entries, homeDir) {
  return entries.map((entry) =>
    entry
      .replaceAll('$HOME', homeDir)
      .replace(/^~(?=\/|$)/, homeDir)
  );
}

function readLines(fileName, fallback) {
  const filePath = path.join(configDir, fileName);
  if (!fs.existsSync(filePath)) return fallback;
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function commandOutput(command, cwd) {
  try {
    return execSync(command, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

function currentRepoRoot(cwd) {
  return commandOutput('git rev-parse --show-toplevel', cwd) || null;
}

function currentBranchHasUpstream(cwd) {
  try {
    execSync('git rev-parse --abbrev-ref --symbolic-full-name @{u}', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return true;
  } catch {
    return false;
  }
}

function currentBranchName(cwd) {
  return commandOutput('git branch --show-current', cwd);
}

function isWorktreeCheckout(cwd) {
  const gitDir = commandOutput('git rev-parse --absolute-git-dir', cwd);
  const gitCommonDir =
    commandOutput('git rev-parse --path-format=absolute --git-common-dir', cwd) ||
    commandOutput('git rev-parse --git-common-dir', cwd);
  if (!gitDir || !gitCommonDir) return false;
  return path.resolve(gitDir) !== path.resolve(cwd, gitCommonDir);
}

function isInside(child, parent) {
  const resolvedChild = path.resolve(child);
  const resolvedParent = path.resolve(parent);
  return (
    resolvedChild === resolvedParent ||
    resolvedChild.startsWith(`${resolvedParent}${path.sep}`)
  );
}

function isProtectedCwd(cwd, homeDir, protectedPaths) {
  return protectedPaths.some((candidate) => {
    const resolved = path.resolve(candidate);
    return cwd === resolved || cwd.startsWith(`${resolved}${path.sep}`);
  });
}

function absolutePathTargets(command, homeDir) {
  const matches = [...command.matchAll(/(?:^|[\s"'`])((?:~\/|\/)[^\s"'`|;&]+)/g)];
  return matches.map((match) => {
    const token = match[1];
    return token.startsWith('~/') ? path.join(homeDir, token.slice(2)) : token;
  });
}

function shellSplit(command) {
  const tokens = [];
  let current = '';
  let quote = null;
  let escaping = false;

  for (const char of command) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '\'' || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaping || quote) return null;
  if (current) tokens.push(current);
  return tokens;
}

function isFindCommand(command) {
  const trimmed = command.trimStart();
  return trimmed === 'find' || trimmed.startsWith('find ');
}

function isLowRiskFindCommand(command) {
  if (!isFindCommand(command)) return false;
  if (/[|&;<>`]/.test(command) || /\$\(/.test(command) || /[\r\n]/.test(command)) return false;

  const tokens = shellSplit(command);
  if (!tokens || tokens[0] !== 'find') return false;

  const allowedFlags = new Set([
    '-maxdepth',
    '-mindepth',
    '-name',
    '-iname',
    '-path',
    '-ipath',
    '-type'
  ]);
  const allowedStandalone = new Set(['-print', '(', ')', '!', '-a', '-o']);

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (allowedStandalone.has(token)) {
      continue;
    }

    if (allowedFlags.has(token)) {
      const value = tokens[index + 1];
      if (!value) return false;
      if (token === '-type' && !/^[bcdpfls]$/.test(value)) return false;
      index += 1;
      continue;
    }

    if (token.startsWith('-')) {
      return false;
    }
  }

  return true;
}

function hasRiskAssessment(rootDir) {
  const activeRoot = path.join(rootDir, 'planning', 'active');
  if (!fs.existsSync(activeRoot)) return false;

  for (const taskId of fs.readdirSync(activeRoot)) {
    const filePath = path.join(activeRoot, taskId, 'task_plan.md');
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const start = content.indexOf('## Risk Assessment');
    if (start === -1) continue;
    const rest = content.slice(start + '## Risk Assessment'.length);
    const nextHeading = rest.search(/\n## |\n# /);
    const block = nextHeading === -1 ? rest : rest.slice(0, nextHeading);

    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const tableRows = lines.filter((line) => line.startsWith('|'));
    const meaningfulRow = tableRows.find(
      (line) =>
        !/^\|\s*-/.test(line) &&
        !line.includes('风险 |') &&
        !line.includes('---|---') &&
        line
          .split('|')
          .map((cell) => cell.trim())
          .filter(Boolean)
          .some((cell) => cell !== '')
    );
    if (meaningfulRow) return true;
  }

  return false;
}

function emit(decision, reason, cwd, command) {
  const result = {
    permissionDecision: decision,
    permissionDecisionReason: reason,
    continue: decision !== 'deny'
  };

  const logPath = path.join(logDir, 'pretool-guard.log');
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(
    logPath,
    `${JSON.stringify({
      ts: new Date().toISOString(),
      platform,
      cwd,
      decision,
      reason,
      commandSummary: command.slice(0, 200)
    })}\n`
  );

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const homeDir = os.homedir();
const cwd = path.resolve(
  firstString(['cwd', 'workingDirectory', 'workspace.cwd', 'toolInput.cwd', 'tool_input.cwd']) ||
    process.cwd()
);
const command = commandFromPayload(rawText);
const repoRoot = currentRepoRoot(cwd);
const protectedPaths = expandHomePatterns(
  readLines('protected-paths.txt', ['/', '/Users', '$HOME', '~/Documents', '~/Desktop', '~/Downloads', '~/Library']),
  homeDir
);
const dangerousPatterns = readLines('dangerous-patterns.txt', [
  '^\\s*rm\\s+-rf?\\b',
  '^\\s*rmdir\\b',
  '\\bfind\\b.*(?:^|\\s)-delete(?:\\s|$)',
  '^\\s*git\\s+clean\\b',
  '^\\s*git\\s+reset\\s+--hard\\b',
  '^\\s*sudo\\b',
  '^\\s*chmod\\b',
  '^\\s*chown\\b',
  '^\\s*dd\\b',
  '^\\s*curl\\b',
  '^\\s*wget\\b',
  '^\\s*(bash|sh)\\s+-c\\b'
]).map((pattern) => new RegExp(pattern, 'm'));
const safePatterns = readLines('safe-commands.txt', [
  '^\\s*git\\s+(status|diff|show|log|branch|rev-parse|ls-files|fetch)\\b',
  '^\\s*(npm|pnpm|yarn)\\s+(test|lint|typecheck)\\b',
  '^\\s*swift\\s+(test|build)\\b',
  '^\\s*xcodebuild\\s+test\\b'
]).map((pattern) => new RegExp(pattern));

function hasDetectableCommand(rawText) {
  if (firstString(['command', 'toolInput.command', 'tool_input.command', 'input.command', 'bash.command', 'rawCommand'])) {
    return true;
  }

  if (extractEmbeddedCommand(rawText)) return true;

  const fallback = typeof rawText === 'string' ? rawText.trim() : '';
  if (!fallback) return false;

  const shellLikeLines = fallback
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/payload/i.test(line))
    .filter((line) => !/^[{\[]/.test(line));

  return shellLikeLines.some((line) => {
    if (safePatterns.some((pattern) => pattern.test(line))) return true;
    if (isLowRiskFindCommand(line)) return true;
    if (dangerousPatterns.some((pattern) => pattern.test(line))) return true;

    return (
      /[|&;<>`$()]/.test(line) ||
      /^(?:\.\.?\/|~\/|\/)/.test(line) ||
      /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)
    );
  });
}

if (parseError && !hasDetectableCommand(rawText)) {
  emit(
    'allow',
    'Hook payload could not be parsed, but no executable command was detected.',
    cwd,
    rawText.trim()
  );
  process.exit(0);
}

if (isProtectedCwd(cwd, homeDir, protectedPaths)) {
  emit('deny', 'Current working directory is protected.', cwd, command);
  process.exit(0);
}

for (const target of absolutePathTargets(command, homeDir)) {
  const normalized = path.resolve(target);
  const touchesProtected = protectedPaths.some((candidate) => {
    const protectedPath = path.resolve(candidate);
    return normalized === protectedPath || normalized.startsWith(`${protectedPath}${path.sep}`);
  });
  if (touchesProtected) {
    emit('deny', 'Command targets a protected absolute path.', cwd, command);
    process.exit(0);
  }
  if (repoRoot && !isInside(normalized, repoRoot)) {
    emit('deny', 'Command targets an absolute path outside the workspace.', cwd, command);
    process.exit(0);
  }
}

if (isFindCommand(command)) {
  if (isLowRiskFindCommand(command)) {
    emit('allow', 'find command matches the low-risk query allow-list.', cwd, command);
    process.exit(0);
  }

  emit('ask', 'find command is outside the low-risk query allow-list.', cwd, command);
  process.exit(0);
}

if (repoRoot && safePatterns.some((pattern) => pattern.test(command)) && isInside(cwd, repoRoot)) {
  emit('allow', 'Command matches the safe command allow-list.', cwd, command);
  process.exit(0);
}

if (dangerousPatterns.some((pattern) => pattern.test(command))) {
  const currentBranch = currentBranchName(cwd);
  const isWorktree = isWorktreeCheckout(cwd);
  if (!isWorktree && currentBranch === 'dev' && /^\s*git\s+reset\s+--hard\b/.test(command)) {
    emit('deny', 'git reset --hard is denied on the main repo dev branch.', cwd, command);
    process.exit(0);
  }

  const upstream = currentBranchHasUpstream(cwd);
  const riskAssessment = hasRiskAssessment(repoRoot ?? projectRoot);
  if (!upstream || !riskAssessment) {
    emit(
      'ask',
      !riskAssessment
        ? 'Risk assessment is missing for a dangerous command.'
        : 'Dangerous command requires an upstream branch.',
      cwd,
      command
    );
    process.exit(0);
  }

  emit('allow', 'Dangerous command is covered by risk assessment and upstream branch.', cwd, command);
  process.exit(0);
}

emit('allow', 'Command did not trigger a safety restriction.', cwd, command);
NODE

if declare -F harness_record_runtime_hook_evidence >/dev/null 2>&1; then
  harness_record_runtime_hook_evidence \
    "$platform" \
    "safety" \
    "PreToolUse" \
    "$project_root" \
    "$cwd" \
    "$script_name" \
    "$script_path" || true
fi
