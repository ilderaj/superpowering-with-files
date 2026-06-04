# Runtime Harness Plugin Productization And 1.0.6 Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Productize this repository into a monorepo-distributed runtime harness plugin system and publish GitHub release `1.0.6` with installable packed plugin artifacts for Codex, Claude Code, Cursor, and GitHub Copilot.

**Architecture:** Keep this repository as the source-of-truth monorepo. Extract the reusable runtime into `packages/harness-runtime`, put plugin build/conformance utilities in `packages/plugin-kit`, and generate platform-specific plugin wrappers under `plugins/{codex,claude-code,cursor,copilot}`. Release artifacts are produced from the workspace build, not from live user-global projections or active planning state.

**Tech Stack:** Node.js ESM, npm workspaces, `node:test`, `@modelcontextprotocol/sdk`, `zod`, tar/gzip packaging, GitHub CLI (`gh`), current Harness CLI and MCP runtime.

**Active task path:** `planning/active/codex-cc-runtime-plugin-feasibility/`

**Companion plan path:** `docs/superpowers/plans/2026-05-31-runtime-harness-plugin-release-plan.md`

**Lifecycle state:** waiting_review until the user approves execution.

**Sync-back status:** Plan created for review; execution progress must be synced back after every phase.

---

## Non-Negotiable Release Invariants

- The release version is `1.0.6`, because current Git tags show latest `1.0.5`; root `package.json` is currently stale at `0.1.0` and must be aligned.
- The repository remains a monorepo/workspace for this release. Do not split into a new repository during this implementation.
- The final GitHub release must attach packed plugin artifacts for all four supported IDE targets: Codex, Claude Code, Cursor, GitHub Copilot.
- A packed plugin artifact is a self-contained `.tgz` containing one platform plugin root and no active task state, no user-global live projections, no archive planning history, no test fixtures unless intentionally included as plugin self-test assets.
- `planning/active/**` is runtime instance state and must never be included in plugin packages.
- MCP write tools remain plan/approval/apply/receipt gated. No plugin wrapper may expose write behavior as direct shell execution.
- Existing user-global adoption must migrate through inspect/shadow/dual-run/cutover/cleanup, never by deleting `~/.codex`, `~/.claude`, `~/.agents`, `~/.copilot`, or `~/.cursor` as a first step.
- Release is blocked unless `npm run verify`, `npm run plugin:verify`, `./scripts/harness doctor --check-only`, packed artifact integrity checks, and all four plugin smoke tests pass or produce explicitly reviewed evidence that the target host does not expose a scriptable local install path.

## Required Skills At Execution Time

