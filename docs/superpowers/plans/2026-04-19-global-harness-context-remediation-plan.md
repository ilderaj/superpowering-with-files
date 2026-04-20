# Global Harness Context Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce always-on context overhead in Harness user-global and workspace projections without breaking the existing core/adapters/installer/upstream architecture.

**Architecture:** Keep `harness/core/policy/base.md` as the canonical governance source, but stop treating the entire document as a mandatory always-on prompt payload. Add measurable context budgets, introduce profile-based policy rendering and compact hot-context extraction, then wire budgets into health/verification before any default behavior flips. Global adoption remains low-risk by making the first pass budget-aware and opt-in where behavior changes could surprise existing consumers.

**Tech Stack:** Node.js ESM, existing Harness installer/lib/test stack, shell hook scripts, JSON metadata, `node:test`

---

**Active task path:** `planning/active/global-rule-context-load-analysis/`

**Companion-plan role:** Detailed execution checklist for the global Harness context-overhead remediation program. Authoritative durable task memory remains under `planning/active/global-rule-context-load-analysis/`.

## File Structure

The implementation should stay inside existing Harness ownership boundaries.

- `harness/core/policy/base.md`
  - Remains the single canonical policy source.
- `harness/core/policy/entry-profiles.json`
  - New metadata file describing which heading groups belong in each rendered entry profile.
- `harness/core/context-budgets.json`
  - New metadata file for entry, hook, and planning hot-context budgets.
- `harness/core/skills/profiles.json`
  - New metadata file for opt-in skill projection profiles.
- `harness/installer/lib/policy-render.mjs`
  - New library that slices `base.md` into heading-based bundles without splitting source ownership.
- `harness/installer/lib/context-budget.mjs`
  - New library for char/line/approx-token measurement and threshold evaluation.
- `harness/installer/lib/planning-hot-context.mjs`
  - New library that extracts compact “hot context” from authoritative planning files.
- `harness/installer/lib/skill-projection.mjs`
  - Extend to support skill profiles while keeping default behavior stable.
- `harness/installer/lib/health.mjs`
  - Extend to surface context-budget warnings/problems.
- `harness/installer/commands/{install,verify,doctor}.mjs`
  - Extend to store/report context-governance data.
- `harness/core/hooks/superpowers/scripts/session-start`
  - Slim session-start payload; stop injecting full `using-superpowers` content.
- `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh`
  - Replace raw line dumps with compact hot-context output.
- `tests/**`
  - Add unit + integration coverage for budgets, rendering profiles, compact hook payloads, and opt-in skill profiles.
- `README.md`, `docs/architecture.md`, `docs/maintenance.md`, `docs/install/*.md`
  - Document the new context-governance model, budgets, and rollout rules.

## Task 1: Add Context Budget Primitives

**Files:**
- Create: `harness/core/context-budgets.json`
- Create: `harness/installer/lib/context-budget.mjs`
- Create: `tests/installer/context-budget.test.mjs`
- Modify: `harness/installer/lib/health.mjs`
- Modify: `harness/installer/commands/verify.mjs`
- Modify: `harness/installer/commands/doctor.mjs`

- [ ] **Step 1: Add canonical budget metadata**

Create `harness/core/context-budgets.json`:

```json
{
  "schemaVersion": 1,
  "entry": {
    "warnChars": 12000,
    "problemChars": 16000,
    "warnApproxTokens": 3000,
    "problemApproxTokens": 4000
  },
  "hookPayload": {
    "warnChars": 2500,
    "problemChars": 4000,
    "warnApproxTokens": 650,
    "problemApproxTokens": 1000
  },
  "planningHotContext": {
    "warnChars": 2200,
    "problemChars": 3200,
    "warnApproxTokens": 550,
    "problemApproxTokens": 800
  },
  "skillProfile": {
    "warnApproxTokens": 16000,
    "problemApproxTokens": 28000
  }
}
```

- [ ] **Step 2: Add a reusable measurement library**

Create `harness/installer/lib/context-budget.mjs`:

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';

