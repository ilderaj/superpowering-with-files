import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectGovernanceHealth } from '../../harness/installer/lib/health-governance.mjs';
import { sync } from '../../harness/installer/commands/sync.mjs';
import { readState, writeState } from '../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture,
  withCwd
} from '../helpers/harness-fixture.mjs';

test('inspectGovernanceHealth preserves backup and user-managed governance diagnostics after extraction', async (t) => {
  const root = await createHarnessFixture();
  try {
    const home = path.join(root, 'home');
    await mkdir(home, { recursive: true });
    t.mock.method(os, 'homedir', () => home);

    await writeState(root, {
      schemaVersion: 1,
      scope: 'both',
      projectionMode: 'portable',
      hookMode: 'on',
      policyProfile: 'always-on-core',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] },
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));
    await mkdir(path.join(home, '.agent-config'), { recursive: true });
    await writeFile(path.join(home, '.agent-config/user-managed.json'), JSON.stringify({
      schemaVersion: 1,
      paths: [path.join(home, '.missing/personal-skill')]
    }, null, 2));
    await mkdir(path.join(home, '.claude/skills'), { recursive: true });
    await writeFile(
      path.join(home, '.claude/skills/using-superpowers.harness-backup-20260426T044458'),
      'legacy backup'
    );

    const report = await inspectGovernanceHealth({
      rootDir: root,
      homeDir: home,
      state: await readState(root),
      targets: {
        copilot: {
          entries: [
            { path: path.join(root, '.github/copilot-instructions.md') },
            { path: path.join(home, '.github/copilot-instructions.md') }
          ],
          hooks: []
        }
      }
    });

    assert.equal(report.scopeOverlap.verdict, 'warning');
    assert.ok(report.scopeOverlap.message?.includes('Copilot is projected in both workspace and user-global scopes'));
    assert.ok(
      report.userManagedProblems.some((problem) => problem.includes('missing personal projection'))
    );
    assert.ok(
      report.backupGovernance.legacyBackups.some((entry) => entry.includes('.harness-backup-20260426T044458'))
    );
  } finally {
    await removeHarnessFixture(root);
  }
});