- Before implementation starts, use `superpowers:using-git-worktrees` to create an isolated worktree from `dev`.
- Use `superpowers:test-driven-development` for all code changes.
- Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` for task execution.
- Use `superpowers:verification-before-completion` before claiming completion, before tagging, and before GitHub release creation.
- Use `planning-with-files` continuously. Update:
  - `planning/active/codex-cc-runtime-plugin-feasibility/task_plan.md`
  - `planning/active/codex-cc-runtime-plugin-feasibility/findings.md`
  - `planning/active/codex-cc-runtime-plugin-feasibility/progress.md`

## External Platform Facts To Reconfirm Before Code

The executing agent must browse official docs again before implementation because these plugin surfaces are moving targets.

- Codex: official plugins, plugin build, hooks, MCP, and marketplace docs.
- Claude Code: official plugins and plugin reference docs.
- GitHub Copilot: official Agent Skills, Copilot CLI plugins/customization, and MCP support docs.
- Cursor: official plugin, rules, hooks, and MCP docs or first-party changelog if docs lag the product.

Record source URLs and date in `findings.md`. If a documented install command differs from the assumptions below, update this companion plan first, then continue.

## Target Artifact Names

The release build must create these files under `dist/release/1.0.6/`:

```text
dist/release/1.0.6/harness-runtime-1.0.6.tgz
dist/release/1.0.6/harness-codex-plugin-1.0.6.tgz
dist/release/1.0.6/harness-claude-code-plugin-1.0.6.tgz
dist/release/1.0.6/harness-cursor-plugin-1.0.6.tgz
dist/release/1.0.6/harness-copilot-plugin-1.0.6.tgz
dist/release/1.0.6/SHA256SUMS
dist/release/1.0.6/manifest.json
dist/release/1.0.6/release-notes.md
```

The packed plugin tarballs must unpack with these top-level roots:

```text
harness-codex-plugin/
harness-claude-code-plugin/
harness-cursor-plugin/
harness-copilot-plugin/
```

## Planned File Structure

Create:

```text
packages/harness-runtime/package.json
packages/harness-runtime/bin/harness
packages/harness-runtime/bin/harness-mcp-stdio.mjs
packages/harness-runtime/src/index.mjs
packages/harness-runtime/src/paths.mjs
packages/plugin-kit/package.json
packages/plugin-kit/src/artifact-manifest.mjs
packages/plugin-kit/src/build-all.mjs
packages/plugin-kit/src/build-plugin.mjs
packages/plugin-kit/src/pack-plugin.mjs
packages/plugin-kit/src/platform-contracts.mjs
packages/plugin-kit/src/preflight.mjs
packages/plugin-kit/src/sha256.mjs
packages/plugin-kit/src/smoke.mjs
packages/plugin-kit/schemas/harness-plugin.schema.json
plugins/codex/plugin.harness.json
plugins/claude-code/plugin.harness.json
plugins/cursor/plugin.harness.json
plugins/copilot/plugin.harness.json
tests/plugin-kit/artifact-manifest.test.mjs
tests/plugin-kit/build-plugin.test.mjs
tests/plugin-kit/pack-plugin.test.mjs
tests/plugin-kit/platform-contracts.test.mjs
tests/plugin-kit/preflight.test.mjs
tests/plugin-kit/smoke.test.mjs
docs/install/plugin-migration.md
docs/release-plugin-artifacts.md
```

Modify:

```text
package.json
package-lock.json
README.md
docs/architecture.md
docs/install/adoption-starter-kit.md
docs/install/codex.md
docs/install/claude-code.md
docs/install/platform-support.md
docs/release.md
harness/installer/commands/harness.mjs
harness/installer/commands/adoption-status.mjs
harness/installer/lib/adoption.mjs
harness/core/metadata/platforms.json
.gitignore
```

Add generated files during build only:

```text
dist/plugins/**
dist/release/**
```

Do not commit `dist/**` unless the release workflow explicitly stages release assets. The GitHub release must upload assets from the release build output.

## Phase 0: Worktree And Baseline

### Task 0.1: Create isolated execution worktree

**Files:**
- Modify: `planning/active/codex-cc-runtime-plugin-feasibility/progress.md`

- [ ] **Step 1: Create worktree using Harness helper**

Run:

```bash
./scripts/harness worktree-name --task codex-cc-runtime-plugin-feasibility --namespace runtime-plugin --json
```

Expected: JSON containing a unique branch and worktree path.

- [ ] **Step 2: Create branch/worktree from `dev`**

Run the branch/worktree command using the JSON output. The expected naming shape is:

```bash
git worktree add .worktrees/<generated-name> -b <generated-branch> dev
```

Expected: new isolated worktree on a branch with `runtime-plugin` in the name.

- [ ] **Step 3: Record worktree**

Append to `planning/active/codex-cc-runtime-plugin-feasibility/progress.md`:

```markdown
## Session: <timestamp UTC+8>

- **Goal:** Execute runtime harness plugin productization and release plan.
- **Worktree:** `.worktrees/<generated-name>`
- **Branch:** `<generated-branch>`
- **Base:** `dev @ <sha>`
- **Plan:** `docs/superpowers/plans/2026-05-31-runtime-harness-plugin-release-plan.md`
```

### Task 0.2: Baseline verification and dirty worktree guard

**Files:**
- Modify: `planning/active/codex-cc-runtime-plugin-feasibility/progress.md`
- Modify: `planning/active/codex-cc-runtime-plugin-feasibility/findings.md`

- [ ] **Step 1: Check dirty state**

Run:

```bash
git status --short
```

Expected in isolated worktree: only this task's planning files may be dirty before implementation. If homepage files or unrelated work appear, stop and ask the user.

- [ ] **Step 2: Run baseline tests**

Run:

```bash
npm run verify
npm run test:mcp
./scripts/harness sync --dry-run
./scripts/harness doctor --check-only
```

Expected: `npm run verify` and `npm run test:mcp` pass. If `doctor` fails because of pre-existing active-task or global adoption state, record exact output and create a targeted pre-release cleanup task; do not ignore it.

- [ ] **Step 3: Record baseline**

Append pass/fail table to `progress.md`. If a failure is pre-existing, add it to `findings.md` with an owner decision: fix before release, or block release.

## Phase 1: Platform Contract Reconfirmation

### Task 1.1: Add platform contract data model

**Files:**
- Create: `packages/plugin-kit/src/platform-contracts.mjs`
- Test: `tests/plugin-kit/platform-contracts.test.mjs`

- [ ] **Step 1: Write failing test**

Create `tests/plugin-kit/platform-contracts.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { platformContracts, supportedPluginTargets } from '../../packages/plugin-kit/src/platform-contracts.mjs';

test('all supported plugin targets have install and smoke contracts', () => {
  assert.deepEqual(supportedPluginTargets, ['codex', 'claude-code', 'cursor', 'copilot']);

  for (const target of supportedPluginTargets) {
    const contract = platformContracts[target];
    assert.equal(contract.target, target);
    assert.match(contract.displayName, /\S/);
    assert.ok(Array.isArray(contract.requiredFiles));
    assert.ok(contract.requiredFiles.length > 0);
    assert.ok(Array.isArray(contract.installEvidence));
    assert.ok(contract.installEvidence.length > 0);
    assert.ok(Array.isArray(contract.smokeCommands));
  }
});

test('copilot cloud contract is tools-only for MCP', () => {
  assert.equal(platformContracts.copilot.mcp.cloud.resources, false);
  assert.equal(platformContracts.copilot.mcp.cloud.prompts, false);
  assert.equal(platformContracts.copilot.mcp.cloud.tools, true);
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/plugin-kit/platform-contracts.test.mjs
```

Expected: fail because `platform-contracts.mjs` does not exist.

- [ ] **Step 3: Implement contract**

Create `packages/plugin-kit/src/platform-contracts.mjs`:

```js
export const supportedPluginTargets = ['codex', 'claude-code', 'cursor', 'copilot'];

export const platformContracts = {
  codex: {
    target: 'codex',
    displayName: 'Codex',
    pluginRoot: 'harness-codex-plugin',
    requiredFiles: ['.codex-plugin/plugin.json', 'skills', 'hooks/hooks.json', 'mcp/harness-runtime.mjs', 'AGENTS.md'],
    installEvidence: ['codex --version', 'codex plugin --help', 'codex mcp --help'],
    smokeCommands: ['codex plugin --help', 'codex mcp list'],
    mcp: {
      local: { tools: true, resources: true, prompts: false },
      cloud: { tools: true, resources: false, prompts: false }
    }
  },
  'claude-code': {
    target: 'claude-code',
    displayName: 'Claude Code',
    pluginRoot: 'harness-claude-code-plugin',
    requiredFiles: ['.claude-plugin/plugin.json', 'skills', 'hooks/hooks.json', '.mcp.json', 'CLAUDE.md'],
    installEvidence: ['claude --version', 'claude plugin --help'],
    smokeCommands: ['claude plugin --help'],
    mcp: {
      local: { tools: true, resources: true, prompts: false },
      cloud: { tools: false, resources: false, prompts: false }
    }
  },
  cursor: {
    target: 'cursor',
    displayName: 'Cursor',
    pluginRoot: 'harness-cursor-plugin',
    requiredFiles: ['plugin.json', 'rules', 'skills', 'hooks/hooks.json', 'mcp/harness-runtime.mjs'],
    installEvidence: ['cursor --version || true'],
    smokeCommands: [],
    mcp: {
      local: { tools: true, resources: true, prompts: false },
      cloud: { tools: false, resources: false, prompts: false }
    }
  },
  copilot: {
    target: 'copilot',
    displayName: 'GitHub Copilot',
    pluginRoot: 'harness-copilot-plugin',
    requiredFiles: ['plugin.json', 'skills', 'hooks/hooks.json', 'mcp/harness-runtime.mjs', 'instructions/harness.instructions.md'],
    installEvidence: ['gh --version', 'gh copilot --help || true'],
    smokeCommands: ['gh --version'],
    mcp: {
      local: { tools: true, resources: true, prompts: false },
      cloud: { tools: true, resources: false, prompts: false }
    }
  }
};
```

- [ ] **Step 4: Run test**

Run:

```bash
node --test tests/plugin-kit/platform-contracts.test.mjs
```

Expected: pass.

### Task 1.2: Reconfirm official docs and update findings

**Files:**
- Modify: `planning/active/codex-cc-runtime-plugin-feasibility/findings.md`
- Modify: `packages/plugin-kit/src/platform-contracts.mjs`

- [ ] **Step 1: Browse official docs**

Browse and record official source URLs for each target. Required minimum:

```text
Codex plugin docs
Codex plugin build/hooks docs
Codex MCP docs
Claude Code plugin docs
Claude Code plugin reference
GitHub Copilot Agent Skills docs
GitHub Copilot MCP/cloud-agent docs
GitHub Copilot CLI plugin/customization docs
Cursor plugin docs or first-party changelog
Cursor MCP docs
```

- [ ] **Step 2: Update contract if docs differ**

If any required file or install command differs, edit `platform-contracts.mjs` and rerun:

```bash
node --test tests/plugin-kit/platform-contracts.test.mjs
```

Expected: pass.

- [ ] **Step 3: Record sources**

Append a `Findings Record` with concrete timestamp and URLs. Include a `Known platform limitations` section.

## Phase 2: Workspace Package Boundary

### Task 2.1: Convert root package to workspace orchestrator

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write package boundary test**

Create `tests/plugin-kit/package-boundary.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('root package is a private workspace orchestrator at release version', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.version, '1.0.6');
  assert.deepEqual(pkg.workspaces, ['packages/*']);
  assert.equal(pkg.scripts['plugin:build'], 'node packages/plugin-kit/src/build-all.mjs');
  assert.equal(pkg.scripts['plugin:verify'], 'node --test tests/plugin-kit/*.test.mjs');
  assert.equal(pkg.scripts['release:pack'], 'node packages/plugin-kit/src/build-all.mjs --release');
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/plugin-kit/package-boundary.test.mjs
```

Expected: fail because root package is version `0.1.0` and has no workspaces/scripts.

- [ ] **Step 3: Modify root `package.json`**

Set root `package.json` to keep existing dependencies and scripts, and add these fields:

```json
{
  "version": "1.0.6",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "node --test",
    "test:mcp": "node --test --test-concurrency=1 tests/mcp/*.test.mjs",
    "test:core": "node --test tests/core/*.test.mjs",
    "test:plugin": "node --test tests/plugin-kit/*.test.mjs",
    "verify": "node --test tests/core/*.test.mjs tests/installer/*.test.mjs tests/adapters/*.test.mjs tests/automation/*.test.mjs && node --test --test-concurrency=1 tests/mcp/*.test.mjs && node --test tests/plugin-kit/*.test.mjs",
    "mcp:stdio": "node harness/mcp/stdio.mjs",
    "plugin:build": "node packages/plugin-kit/src/build-all.mjs",
    "plugin:verify": "node --test tests/plugin-kit/*.test.mjs",
    "plugin:smoke": "node packages/plugin-kit/src/smoke.mjs",
    "release:pack": "node packages/plugin-kit/src/build-all.mjs --release"
  }
}
```

Preserve existing dependencies.

- [ ] **Step 4: Refresh lockfile**

Run:

```bash
npm install --package-lock-only
node --test tests/plugin-kit/package-boundary.test.mjs
```

Expected: pass.

### Task 2.2: Create runtime package shell

**Files:**
- Create: `packages/harness-runtime/package.json`
- Create: `packages/harness-runtime/bin/harness`
- Create: `packages/harness-runtime/bin/harness-mcp-stdio.mjs`
- Create: `packages/harness-runtime/src/index.mjs`
- Create: `packages/harness-runtime/src/paths.mjs`
- Test: `tests/plugin-kit/runtime-package.test.mjs`

- [ ] **Step 1: Write failing test**

Create `tests/plugin-kit/runtime-package.test.mjs`:

```js
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

test('runtime package has public bin and files allowlist', async () => {
  const pkg = JSON.parse(await readFile('packages/harness-runtime/package.json', 'utf8'));
  assert.equal(pkg.name, '@superpowering-with-files/harness-runtime');
  assert.equal(pkg.version, '1.0.6');
  assert.equal(pkg.private, false);
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.bin.harness, './bin/harness');
  assert.equal(pkg.bin['harness-mcp-stdio'], './bin/harness-mcp-stdio.mjs');
  assert.deepEqual(pkg.files, ['bin/', 'src/', 'harness/', 'README.md']);
  await access('packages/harness-runtime/bin/harness');
  await access('packages/harness-runtime/bin/harness-mcp-stdio.mjs');
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/plugin-kit/runtime-package.test.mjs
```

Expected: fail because package does not exist.

- [ ] **Step 3: Create `packages/harness-runtime/package.json`**

```json
{
  "name": "@superpowering-with-files/harness-runtime",
  "version": "1.0.6",
  "private": false,
  "type": "module",
  "description": "Runtime services, CLI, and MCP facade for Superpowering With Files Harness.",
  "license": "MIT",
  "bin": {
    "harness": "./bin/harness",
    "harness-mcp-stdio": "./bin/harness-mcp-stdio.mjs"
  },
  "exports": {
    ".": "./src/index.mjs"
  },
  "files": ["bin/", "src/", "harness/", "README.md"],
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "ws": "^8.20.0",
    "zod": "^3.25.76"
  }
}
```

- [ ] **Step 4: Create runtime wrappers**

Create `packages/harness-runtime/bin/harness`:

```sh
#!/usr/bin/env sh
set -eu
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec node "$SCRIPT_DIR/../harness/installer/commands/harness.mjs" "$@"
```

Create `packages/harness-runtime/bin/harness-mcp-stdio.mjs`:

```js
#!/usr/bin/env node
import '../../../harness/mcp/stdio.mjs';
```

Create `packages/harness-runtime/src/paths.mjs`:

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const runtimePackageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const runtimeHarnessRoot = path.join(runtimePackageRoot, 'harness');
```

Create `packages/harness-runtime/src/index.mjs`:

```js
export { createHarnessMcpServer } from '../../../harness/mcp/server.mjs';
export { resolveHarnessRoot } from '../../../harness/runtime/root-policy.mjs';
export { runtimePackageRoot, runtimeHarnessRoot } from './paths.mjs';
```

- [ ] **Step 5: Make bin executable and run test**

Run:

```bash
chmod +x packages/harness-runtime/bin/harness packages/harness-runtime/bin/harness-mcp-stdio.mjs
node --test tests/plugin-kit/runtime-package.test.mjs
```

Expected: pass.

## Phase 3: Plugin Kit Build And Pack

### Task 3.1: Add artifact manifest builder

**Files:**
- Create: `packages/plugin-kit/package.json`
- Create: `packages/plugin-kit/src/sha256.mjs`
- Create: `packages/plugin-kit/src/artifact-manifest.mjs`
- Test: `tests/plugin-kit/artifact-manifest.test.mjs`

- [ ] **Step 1: Write failing test**

Create `tests/plugin-kit/artifact-manifest.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildArtifactManifest } from '../../packages/plugin-kit/src/artifact-manifest.mjs';

test('buildArtifactManifest records artifact names, sizes, and sha256', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harness-artifacts-'));
  const artifact = path.join(dir, 'harness-codex-plugin-1.0.6.tgz');
  await writeFile(artifact, 'codex-artifact');

  const manifest = await buildArtifactManifest({
    version: '1.0.6',
    artifacts: [artifact]
  });

  assert.equal(manifest.version, '1.0.6');
  assert.equal(manifest.artifacts.length, 1);
  assert.equal(manifest.artifacts[0].name, 'harness-codex-plugin-1.0.6.tgz');
  assert.equal(manifest.artifacts[0].size, 'codex-artifact'.length);
  assert.match(manifest.artifacts[0].sha256, /^[a-f0-9]{64}$/);
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/plugin-kit/artifact-manifest.test.mjs
```

Expected: fail because module does not exist.

- [ ] **Step 3: Create `packages/plugin-kit/package.json`**

```json
{
  "name": "@superpowering-with-files/plugin-kit",
  "version": "1.0.6",
  "private": true,
  "type": "module",
  "description": "Build and conformance utilities for Harness platform plugins.",
  "license": "MIT"
}
```

- [ ] **Step 4: Implement sha256 and manifest builder**

Create `packages/plugin-kit/src/sha256.mjs`:

```js
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';

export async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', resolve);
  });
  return hash.digest('hex');
}
```

Create `packages/plugin-kit/src/artifact-manifest.mjs`:

```js
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { sha256File } from './sha256.mjs';

export async function buildArtifactManifest({ version, artifacts }) {
  const rows = [];
  for (const artifactPath of artifacts) {
    const info = await stat(artifactPath);
    rows.push({
      name: path.basename(artifactPath),
      path: artifactPath,
      size: info.size,
      sha256: await sha256File(artifactPath)
    });
  }
  return {
    schemaVersion: 1,
    version,
    createdAt: new Date().toISOString(),
    artifacts: rows.sort((left, right) => left.name.localeCompare(right.name))
  };
}
```

- [ ] **Step 5: Run test**

Run:

```bash
node --test tests/plugin-kit/artifact-manifest.test.mjs
```

Expected: pass.

### Task 3.2: Add plugin source manifests

**Files:**
- Create: `plugins/codex/plugin.harness.json`
- Create: `plugins/claude-code/plugin.harness.json`
- Create: `plugins/cursor/plugin.harness.json`
- Create: `plugins/copilot/plugin.harness.json`
- Test: `tests/plugin-kit/build-plugin.test.mjs`

- [ ] **Step 1: Write failing test**

Create `tests/plugin-kit/build-plugin.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { supportedPluginTargets } from '../../packages/plugin-kit/src/platform-contracts.mjs';

test('each supported target has a Harness plugin source manifest', async () => {
  for (const target of supportedPluginTargets) {
    const manifest = JSON.parse(await readFile(`plugins/${target}/plugin.harness.json`, 'utf8'));
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.version, '1.0.6');
    assert.equal(manifest.target, target);
    assert.match(manifest.name, /^harness-/);
    assert.ok(Array.isArray(manifest.components.skills));
    assert.ok(manifest.components.skills.includes('planning-with-files'));
    assert.ok(manifest.components.skills.includes('safe-bypass-flow'));
    assert.equal(manifest.components.mcp.serverName, 'harness-runtime');
  }
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/plugin-kit/build-plugin.test.mjs
```

Expected: fail because manifests do not exist.

- [ ] **Step 3: Create source manifests**

Create `plugins/codex/plugin.harness.json`:

```json
{
  "schemaVersion": 1,
  "target": "codex",
  "name": "harness-codex-plugin",
  "displayName": "Harness for Codex",
  "version": "1.0.6",
  "description": "Runtime governance, planning skills, hooks, and MCP tools for Codex.",
  "components": {
    "entry": "AGENTS.md",
    "skills": ["planning-with-files", "risk-assessment-before-destructive-changes", "safe-bypass-flow"],
    "hooks": "hooks/hooks.json",
    "mcp": { "serverName": "harness-runtime", "transport": "stdio" }
  },
  "capabilities": ["skills", "hooks", "mcp-tools", "mcp-resources"]
}
```

Create `plugins/claude-code/plugin.harness.json`:

```json
{
  "schemaVersion": 1,
  "target": "claude-code",
  "name": "harness-claude-code-plugin",
  "displayName": "Harness for Claude Code",
  "version": "1.0.6",
  "description": "Runtime governance, planning skills, hooks, and MCP tools for Claude Code.",
  "components": {
    "entry": "CLAUDE.md",
    "skills": ["planning-with-files", "risk-assessment-before-destructive-changes", "safe-bypass-flow"],
    "hooks": "hooks/hooks.json",
    "mcp": { "serverName": "harness-runtime", "transport": "stdio" }
  },
  "capabilities": ["skills", "hooks", "mcp-tools", "mcp-resources"]
}
```

Create `plugins/cursor/plugin.harness.json`:

```json
{
  "schemaVersion": 1,
  "target": "cursor",
  "name": "harness-cursor-plugin",
  "displayName": "Harness for Cursor",
  "version": "1.0.6",
  "description": "Runtime governance, planning skills, hooks, rules, and MCP tools for Cursor.",
  "components": {
    "entry": "rules/harness.mdc",
    "skills": ["planning-with-files", "risk-assessment-before-destructive-changes", "safe-bypass-flow"],
    "hooks": "hooks/hooks.json",
    "mcp": { "serverName": "harness-runtime", "transport": "stdio" }
  },
  "capabilities": ["rules", "skills", "hooks", "mcp-tools", "mcp-resources"]
}
```

Create `plugins/copilot/plugin.harness.json`:

```json
{
  "schemaVersion": 1,
  "target": "copilot",
  "name": "harness-copilot-plugin",
  "displayName": "Harness for GitHub Copilot",
  "version": "1.0.6",
  "description": "Runtime governance, planning skills, hooks, instructions, and MCP tools for GitHub Copilot.",
  "components": {
    "entry": "instructions/harness.instructions.md",
    "skills": ["planning-with-files", "risk-assessment-before-destructive-changes", "safe-bypass-flow"],
    "hooks": "hooks/hooks.json",
    "mcp": { "serverName": "harness-runtime", "transport": "stdio" }
  },
  "capabilities": ["instructions", "skills", "hooks", "mcp-tools"]
}
```

- [ ] **Step 4: Run test**

Run:

```bash
node --test tests/plugin-kit/build-plugin.test.mjs
```

Expected: pass.

### Task 3.3: Implement plugin build generator

**Files:**
- Create: `packages/plugin-kit/src/build-plugin.mjs`
- Modify: `tests/plugin-kit/build-plugin.test.mjs`

- [ ] **Step 1: Extend failing test**

Append to `tests/plugin-kit/build-plugin.test.mjs`:

```js
import { mkdtemp, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPlugin } from '../../packages/plugin-kit/src/build-plugin.mjs';

test('buildPlugin creates self-contained Codex and Claude plugin roots', async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'harness-plugin-build-'));
  const codex = await buildPlugin({ target: 'codex', version: '1.0.6', outDir });
  const claude = await buildPlugin({ target: 'claude-code', version: '1.0.6', outDir });

  assert.equal(codex.target, 'codex');
  assert.equal(claude.target, 'claude-code');
  assert.equal((await stat(path.join(codex.pluginRoot, '.codex-plugin/plugin.json'))).isFile(), true);
  assert.equal((await stat(path.join(claude.pluginRoot, '.claude-plugin/plugin.json'))).isFile(), true);
  assert.ok((await readdir(path.join(codex.pluginRoot, 'skills'))).includes('planning-with-files'));
  assert.ok((await readdir(path.join(claude.pluginRoot, 'skills'))).includes('planning-with-files'));
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/plugin-kit/build-plugin.test.mjs
```

Expected: fail because `buildPlugin` does not exist.

- [ ] **Step 3: Implement build generator**

Create `packages/plugin-kit/src/build-plugin.mjs` with functions:

```js
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { platformContracts } from './platform-contracts.mjs';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');

async function copySkill(skillName, targetRoot, target) {
  const source =
    skillName === 'planning-with-files'
      ? path.join(repoRoot, 'harness/upstream/planning-with-files')
      : path.join(repoRoot, 'harness/core/skills', skillName);
  await cp(source, path.join(targetRoot, 'skills', skillName), { recursive: true });
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readHarnessManifest(target) {
  return JSON.parse(await readFile(path.join(repoRoot, 'plugins', target, 'plugin.harness.json'), 'utf8'));
}

function codexPluginJson(manifest) {
  return {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    skills: './skills',
    mcpServers: {
      'harness-runtime': {
        command: 'node',
        args: ['./mcp/harness-runtime.mjs']
      }
    },
    hooks: './hooks/hooks.json'
  };
}

function claudePluginJson(manifest) {
  return {
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    author: { name: 'Superpowering With Files' },
    repository: 'https://github.com/jaredramirez/SuperpoweringWithFiles',
    license: 'MIT'
  };
}

function genericPluginJson(manifest) {
  return {
    name: manifest.name,
    displayName: manifest.displayName,
    version: manifest.version,
    description: manifest.description,
    capabilities: manifest.capabilities,
    skills: './skills',
    hooks: './hooks/hooks.json',
    mcpServers: {
      'harness-runtime': {
        command: 'node',
        args: ['./mcp/harness-runtime.mjs']
      }
    }
  };
}

async function writeEntry(manifest, root) {
  const entryPath = path.join(root, manifest.components.entry);
  await mkdir(path.dirname(entryPath), { recursive: true });
  const sourceByTarget = {
    codex: 'harness/core/templates/AGENTS.md.hbs',
    'claude-code': 'harness/core/templates/CLAUDE.md.hbs',
    cursor: 'harness/core/templates/cursor-rule.mdc.hbs',
    copilot: 'harness/core/templates/copilot-instructions.md.hbs'
  };
  const content = await readFile(path.join(repoRoot, sourceByTarget[manifest.target]), 'utf8');
  await writeFile(entryPath, content, 'utf8');
}

async function writeMcpShim(root) {
  await mkdir(path.join(root, 'mcp'), { recursive: true });
  await writeFile(
    path.join(root, 'mcp/harness-runtime.mjs'),
    "#!/usr/bin/env node\nimport '../../harness/mcp/stdio.mjs';\n",
    'utf8'
  );
}

async function writeHooks(manifest, root) {
  await mkdir(path.join(root, 'hooks'), { recursive: true });
  await writeJson(path.join(root, 'hooks/hooks.json'), {
    schemaVersion: 1,
    target: manifest.target,
    hooks: []
  });
}

export async function buildPlugin({ target, version = '1.0.6', outDir = 'dist/plugins' }) {
  const contract = platformContracts[target];
  if (!contract) throw new Error(`Unsupported plugin target: ${target}`);
  const manifest = await readHarnessManifest(target);
  if (manifest.version !== version) {
    throw new Error(`Plugin manifest ${target} version ${manifest.version} does not match ${version}`);
  }

  const pluginRoot = path.resolve(outDir, contract.pluginRoot);
  await mkdir(pluginRoot, { recursive: true });
  await writeEntry(manifest, pluginRoot);
  for (const skill of manifest.components.skills) {
    await copySkill(skill, pluginRoot, target);
  }
  await writeHooks(manifest, pluginRoot);
  await writeMcpShim(pluginRoot);

  if (target === 'codex') {
    await writeJson(path.join(pluginRoot, '.codex-plugin/plugin.json'), codexPluginJson(manifest));
  } else if (target === 'claude-code') {
    await writeJson(path.join(pluginRoot, '.claude-plugin/plugin.json'), claudePluginJson(manifest));
    await writeJson(path.join(pluginRoot, '.mcp.json'), genericPluginJson(manifest).mcpServers);
  } else {
    await writeJson(path.join(pluginRoot, 'plugin.json'), genericPluginJson(manifest));
  }

  return { target, pluginRoot };
}
```

The initial implementation may copy templates before rendering. Later tasks must replace raw `.hbs` content with rendered policy output.

- [ ] **Step 4: Run test**

Run:

```bash
node --test tests/plugin-kit/build-plugin.test.mjs
```

Expected: pass.

### Task 3.4: Implement packer and release build command

**Files:**
- Create: `packages/plugin-kit/src/pack-plugin.mjs`
- Create: `packages/plugin-kit/src/build-all.mjs`
- Test: `tests/plugin-kit/pack-plugin.test.mjs`

- [ ] **Step 1: Write failing test**

Create `tests/plugin-kit/pack-plugin.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtemp, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildPlugin } from '../../packages/plugin-kit/src/build-plugin.mjs';
import { packPlugin } from '../../packages/plugin-kit/src/pack-plugin.mjs';

test('packPlugin creates a tgz artifact for a built plugin root', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-pack-'));
  const build = await buildPlugin({ target: 'codex', version: '1.0.6', outDir: path.join(workDir, 'plugins') });
  const artifact = await packPlugin({ pluginRoot: build.pluginRoot, version: '1.0.6', outDir: path.join(workDir, 'release') });
  assert.match(path.basename(artifact), /^harness-codex-plugin-1\.0\.6\.tgz$/);
  assert.equal((await stat(artifact)).isFile(), true);
  assert.ok((await readdir(path.dirname(artifact))).includes(path.basename(artifact)));
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/plugin-kit/pack-plugin.test.mjs
```

Expected: fail because packer does not exist.

- [ ] **Step 3: Implement packer using system tar**

Create `packages/plugin-kit/src/pack-plugin.mjs`:

```js
import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function packPlugin({ pluginRoot, version, outDir }) {
  await mkdir(outDir, { recursive: true });
  const artifactName = `${path.basename(pluginRoot)}-${version}.tgz`;
  const artifactPath = path.join(outDir, artifactName);
  await execFileAsync('tar', ['-czf', artifactPath, '-C', path.dirname(pluginRoot), path.basename(pluginRoot)]);
  return artifactPath;
}
```

Create `packages/plugin-kit/src/build-all.mjs`:

```js
#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildArtifactManifest } from './artifact-manifest.mjs';
import { buildPlugin } from './build-plugin.mjs';
import { packPlugin } from './pack-plugin.mjs';
import { supportedPluginTargets } from './platform-contracts.mjs';

export async function buildAll({ version = '1.0.6', release = false } = {}) {
  const pluginOut = path.resolve('dist/plugins');
  const releaseOut = path.resolve('dist/release', version);
  await mkdir(pluginOut, { recursive: true });
  await mkdir(releaseOut, { recursive: true });

  const artifacts = [];
  for (const target of supportedPluginTargets) {
    const build = await buildPlugin({ target, version, outDir: pluginOut });
    artifacts.push(await packPlugin({ pluginRoot: build.pluginRoot, version, outDir: releaseOut }));
  }

  const manifest = await buildArtifactManifest({ version, artifacts });
  await writeFile(path.join(releaseOut, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    path.join(releaseOut, 'SHA256SUMS'),
    manifest.artifacts.map((artifact) => `${artifact.sha256}  ${artifact.name}`).join('\n') + '\n'
  );
  await writeFile(
    path.join(releaseOut, 'release-notes.md'),
    `# Superpowering With Files ${version}\n\nRuntime harness plugin release with packed plugins for Codex, Claude Code, Cursor, and GitHub Copilot.\n`
  );
  return { version, releaseOut, artifacts, manifest };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const release = process.argv.includes('--release');
  await buildAll({ release });
}
```

- [ ] **Step 4: Run tests and build command**

Run:

```bash
node --test tests/plugin-kit/pack-plugin.test.mjs
npm run plugin:build
ls dist/release/1.0.6
```

Expected: four plugin `.tgz` artifacts plus `manifest.json`, `SHA256SUMS`, and `release-notes.md`.

## Phase 4: Rendered Plugin Content And Conformance

### Task 4.1: Replace raw templates with rendered entries

**Files:**
- Modify: `packages/plugin-kit/src/build-plugin.mjs`
- Test: `tests/plugin-kit/build-plugin.test.mjs`

- [ ] **Step 1: Add failing assertion**

Append to the existing build test:

```js
test('built plugin entries are rendered and do not contain Handlebars markers', async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'harness-rendered-plugin-'));
  const build = await buildPlugin({ target: 'codex', version: '1.0.6', outDir });
  const entry = await readFile(path.join(build.pluginRoot, 'AGENTS.md'), 'utf8');
  assert.doesNotMatch(entry, /\{\{/);
  assert.match(entry, /Harness Policy For Codex/);
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/plugin-kit/build-plugin.test.mjs
```

Expected: fail if raw `.hbs` content leaks.

- [ ] **Step 3: Reuse policy renderer**

Modify `build-plugin.mjs` to import the existing policy render helper from `harness/installer/lib/policy-render.mjs`. If the helper does not expose a pure render function, first extract one from the existing CLI code with tests in `tests/installer/policy-render.test.mjs`. The built entry files must contain rendered content for the matching target.

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/plugin-kit/build-plugin.test.mjs tests/installer/policy-render.test.mjs
```

Expected: pass.

### Task 4.2: Enforce package pollution guard

**Files:**
- Modify: `packages/plugin-kit/src/build-all.mjs`
- Test: `tests/plugin-kit/pack-plugin.test.mjs`

- [ ] **Step 1: Add failing pollution test**

Append:

```js
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

test('packed plugin tarball excludes planning state, tests, reports, and live projections', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'harness-pack-clean-'));
  const build = await buildPlugin({ target: 'codex', version: '1.0.6', outDir: path.join(workDir, 'plugins') });
  const artifact = await packPlugin({ pluginRoot: build.pluginRoot, version: '1.0.6', outDir: path.join(workDir, 'release') });
  const { stdout } = await execFileAsync('tar', ['-tzf', artifact]);
  assert.doesNotMatch(stdout, /planning\/active/);
  assert.doesNotMatch(stdout, /planning\/archive/);
  assert.doesNotMatch(stdout, /tests\//);
  assert.doesNotMatch(stdout, /reports\//);
  assert.doesNotMatch(stdout, /^\.agents\//m);
});
```

- [ ] **Step 2: Run test**

Run:

```bash
node --test tests/plugin-kit/pack-plugin.test.mjs
```

Expected: pass. If it fails, fix the builder to only copy explicit files.

### Task 4.3: Validate required files for all four artifacts

**Files:**
- Create: `packages/plugin-kit/src/preflight.mjs`
- Test: `tests/plugin-kit/preflight.test.mjs`

- [ ] **Step 1: Write failing test**

Create `tests/plugin-kit/preflight.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildPlugin } from '../../packages/plugin-kit/src/build-plugin.mjs';
import { validateBuiltPlugin } from '../../packages/plugin-kit/src/preflight.mjs';
import { supportedPluginTargets } from '../../packages/plugin-kit/src/platform-contracts.mjs';

test('validateBuiltPlugin accepts all generated plugin roots', async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'harness-preflight-'));
  for (const target of supportedPluginTargets) {
    const build = await buildPlugin({ target, version: '1.0.6', outDir });
    const result = await validateBuiltPlugin({ target, pluginRoot: build.pluginRoot });
    assert.equal(result.ok, true, `${target}: ${JSON.stringify(result.problems)}`);
  }
});
```

- [ ] **Step 2: Implement validator**

Create `packages/plugin-kit/src/preflight.mjs`:

```js
import { access } from 'node:fs/promises';
import path from 'node:path';
import { platformContracts } from './platform-contracts.mjs';

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function validateBuiltPlugin({ target, pluginRoot }) {
  const contract = platformContracts[target];
  if (!contract) return { ok: false, problems: [`Unsupported target: ${target}`] };
  const problems = [];
  for (const requiredFile of contract.requiredFiles) {
    if (!(await exists(path.join(pluginRoot, requiredFile)))) {
      problems.push(`Missing required plugin file: ${requiredFile}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
```

- [ ] **Step 3: Run test**

Run:

```bash
node --test tests/plugin-kit/preflight.test.mjs
```

Expected: pass.

## Phase 5: Plugin Migration Path

### Task 5.1: Add migration documentation

**Files:**
- Create: `docs/install/plugin-migration.md`
- Modify: `README.md`
- Modify: `docs/install/adoption-starter-kit.md`
- Test: `tests/plugin-kit/docs-contract.test.mjs`

- [ ] **Step 1: Write failing docs contract test**

Create `tests/plugin-kit/docs-contract.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('plugin migration docs define non-destructive global adoption migration', async () => {
  const docs = await readFile('docs/install/plugin-migration.md', 'utf8');
  for (const phrase of [
    'Baseline capture',
    'Shadow install',
    'Dual-run',
    'Cutover',
    'Cleanup',
    'Do not delete existing global projections as the first migration step'
  ]) {
    assert.match(docs, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/plugin-kit/docs-contract.test.mjs
```

Expected: fail because docs do not exist.

- [ ] **Step 3: Create migration doc**

Create `docs/install/plugin-migration.md`:

```markdown
# Plugin Migration

Plugin migration moves an existing Harness global adoption toward platform plugin adoption without destroying current working projections.

## Baseline capture

Run `./scripts/harness adoption-status`, `./scripts/harness doctor --check-only`, and `./scripts/harness sync --dry-run`. Save the outputs before installing plugins.

## Shadow install

Install the platform plugin with read-only MCP and skills enabled. Do not enable duplicate hooks during shadow install.

## Dual-run

Keep existing global entry files and skills as fallback while the plugin provides namespaced runtime MCP access. Use `doctor` to compare evidence.

## Cutover

Cut over one target at a time. Recommended order: Codex, Claude Code, Cursor, GitHub Copilot.

## Cleanup

Only remove or downgrade old global projections after the plugin target passes doctor, smoke, and user confirmation.

Do not delete existing global projections as the first migration step.
```

- [ ] **Step 4: Link docs**

Add links from `README.md` and `docs/install/adoption-starter-kit.md` to `docs/install/plugin-migration.md`.

- [ ] **Step 5: Run test**

Run:

```bash
node --test tests/plugin-kit/docs-contract.test.mjs
```

Expected: pass.

### Task 5.2: Add plugin subcommands as inspected no-op first

**Files:**
- Modify: `harness/installer/commands/harness.mjs`
- Create: `harness/installer/commands/plugin.mjs`
- Test: `tests/installer/commands.test.mjs`

- [ ] **Step 1: Add command tests**

Add tests in `tests/installer/commands.test.mjs` that invoke:

```bash
./scripts/harness plugin doctor --json
./scripts/harness plugin migrate --dry-run --json
```

Expected JSON for `doctor`:

```json
{
  "ok": true,
  "mode": "doctor",
  "targets": ["codex", "claude-code", "cursor", "copilot"]
}
```

Expected JSON for `migrate --dry-run`:

```json
{
  "ok": true,
  "mode": "migrate-dry-run",
  "writes": []
}
```

- [ ] **Step 2: Run failing command test**

Run:

```bash
node --test tests/installer/commands.test.mjs
```

Expected: fail because command is unknown.

- [ ] **Step 3: Implement no-op command**

Create `harness/installer/commands/plugin.mjs`:

```js
export async function pluginCommand(args = [], { stdout = process.stdout } = {}) {
  const json = args.includes('--json');
  const command = args.find((arg) => !arg.startsWith('--')) ?? 'help';
  let result;

  if (command === 'doctor') {
    result = {
      ok: true,
      mode: 'doctor',
      targets: ['codex', 'claude-code', 'cursor', 'copilot'],
      message: 'Plugin doctor inspector is available. Detailed adoption checks will be added during migration implementation.'
    };
  } else if (command === 'migrate' && args.includes('--dry-run')) {
    result = {
      ok: true,
      mode: 'migrate-dry-run',
      writes: [],
      message: 'Plugin migration dry-run is non-destructive.'
    };
  } else {
    result = {
      ok: false,
      mode: 'help',
      usage: './scripts/harness plugin doctor --json | ./scripts/harness plugin migrate --dry-run --json'
    };
  }

  if (json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    stdout.write(`${result.message ?? result.usage}\n`);
  }
  return result;
}
```

Modify `harness/installer/commands/harness.mjs` dispatcher to route `plugin` to `pluginCommand`.

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/installer/commands.test.mjs
```

Expected: pass.

## Phase 6: Platform Smoke Tests

### Task 6.1: Add smoke harness with hard release gate

**Files:**
- Create: `packages/plugin-kit/src/smoke.mjs`
- Test: `tests/plugin-kit/smoke.test.mjs`

- [ ] **Step 1: Write smoke tests**

Create `tests/plugin-kit/smoke.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSmokePlan } from '../../packages/plugin-kit/src/smoke.mjs';

test('buildSmokePlan contains four target gates', () => {
  const plan = buildSmokePlan({ version: '1.0.6' });
  assert.deepEqual(plan.targets.map((target) => target.target), ['codex', 'claude-code', 'cursor', 'copilot']);
  for (const target of plan.targets) {
    assert.equal(target.version, '1.0.6');
    assert.ok(target.artifact.endsWith('.tgz'));
    assert.ok(Array.isArray(target.commands));
  }
});
```

- [ ] **Step 2: Implement smoke plan**

Create `packages/plugin-kit/src/smoke.mjs`:

```js
import path from 'node:path';
import { platformContracts, supportedPluginTargets } from './platform-contracts.mjs';

export function buildSmokePlan({ version = '1.0.6' } = {}) {
  return {
    version,
    targets: supportedPluginTargets.map((target) => {
      const contract = platformContracts[target];
      return {
        target,
        version,
        artifact: path.join('dist/release', version, `${contract.pluginRoot}-${version}.tgz`),
        commands: contract.smokeCommands,
        releaseGate: 'must-pass-or-explicit-owner-waiver'
      };
    })
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(buildSmokePlan(), null, 2));
}
```

- [ ] **Step 3: Run test**

Run:

```bash
node --test tests/plugin-kit/smoke.test.mjs
npm run plugin:smoke
```

Expected: test passes and smoke plan prints four target gates.

### Task 6.2: Manual/live smoke execution gate

**Files:**
- Modify: `planning/active/codex-cc-runtime-plugin-feasibility/progress.md`
- Modify: `planning/active/codex-cc-runtime-plugin-feasibility/findings.md`

- [ ] **Step 1: Build artifacts**

Run:

```bash
npm run release:pack
```

Expected: all five release artifacts exist under `dist/release/1.0.6/`.

- [ ] **Step 2: Codex smoke**

Run:

```bash
codex --version
codex plugin --help
codex mcp --help
tar -tzf dist/release/1.0.6/harness-codex-plugin-1.0.6.tgz | sed -n '1,40p'
```

Expected: Codex CLI exists, plugin command exists, artifact contains `.codex-plugin/plugin.json`.

If Codex exposes a local plugin install command for tarball/path, install the packed artifact in a disposable Codex home and run:

```bash
codex mcp list
```

Expected: `harness-runtime` appears or documented plugin MCP config is visible.

- [ ] **Step 3: Claude Code smoke**

Run:

```bash
claude --version
claude plugin --help
tar -tzf dist/release/1.0.6/harness-claude-code-plugin-1.0.6.tgz | sed -n '1,60p'
```

Expected: Claude CLI exists, plugin command exists, artifact contains `.claude-plugin/plugin.json` and `.mcp.json`.

If `claude` is missing, release is blocked until run in an environment with Claude Code CLI. Do not publish a release with unverified Claude artifact.

- [ ] **Step 4: Cursor smoke**

Run:

```bash
cursor --version || true
tar -tzf dist/release/1.0.6/harness-cursor-plugin-1.0.6.tgz | sed -n '1,60p'
```

Expected: artifact contains `plugin.json`, `rules/`, `skills/`, `hooks/hooks.json`, `mcp/harness-runtime.mjs`.

If Cursor exposes a CLI or documented local plugin install path, install from tarball/path and record the command. If not scriptable, attach manual install evidence before release.

- [ ] **Step 5: GitHub Copilot smoke**

Run:

```bash
gh --version
gh copilot --help || true
tar -tzf dist/release/1.0.6/harness-copilot-plugin-1.0.6.tgz | sed -n '1,60p'
```

Expected: artifact contains `plugin.json`, `instructions/harness.instructions.md`, `skills/`, `hooks/hooks.json`, `mcp/harness-runtime.mjs`.

If Copilot CLI exposes plugin install/inspection, use it against the packed artifact. If not, record official docs evidence and verify unpacked plugin contract.

- [ ] **Step 6: Record smoke evidence**

Append all commands, pass/fail, and source docs to `progress.md`. Any target without live install evidence must be marked as `blocked` unless user explicitly waives that target for release.

## Phase 7: Verification, Docs, And Release Workflow

### Task 7.1: Update release docs

**Files:**
- Modify: `docs/release.md`
- Create: `docs/release-plugin-artifacts.md`
- Modify: `README.md`

- [ ] **Step 1: Add docs**

Create `docs/release-plugin-artifacts.md`:

```markdown
# Plugin Release Artifacts

Harness release `1.0.6` publishes a runtime package and four platform plugin packages:

- `harness-runtime-1.0.6.tgz`
- `harness-codex-plugin-1.0.6.tgz`
- `harness-claude-code-plugin-1.0.6.tgz`
- `harness-cursor-plugin-1.0.6.tgz`
- `harness-copilot-plugin-1.0.6.tgz`

Before release, run:

```bash
npm run verify
npm run release:pack
npm run plugin:smoke
./scripts/harness doctor --check-only
```

Do not publish if a plugin target lacks install or smoke evidence.
```

- [ ] **Step 2: Link from release docs and README**

Add a short section to `docs/release.md` referencing `docs/release-plugin-artifacts.md`.

Add a README link under Docs.

- [ ] **Step 3: Run docs contract**

Run:

```bash
node --test tests/plugin-kit/docs-contract.test.mjs
```

Expected: pass.

### Task 7.2: Full verification gate

**Files:**
- Modify: `planning/active/codex-cc-runtime-plugin-feasibility/progress.md`

- [ ] **Step 1: Run full checks**

Run:

```bash
npm run verify
npm run plugin:verify
npm run release:pack
npm run plugin:smoke
./scripts/harness verify --output=.harness/verification
./scripts/harness sync --dry-run
./scripts/harness doctor --check-only
```

Expected:

- `npm run verify` passes.
- `npm run plugin:verify` passes.
- `npm run release:pack` creates all artifacts.
- `npm run plugin:smoke` prints all four target gates.
- `./scripts/harness verify` passes and writes report.
- `sync --dry-run` shows only expected Harness-managed changes.
- `doctor --check-only` passes. If it fails due to stale unrelated planning state, fix planning sync or get explicit owner decision before release.

- [ ] **Step 2: Verify artifact list**

Run:

```bash
find dist/release/1.0.6 -maxdepth 1 -type f -print | sort
cat dist/release/1.0.6/SHA256SUMS
```

Expected exact files:

```text
dist/release/1.0.6/SHA256SUMS
dist/release/1.0.6/harness-claude-code-plugin-1.0.6.tgz
dist/release/1.0.6/harness-codex-plugin-1.0.6.tgz
dist/release/1.0.6/harness-copilot-plugin-1.0.6.tgz
dist/release/1.0.6/harness-cursor-plugin-1.0.6.tgz
dist/release/1.0.6/harness-runtime-1.0.6.tgz
dist/release/1.0.6/manifest.json
dist/release/1.0.6/release-notes.md
```

If `harness-runtime-1.0.6.tgz` is missing, add runtime package packing before proceeding.

### Task 7.3: Commit strategy

**Files:**
- All changed files

- [ ] **Step 1: Commit after green verification**

Run:

```bash
git status --short
git add package.json package-lock.json packages plugins tests docs harness README.md planning/active/codex-cc-runtime-plugin-feasibility
git commit -m "feat: productize runtime harness plugins"
```

Expected: commit succeeds. Do not stage unrelated homepage changes from the main checkout.

- [ ] **Step 2: Run final verification after commit**

Run:

```bash
npm run verify
npm run release:pack
./scripts/harness doctor --check-only
```

Expected: pass.

## Phase 8: GitHub Release `1.0.6`

### Task 8.1: Prepare release notes

**Files:**
- Modify: `dist/release/1.0.6/release-notes.md`
- Modify: `planning/active/codex-cc-runtime-plugin-feasibility/progress.md`

- [ ] **Step 1: Finalize release notes**

Update release notes with:

```markdown
# Superpowering With Files 1.0.6

## Highlights

- Adds monorepo runtime package boundary for Harness runtime services and MCP facade.
- Adds packed plugin artifacts for Codex, Claude Code, Cursor, and GitHub Copilot.
- Adds plugin migration guidance for existing global Harness adoption.
- Adds plugin conformance and artifact verification.

## Artifacts

- `harness-runtime-1.0.6.tgz`
- `harness-codex-plugin-1.0.6.tgz`
- `harness-claude-code-plugin-1.0.6.tgz`
- `harness-cursor-plugin-1.0.6.tgz`
- `harness-copilot-plugin-1.0.6.tgz`
- `SHA256SUMS`
- `manifest.json`
```

- [ ] **Step 2: Rebuild release pack if notes are generated**

Run:

```bash
npm run release:pack
```

Expected: notes exist and artifacts unchanged except generated manifest timestamp/hash rows if designed to include notes.

### Task 8.2: Create tag and GitHub release

**Files:**
- No source modifications after this step unless release fails.

- [ ] **Step 1: Confirm tag does not exist**

Run:

```bash
git tag --list 1.0.6
gh release view 1.0.6
```

Expected: local tag absent and GitHub release absent. If release exists, stop and ask user.

- [ ] **Step 2: Push branch and create PR or merge as user directs**

If user wants PR:

```bash
git push -u origin <branch>
gh pr create --base dev --head <branch> --title "Productize runtime harness plugins" --body-file dist/release/1.0.6/release-notes.md
```

If user approves direct release from branch after review and merge, merge to `dev` first according to repo policy. Do not tag an unreviewed branch unless user explicitly approves.

- [ ] **Step 3: Tag release commit**

Run on the verified release commit:

```bash
git tag 1.0.6
git push origin 1.0.6
```

Expected: tag pushed.

- [ ] **Step 4: Create GitHub release with assets**

Run:

```bash
gh release create 1.0.6 \
  --title "Superpowering With Files 1.0.6" \
  --notes-file dist/release/1.0.6/release-notes.md \
  dist/release/1.0.6/harness-runtime-1.0.6.tgz \
  dist/release/1.0.6/harness-codex-plugin-1.0.6.tgz \
  dist/release/1.0.6/harness-claude-code-plugin-1.0.6.tgz \
  dist/release/1.0.6/harness-cursor-plugin-1.0.6.tgz \
  dist/release/1.0.6/harness-copilot-plugin-1.0.6.tgz \
  dist/release/1.0.6/SHA256SUMS \
  dist/release/1.0.6/manifest.json
```

Expected: release URL printed.

- [ ] **Step 5: Verify release assets**

Run:

```bash
gh release view 1.0.6 --json tagName,name,url,assets
```

Expected: seven assets are present: five `.tgz`, `SHA256SUMS`, `manifest.json`.

## Phase 9: Planning Sync And Closeout

### Task 9.1: Sync durable conclusions

**Files:**
- Modify: `planning/active/codex-cc-runtime-plugin-feasibility/task_plan.md`
- Modify: `planning/active/codex-cc-runtime-plugin-feasibility/findings.md`
- Modify: `planning/active/codex-cc-runtime-plugin-feasibility/progress.md`

- [ ] **Step 1: Update task plan**

Set current state to `waiting_integration` after implementation is complete but before release, or `waiting_review` if PR is open.

Record:

```markdown
## Companion Plan
- **Path:** `docs/superpowers/plans/2026-05-31-runtime-harness-plugin-release-plan.md`
- **Summary:** Productizes Harness as runtime package plus four platform plugin wrappers and publishes release `1.0.6` with packed plugin artifacts.
- **Sync-back status:** implementation and release evidence synced through <timestamp UTC+8>.
```

- [ ] **Step 2: Update findings**

Record:

- final package structure
- final platform artifact list
- smoke evidence for each target
- release URL
- any waived or blocked platform limitations

- [ ] **Step 3: Update progress**

Record all verification commands and pass/fail outputs. Include Git commit SHA, tag SHA, release URL, and artifact SHA256 summary.

## Loophole Audit Checklist

Run this checklist before creating the release:

- [ ] No active planning state is included in any tarball.
- [ ] No `planning/archive` content is included in any tarball.
- [ ] No `.harness/`, `.worktrees/`, `.codex-worktrees/`, test fixture, report, or homepage build output is included in plugin artifacts.
- [ ] All versions are `1.0.6`: root package, runtime package, plugin-kit package, source plugin manifests, generated plugin manifests, release artifacts.
- [ ] Latest previous tag is `1.0.5`; release target is `1.0.6`.
- [ ] Codex artifact contains `.codex-plugin/plugin.json`.
- [ ] Claude Code artifact contains `.claude-plugin/plugin.json`.
- [ ] Cursor artifact contains plugin metadata, rules, skills, hooks, and MCP shim.
- [ ] Copilot artifact contains plugin metadata, instructions, skills, hooks, and MCP shim.
- [ ] MCP write tools still require approval token.
- [ ] Plugin migration docs explicitly prohibit destructive first-step cleanup.
- [ ] `npm run verify` passes after all changes.
- [ ] `npm run release:pack` passes after all changes.
- [ ] `./scripts/harness doctor --check-only` passes or release is blocked by explicit owner decision.
- [ ] `gh release view 1.0.6` confirms all assets after release.

## Execution Policy For Uncertainty

If the executing agent cannot validate a target IDE's packed artifact in a real or officially documented local install path, it must not claim the target is installable. It must either:

1. fix the pack/install implementation until the target smoke test passes, or
2. stop before GitHub release and ask the user for a waiver or a host environment with the missing IDE/CLI.

No release may be created with silently unverified plugin targets.
