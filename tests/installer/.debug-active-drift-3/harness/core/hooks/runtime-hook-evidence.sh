harness_resolve_project_root() {
  if [ -n "${HARNESS_PROJECT_ROOT:-}" ]; then
    printf '%s\n' "$HARNESS_PROJECT_ROOT"
    return 0
  fi

  HARNESS_AUTHORITY_START_DIR="${1:-$(pwd)}" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const startDir = process.env.HARNESS_AUTHORITY_START_DIR || process.cwd();
const overrideRelativePath = path.join('.harness', 'authority-root.json');
const authorityMarkers = [
  path.join('.harness', 'state.json'),
  path.join('planning', 'active'),
  path.join('scripts', 'harness')
];

function pathExists(targetPath) {
  try {
    fs.accessSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

function resolveRealPath(targetPath) {
  try {
    return (fs.realpathSync.native ?? fs.realpathSync)(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function parentDirectories(startPath) {
  const directories = [];
  let current = path.resolve(startPath);

  while (true) {
    directories.push(current);
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return directories;
}

function readOverrideRoot(overridePath) {
  const parsed = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== 1) {
    throw new Error(`Invalid authority-root override: ${overridePath}`);
  }
  if (typeof parsed.authorityRoot !== 'string' || !parsed.authorityRoot.trim()) {
    throw new Error(`Invalid authority-root override target: ${overridePath}`);
  }
  return resolveRealPath(path.resolve(path.dirname(overridePath), parsed.authorityRoot));
}

const cwd = resolveRealPath(startDir);

for (const candidateDir of parentDirectories(cwd)) {
  const overridePath = path.join(candidateDir, overrideRelativePath);
  if (pathExists(overridePath)) {
    process.stdout.write(`${readOverrideRoot(overridePath)}\n`);
    process.exit(0);
  }
}

for (const candidateDir of parentDirectories(cwd)) {
  for (const marker of authorityMarkers) {
    if (pathExists(path.join(candidateDir, marker))) {
      process.stdout.write(`${resolveRealPath(candidateDir)}\n`);
      process.exit(0);
    }
  }
}

try {
  const gitRoot = execSync('git rev-parse --show-toplevel', {
    cwd,
    stdio: ['ignore', 'pipe', 'ignore']
  })
    .toString()
    .trim();
  if (gitRoot) {
    process.stdout.write(`${resolveRealPath(gitRoot)}\n`);
    process.exit(0);
  }
} catch {}

process.stdout.write(`${cwd}\n`);
NODE
}

harness_record_runtime_hook_evidence() {
  local target="$1"
  local parent_skill_name="$2"
  local event_name="$3"
  local project_root="$4"
  local cwd="$5"
  local script_name="$6"
  local script_path="$7"

  HARNESS_RUNTIME_TARGET="$target" \
  HARNESS_RUNTIME_PARENT_SKILL="$parent_skill_name" \
  HARNESS_RUNTIME_EVENT_NAME="$event_name" \
  HARNESS_RUNTIME_PROJECT_ROOT="$project_root" \
  HARNESS_RUNTIME_CWD="$cwd" \
  HARNESS_RUNTIME_SCRIPT_NAME="$script_name" \
  HARNESS_RUNTIME_SCRIPT_PATH="$script_path" \
  node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const record = {
  schemaVersion: 1,
  source: 'harness-runtime-hook',
  target: process.env.HARNESS_RUNTIME_TARGET ?? '',
  parentSkillName: process.env.HARNESS_RUNTIME_PARENT_SKILL ?? '',
  eventName: process.env.HARNESS_RUNTIME_EVENT_NAME ?? '',
  observedAt: new Date().toISOString(),
  projectRoot: process.env.HARNESS_RUNTIME_PROJECT_ROOT ?? '',
  cwd: process.env.HARNESS_RUNTIME_CWD ?? '',
  scriptName: process.env.HARNESS_RUNTIME_SCRIPT_NAME ?? '',
  scriptPath: process.env.HARNESS_RUNTIME_SCRIPT_PATH ?? ''
};

const logPath = path.join(record.projectRoot, '.harness/runtime-hooks', `${record.target}.jsonl`);
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
NODE
}