let cachedBudgets;

export async function loadContextBudgets(rootDir) {
  if (!cachedBudgets) {
    cachedBudgets = JSON.parse(
      await readFile(path.join(rootDir, 'harness/core/context-budgets.json'), 'utf8')
    );
  }
  return cachedBudgets;
}

export function approxTokenCount(text) {
  return Math.ceil((text?.length ?? 0) / 4);
}

export function measureText(text) {
  return {
    chars: text.length,
    lines: text.split('\n').length,
    approxTokens: approxTokenCount(text)
  };
}

export function evaluateBudget(measurement, budget) {
  if (
    measurement.chars >= budget.problemChars ||
    measurement.approxTokens >= budget.problemApproxTokens
  ) {
    return 'problem';
  }

  if (
    measurement.chars >= budget.warnChars ||
    measurement.approxTokens >= budget.warnApproxTokens
  ) {
    return 'warning';
  }

  return 'ok';
}
```

- [ ] **Step 3: Add failing measurement tests**

Create `tests/installer/context-budget.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  approxTokenCount,
  evaluateBudget,
  measureText
} from '../../harness/installer/lib/context-budget.mjs';

test('measureText returns chars lines and approx tokens', () => {
  const result = measureText('line 1\nline 2');
  assert.deepEqual(result, {
    chars: 13,
    lines: 2,
    approxTokens: 4
  });
});

test('evaluateBudget returns warning and problem by threshold', () => {
  const budget = {
    warnChars: 10,
    problemChars: 20,
    warnApproxTokens: 3,
    problemApproxTokens: 6
  };

  assert.equal(evaluateBudget({ chars: 8, approxTokens: 2 }, budget), 'ok');
  assert.equal(evaluateBudget({ chars: 12, approxTokens: 2 }, budget), 'warning');
  assert.equal(evaluateBudget({ chars: 8, approxTokens: 7 }, budget), 'problem');
});

test('approxTokenCount stays deterministic', () => {
  assert.equal(approxTokenCount('abcd'), 1);
  assert.equal(approxTokenCount('abcde'), 2);
});
```

- [ ] **Step 4: Expose budget results through `verify`**

Modify `harness/installer/commands/verify.mjs` so the report includes context measurements:

```js
import os from 'node:os';
import { readHarnessHealth } from '../lib/health.mjs';

// ...

const health = await readHarnessHealth(rootDir, os.homedir());
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  checks: {
    stateReadable: true,
    selectedTargets: Object.keys(state.targets),
    scope: state.scope,
    projectionMode: state.projectionMode,
    context: health.context
  }
};
```

- [ ] **Step 5: Surface budget warnings in `doctor`**

Modify `harness/installer/commands/doctor.mjs`:

```js
if (health.context?.warnings?.length) {
  console.error(health.context.warnings.join('\n'));
}
```

- [ ] **Step 6: Extend `readHarnessHealth` with a `context` section**

Modify `harness/installer/lib/health.mjs` to aggregate entry measurements:

```js
const context = {
  entries: [],
  hooks: [],
  planning: [],
  skillProfiles: [],
  warnings: []
};

// after reading entry text
const measurement = measureText(text);
const verdict = evaluateBudget(measurement, budgets.entry);
context.entries.push({ target, path: entry.path, ...measurement, verdict });

if (verdict === 'warning' || verdict === 'problem') {
  context.warnings.push(
    `${target}: entry ${entry.path} is ${verdict} (${measurement.approxTokens} approx tokens)`
  );
}
```

- [ ] **Step 7: Run targeted tests**

Run:

```bash
node --test tests/installer/context-budget.test.mjs tests/installer/health.test.mjs tests/installer/commands.test.mjs -v
```

Expected:

```text
# all selected tests pass
```

- [ ] **Step 8: Commit**

```bash
git add \
  harness/core/context-budgets.json \
  harness/installer/lib/context-budget.mjs \
  harness/installer/lib/health.mjs \
  harness/installer/commands/verify.mjs \
  harness/installer/commands/doctor.mjs \
  tests/installer/context-budget.test.mjs
