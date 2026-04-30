import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sync } from '../../harness/installer/commands/sync.mjs';
import { writeState } from '../../harness/installer/lib/state.mjs';
import {
  createHarnessFixture,
  removeHarnessFixture,
  withCwd
} from '../helpers/harness-fixture.mjs';

const execFileAsync = promisify(execFile);
const utc8TimestampPattern = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\+8/;

test('init-session.sh writes progress sessions with a UTC+8 timestamp', async () => {
  const root = await createHarnessFixture();
  try {
    await mkdir(path.join(root, 'planning/active'), { recursive: true });

    await execFileAsync('bash', [
      path.join(root, 'harness/upstream/planning-with-files/scripts/init-session.sh'),
      root,
      'timestamp-demo'
    ]);

    const progress = await readFile(
      path.join(root, 'planning/active/timestamp-demo/progress.md'),
      'utf8'
    );

    assert.match(progress, new RegExp(`^## Session: ${utc8TimestampPattern.source}$`, 'm'));
    assert.doesNotMatch(progress, /\[(?:DATE|TIMESTAMP)\]/);
  } finally {
    await removeHarnessFixture(root);
  }
});


test('init-session.ps1 formats timestamps with an explicit UTC+8 offset', async () => {
  const script = await readFile(
    path.join(process.cwd(), 'harness/upstream/planning-with-files/scripts/init-session.ps1'),
    'utf8'
  );

  assert.match(script, /UtcNow\.ToOffset\(\[TimeSpan\]::FromHours\(8\)\)/);
  assert.match(script, /yyyy-MM-dd HH:mm:ss/);
  assert.match(script, /UTC\+8/);
});

test('sync materializes planning-with-files progress template with timestamp guidance', async () => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      targets: {
        copilot: { enabled: true, paths: [path.join(root, '.github/copilot-instructions.md')] }
      },
      upstream: {}
    });

    await withCwd(root, () => sync([]));

    const progressTemplate = await readFile(
      path.join(root, '.agents/skills/planning-with-files/templates/progress.md'),
      'utf8'
    );

    assert.match(progressTemplate, /## Session: \[TIMESTAMP\]/);
    assert.match(progressTemplate, /YYYY-MM-DD HH:mm:ss UTC\+8/);
  } finally {
    await removeHarnessFixture(root);
  }
});