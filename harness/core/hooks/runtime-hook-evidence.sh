harness_resolve_project_root() {
  if [ -n "${HARNESS_PROJECT_ROOT:-}" ]; then
    printf '%s\n' "$HARNESS_PROJECT_ROOT"
    return 0
  fi

  pwd
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