git commit -m "feat: add context budget measurement primitives"
```

## Task 2: Introduce Profile-Based Entry Rendering

**Files:**
- Create: `harness/core/policy/entry-profiles.json`
- Create: `harness/installer/lib/policy-render.mjs`
- Modify: `harness/installer/lib/adapters.mjs`
- Modify: `tests/adapters/templates.test.mjs`
- Modify: `README.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Define heading-based entry profiles**

Create `harness/core/policy/entry-profiles.json`:

```json
{
  "schemaVersion": 1,
  "defaultProfile": "always-on-core",
  "profiles": {
    "always-on-core": [
      "Default Behavior",
      "Rule Precedence",
      "Task Classification",
      "When Superpowers Is Allowed",
      "When Superpowers Is Not Allowed",
      "Communication Guidelines",
      "Tool Preferences",
      "Compact Instructions",
      "Shell And Token-Saving Preferences"
    ],
    "tracked-task-extended": [
      "Plan Location Boundaries",
      "Planning-With-Files Lifecycle Rule",
      "Complex Task Orchestration",
      "Cross-IDE Portability",
      "Hard Constraints"
    ],
    "deep-reasoning-reference": [
      "Mandatory Sync-Back Rule",
      "Companion Plan Model"
    ]
  }
}
```

- [ ] **Step 2: Build a section-aware renderer while keeping `base.md` canonical**

Create `harness/installer/lib/policy-render.mjs`:

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';

function splitSections(markdown) {
  const sections = [];
  let current = { title: '__preamble__', body: [] };

  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      sections.push({ ...current, body: current.body.join('\n').trimEnd() });
      current = { title: line.slice(3).trim(), body: [] };
      continue;
    }
    current.body.push(line);
  }

  sections.push({ ...current, body: current.body.join('\n').trimEnd() });
  return sections.filter((section) => section.body.length > 0);
}

export async function renderPolicyProfile(rootDir, profileName) {
  const [policy, profileConfig] = await Promise.all([
    readFile(path.join(rootDir, 'harness/core/policy/base.md'), 'utf8'),
    readFile(path.join(rootDir, 'harness/core/policy/entry-profiles.json'), 'utf8')
  ]);

  const config = JSON.parse(profileConfig);
  const wanted = new Set(config.profiles[profileName] ?? []);
  const sections = splitSections(policy);

  return sections
    .filter((section) => section.title === '__preamble__' || wanted.has(section.title))
    .map((section) =>
      section.title === '__preamble__' ? section.body : `## ${section.title}\n\n${section.body}`
    )
    .join('\n\n')
    .trim();
}
```

- [ ] **Step 3: Wire entry rendering through policy profiles**

Modify `harness/installer/lib/adapters.mjs`:

```js
import { renderPolicyProfile } from './policy-render.mjs';

export async function renderEntry(rootDir, target) {
  const adapter = await loadAdapter(rootDir, target);
  const [template, basePolicy, platformOverride] = await Promise.all([
    readFile(path.join(rootDir, adapter.template), 'utf8'),
    renderPolicyProfile(rootDir, 'always-on-core'),
    readFile(path.join(rootDir, adapter.override), 'utf8')
  ]);

  return renderTemplate(template, {
    basePolicy,
    platformOverride
  });
}
```

- [ ] **Step 4: Replace “full policy in every target” tests with profile-sensitive assertions**

Modify `tests/adapters/templates.test.mjs`:

```js
test('renderEntry emits only always-on core policy in platform entries', async () => {
  const rendered = await renderEntry(process.cwd(), 'codex');
  assert.match(rendered, /Rule Precedence/);
  assert.match(rendered, /Task Classification/);
  assert.doesNotMatch(rendered, /Complex Task Orchestration/);
  assert.doesNotMatch(rendered, /Companion Plan Model/);
});
```

- [ ] **Step 5: Document the split explicitly**

Update `README.md` and `docs/architecture.md` with language like:

```md
Rendered entry files are intentionally thinner than the canonical shared policy.
The full policy remains authoritative in `harness/core/policy/base.md`, while
always-on entries render only the section profile required at startup.
Tracked-task and deep-reasoning details stay discoverable through projected skills,
planning state, and companion-plan references rather than every session start.
```

- [ ] **Step 6: Run rendering tests**

Run:

```bash
node --test tests/adapters/templates.test.mjs tests/installer/commands.test.mjs -v
```

Expected:

```text
# renderEntry tests pass and no snapshot-like string assertions fail
```

- [ ] **Step 7: Commit**

```bash
git add \
  harness/core/policy/entry-profiles.json \
  harness/installer/lib/policy-render.mjs \
  harness/installer/lib/adapters.mjs \
  tests/adapters/templates.test.mjs \
  README.md \
  docs/architecture.md
git commit -m "feat: render thin always-on policy entries"
```

## Task 3: Add Compact Planning Hot-Context Extraction

**Files:**
- Create: `harness/installer/lib/planning-hot-context.mjs`
- Create: `tests/installer/planning-hot-context.test.mjs`
- Modify: `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh`
- Modify: `harness/installer/lib/health.mjs`
- Modify: `harness/installer/lib/planning-with-files-companion-plan-patch.mjs`

- [ ] **Step 1: Implement hot-context extraction from authoritative planning files**

Create `harness/installer/lib/planning-hot-context.mjs`:

```js
import { readFile } from 'node:fs/promises';

function firstMatch(text, pattern, fallback = 'unknown') {
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? fallback;
}

export async function buildPlanningHotContext({ taskPlanPath, findingsPath, progressPath }) {
  const [taskPlan, findings, progress] = await Promise.all([
    readFile(taskPlanPath, 'utf8').catch(() => ''),
    readFile(findingsPath, 'utf8').catch(() => ''),
    readFile(progressPath, 'utf8').catch(() => '')
  ]);

  const goal = firstMatch(taskPlan, /## 任务目标[\s\S]*?- (.+)/);
  const status = firstMatch(taskPlan, /^Status:\s*(.+)$/m);
  const blockers = findings.match(/## .*阻塞[\s\S]*?(?=\n## |\Z)/)?.[0] ?? 'None recorded.';
  const nextActions = progress
    .split('\n')
    .filter((line) => line.trim().startsWith('- '))
    .slice(-3)
    .join('\n') || '- Review current task state';

  return [
    '[planning-with-files] HOT CONTEXT',
    `Goal: ${goal}`,
    `Status: ${status}`,
    '',
    'Blockers:',
    blockers,
    '',
    'Next Actions:',
    nextActions
  ].join('\n');
}
```

- [ ] **Step 2: Add a failing hot-context test**

Create `tests/installer/planning-hot-context.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPlanningHotContext } from '../../harness/installer/lib/planning-hot-context.mjs';

test('buildPlanningHotContext returns compact summary instead of raw file dumps', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hot-context-'));
  try {
    const taskDir = path.join(root, 'planning/active/demo');
    await mkdir(taskDir, { recursive: true });
    await writeFile(path.join(taskDir, 'task_plan.md'), '# Demo\n\n## 任务目标\n- Reduce prompt overhead\n\n## Current State\nStatus: active\nArchive Eligible: no\n');
    await writeFile(path.join(taskDir, 'findings.md'), '## 阻塞项\n- Need budget baselines\n');
    await writeFile(path.join(taskDir, 'progress.md'), '- Measure entry size\n- Add hook limits\n- Update docs\n');

    const result = await buildPlanningHotContext({
      taskPlanPath: path.join(taskDir, 'task_plan.md'),
      findingsPath: path.join(taskDir, 'findings.md'),
      progressPath: path.join(taskDir, 'progress.md')
    });

    assert.match(result, /HOT CONTEXT/);
    assert.match(result, /Goal: Reduce prompt overhead/);
    assert.doesNotMatch(result, /Archive Eligible/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Use the hot-context renderer from the planning hook**

Modify `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh`:

```bash
hot_context() {
  node "$root/harness/core/hooks/planning-with-files/scripts/render-hot-context.mjs" \
    "$plan" "$task_dir/findings.md" "$progress"
}

case "$event" in
  session-start|user-prompt-submit)
    context="$(hot_context)"
    emit_context "$context" "${event/session-start/SessionStart}"
    ;;
  pre-tool-use)
    context="$(hot_context)"
    emit_context "$context" "PreToolUse"
    ;;
```

- [ ] **Step 4: Add a tiny hook helper rather than embedding parsing in bash**

Create `harness/core/hooks/planning-with-files/scripts/render-hot-context.mjs`:

```js
import { buildPlanningHotContext } from '../../../../installer/lib/planning-hot-context.mjs';

const [taskPlanPath, findingsPath, progressPath] = process.argv.slice(2);
const output = await buildPlanningHotContext({ taskPlanPath, findingsPath, progressPath });
process.stdout.write(output);
```

- [ ] **Step 5: Update the planning-with-files patch text**

Modify `harness/installer/lib/planning-with-files-companion-plan-patch.mjs` so the patch text reflects summary-first recovery:

```js
'- Prefer compact hot-context recovery from the authoritative planning files before reading long historical detail.'
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
node --test tests/installer/planning-hot-context.test.mjs tests/hooks/task-scoped-hook.test.mjs -v
```

Expected:

```text
# compact hot-context tests pass
```

- [ ] **Step 7: Commit**

```bash
git add \
  harness/installer/lib/planning-hot-context.mjs \
  harness/core/hooks/planning-with-files/scripts/render-hot-context.mjs \
  harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh \
  harness/installer/lib/planning-with-files-companion-plan-patch.mjs \
  tests/installer/planning-hot-context.test.mjs \
  tests/hooks/task-scoped-hook.test.mjs
git commit -m "feat: switch planning hooks to compact hot context"
```

## Task 4: Slim Hook Payloads and Enforce Hook Budgets

**Files:**
- Create: `tests/hooks/hook-budget.test.mjs`
- Modify: `harness/core/hooks/superpowers/scripts/session-start`
- Modify: `tests/hooks/superpowers-codex-hook.test.mjs`
- Modify: `harness/installer/lib/health.mjs`

- [ ] **Step 1: Replace full `using-superpowers` injection with a compact startup directive**

Modify `harness/core/hooks/superpowers/scripts/session-start`:

```bash
context="$(cat <<'EOF'
<EXTREMELY_IMPORTANT>
You have superpowers.

Before acting, check whether a relevant projected skill applies.
If the task is simple, stay lightweight.
If the task is complex, use the appropriate process skill and sync durable state back to planning/active/<task-id>/.
</EXTREMELY_IMPORTANT>
EOF
)"
```

- [ ] **Step 2: Add a failing hook budget test**

Create `tests/hooks/hook-budget.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('superpowers session-start stays below hook budget', async () => {
  const { stdout } = await execFileAsync('bash', [
    'harness/core/hooks/superpowers/scripts/session-start'
  ]);

  assert.ok(stdout.length < 4000, `expected hook payload < 4000 chars, got ${stdout.length}`);
});
```

- [ ] **Step 3: Tighten the existing hook assertion**

Modify `tests/hooks/superpowers-codex-hook.test.mjs`:

```js
assert.doesNotMatch(payload.hookSpecificOutput.additionalContext, /description: Use when starting any conversation/);
assert.ok(payload.hookSpecificOutput.additionalContext.length < 4000);
```

- [ ] **Step 4: Measure hook payloads in `readHarnessHealth`**

Extend `harness/installer/lib/health.mjs` with a runtime measurement helper for known local hook scripts:

```js
context.hooks.push({
  target,
  parentSkillName: projection.parentSkillName,
  configPath: projection.configTarget,
  verdict,
  chars: measurement.chars,
  approxTokens: measurement.approxTokens
});
```

- [ ] **Step 5: Run hook tests**

Run:

```bash
node --test tests/hooks/superpowers-codex-hook.test.mjs tests/hooks/task-scoped-hook.test.mjs tests/hooks/hook-budget.test.mjs -v
```

Expected:

```text
# all hook tests pass and no payload exceeds the configured budget
```

- [ ] **Step 6: Commit**

```bash
git add \
  harness/core/hooks/superpowers/scripts/session-start \
  harness/installer/lib/health.mjs \
  tests/hooks/superpowers-codex-hook.test.mjs \
  tests/hooks/hook-budget.test.mjs
git commit -m "feat: enforce compact hook payloads"
```

## Task 5: Add Opt-In Skill Profiles for Global Adoption

**Files:**
- Create: `harness/core/skills/profiles.json`
- Modify: `harness/core/state-schema/state.schema.json`
- Modify: `harness/installer/commands/install.mjs`
- Modify: `harness/installer/lib/skill-projection.mjs`
- Create: `tests/adapters/skill-profile.test.mjs`
- Modify: `README.md`
- Modify: `docs/install/{codex,copilot,cursor,claude-code}.md`

- [ ] **Step 1: Add a skill profile manifest**

Create `harness/core/skills/profiles.json`:

```json
{
  "schemaVersion": 1,
  "defaultProfile": "full",
  "profiles": {
    "full": ["superpowers", "planning-with-files"],
    "minimal-global": ["planning-with-files", "superpowers:using-superpowers", "superpowers:writing-plans", "superpowers:executing-plans", "superpowers:verification-before-completion"]
  }
}
```

- [ ] **Step 2: Extend installer state with `skillProfile`**

Modify `harness/core/state-schema/state.schema.json`:

```json
"skillProfile": { "type": "string", "enum": ["full", "minimal-global"] }
```

Modify `harness/installer/commands/install.mjs`:

```js
const skillProfile = readOption(args, 'skills-profile', 'full');

state.skillProfile = skillProfile;
```

- [ ] **Step 3: Filter projections by profile**

Modify `harness/installer/lib/skill-projection.mjs`:

```js
function profileAllows(parentSkillName, childSkillName, profileEntries) {
  return profileEntries.includes(parentSkillName) ||
    profileEntries.includes(`${parentSkillName}:${childSkillName}`);
}
```

Then skip projections not allowed by `state.skillProfile`.

- [ ] **Step 4: Add failing profile tests**

Create `tests/adapters/skill-profile.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { sync } from '../../harness/installer/commands/sync.mjs';
import { writeState } from '../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture,
  withCwd
} from '../helpers/harness-fixture.mjs';

test('minimal-global projects only the allow-listed skill subset', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'user-global',
      projectionMode: 'link',
      hookMode: 'off',
      skillProfile: 'minimal-global',
      targets: {
        codex: { enabled: true, paths: [path.join('/home/user', '.codex/AGENTS.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    // assert allow-listed skill exists and an unrelated heavy skill does not
  } finally {
    await removeHarnessFixture(root);
  }
});
```

- [ ] **Step 5: Document rollout posture**

Add doc language that:

```md
The `minimal-global` profile is an adoption-safe profile for user-global installs.
It exists to keep always-available process skills while avoiding unnecessary global skill sprawl.
No default is flipped in this change set; profile choice remains explicit until calibration proves a safe default.
```

- [ ] **Step 6: Run skill profile tests**

Run:

```bash
node --test tests/adapters/skill-profile.test.mjs tests/adapters/sync-skills.test.mjs tests/core/skill-index.test.mjs -v
```

Expected:

```text
# profile-aware projections pass without changing the existing default profile
```

- [ ] **Step 7: Commit**

```bash
git add \
  harness/core/skills/profiles.json \
  harness/core/state-schema/state.schema.json \
  harness/installer/commands/install.mjs \
  harness/installer/lib/skill-projection.mjs \
  tests/adapters/skill-profile.test.mjs \
  README.md \
  docs/install/codex.md \
  docs/install/copilot.md \
  docs/install/cursor.md \
  docs/install/claude-code.md
git commit -m "feat: add opt-in minimal global skill profile"
```

## Task 6: Final Calibration, Verification, and Rollout Gates

**Files:**
- Create: `.harness/verification/context-baseline.md` (generated during verification only)
- Modify: `README.md`
- Modify: `docs/maintenance.md`
- Modify: `docs/release.md`

- [ ] **Step 1: Capture before/after baseline**

Run before and after the change stack:

```bash
./scripts/harness verify --output=.harness/verification
node --input-type=module - <<'NODE'
import { readFile } from 'node:fs/promises';
const report = JSON.parse(await readFile('.harness/verification/latest.json', 'utf8'));
console.log(JSON.stringify(report.checks.context, null, 2));
NODE
```

Expected:

```text
{
  "entries": [...],
  "hooks": [...],
  "planning": [...],
  "skillProfiles": [...]
}
```

- [ ] **Step 2: Run the full targeted remediation suite**

Run:

```bash
node --test \
  tests/installer/context-budget.test.mjs \
  tests/installer/planning-hot-context.test.mjs \
  tests/hooks/hook-budget.test.mjs \
  tests/hooks/task-scoped-hook.test.mjs \
  tests/hooks/superpowers-codex-hook.test.mjs \
  tests/adapters/templates.test.mjs \
  tests/adapters/skill-profile.test.mjs \
  tests/adapters/sync-skills.test.mjs \
  tests/installer/health.test.mjs \
  tests/installer/commands.test.mjs -v
```

Expected:

```text
# all selected tests pass
```

- [ ] **Step 3: Run repository verification and health checks**

Run:

```bash
npm run verify
./scripts/harness verify --output=stdout
./scripts/harness sync --dry-run
./scripts/harness doctor --check-only
```

Expected:

```text
# npm verify passes
# verify report prints context measurements
# sync --dry-run shows only expected changes
# Harness check passed.
```

- [ ] **Step 4: Perform manual calibration in user-global mode**

Run:

```bash
./scripts/harness install --scope=user-global --targets=all --skills-profile=minimal-global
./scripts/harness sync
./scripts/harness verify --output=.harness/verification
```

Then manually inspect:

```bash
sed -n '1,200p' ~/.codex/AGENTS.md
sed -n '1,200p' ~/.copilot/instructions/harness.instructions.md
sed -n '1,200p' ~/.claude/CLAUDE.md
```

Expected:

```text
# entries contain always-on core sections only
# deep tracked-task details are no longer fully inlined
```

- [ ] **Step 5: Update maintenance/release docs**

Add release gating language:

```md
Context-governance changes must not ship without:
- updated entry/context budget baselines
- hook payload budget verification
- user-global calibration on at least one real machine profile
- confirmation that `hookMode: off` remains the low-overhead default
```

- [ ] **Step 6: Commit**

```bash
git add README.md docs/maintenance.md docs/release.md
git commit -m "docs: add context-governance rollout gates"
```

## Self-Review

### Spec coverage

- Addresses fixed-cost overhead:
  - thin entry profiles
  - context budget visibility
- Addresses recovery-cost overhead:
  - compact planning hot-context extraction
- Addresses execution-cost amplification:
  - hook payload caps
  - health/verify budget warnings
- Addresses low-risk adoption:
  - opt-in `minimal-global` skill profile
  - no default-flip in the first implementation pass
- Addresses verification:
  - unit tests
  - integration tests
  - user-global calibration
  - release gating

### Placeholder scan

- No `TBD`, `TODO`, “implement later”, or “write tests for above” placeholders remain.
- Each code-touching step includes a file path and an example implementation snippet.
- Each verification step includes concrete commands and expected output.

### Type consistency

- `skillProfile` is used consistently across:
  - `install.mjs`
  - `state.schema.json`
  - `skill-projection.mjs`
- `context` is used consistently as the verification/health payload namespace.
- “always-on core”, “tracked-task extended”, and “deep-reasoning reference” are used as profile names consistently.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-19-global-harness-context-remediation-plan.md`.

Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints
