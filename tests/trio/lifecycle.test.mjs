import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readTrioTask } from '../../harness/trio/core/read.mjs';
import { trioCommand } from '../../harness/installer/commands/trio.mjs';

async function loadStore() {
  try {
    return await import('../../harness/trio/core/store.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND'
      && /harness[\\/]trio[\\/]core[\\/]store\.mjs/u.test(error.message)) {
      return null;
    }
    throw error;
  }
}

async function requireStore() {
  const store = await loadStore();
  assert.ok(store, 'Wave 2 store public surface must exist.');
  return store;
}

async function createRoot(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function initialize(store, root, taskId, goal = 'Exercise lifecycle guards.') {
  return store.initializeTrioTask(root, taskId, goal);
}

async function fileNames(root) {
  const names = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      const relative = path.relative(root, target).split(path.sep).join('/');
      names.push(relative);
      if (entry.isDirectory()) await visit(target);
    }
  }
  await visit(root);
  return names.sort();
}

function runNodeTest(args) {
  return new Promise((resolve, reject) => {
    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, args, {
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

function postRenameDirectorySyncProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

async function entriesOrMissing(directory) {
  try {
    return (await realFs.readdir(directory)).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

test('public archive removes a post-rename directory-sync publication before retry', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-post-rename-fsync-')));
  try {
    const taskId = 'post-rename-fsync-task';
    const timestamp = '20260803-020101';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    const publishedTaskPlan = path.join(destination, 'task_plan.md');
    let faultEnabled = true;
    let injectionCount = 0;
    const faultingOpen = async (targetPath, flags, ...rest) => {
      if (faultEnabled
        && flags === 'r'
        && typeof targetPath === 'string'
        && path.resolve(targetPath) === destination) {
        try {
          await realFs.lstat(publishedTaskPlan);
          faultEnabled = false;
          injectionCount += 1;
          const error = new Error('Injected archive destination directory fsync failure after publication.');
          error.code = 'EIO';
          throw error;
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
      return realFs.open(targetPath, flags, ...rest);
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, open: faultingOpen }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise post-rename archive cleanup.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the archive fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The archive fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    faultEnabled = false;
    const afterFailure = await exactBytes(activeDirectory);
    const activeBytesPreserved = TRIO_FILES.every((fileName) => before[fileName].equals(afterFailure[fileName]));
    const destinationEntries = await entriesOrMissing(destination);

    assert.deepEqual(
      {
        errorCode: archiveError?.code,
        injectionCount,
        activeBytesPreserved,
        destinationEntries
      },
      {
        errorCode: 'ERR_TRIO_DIRECTORY_SYNC',
        injectionCount: 1,
        activeBytesPreserved: true,
        destinationEntries: null
      },
      'A post-rename directory-sync failure must preserve the active Trio and leave no archive residue.'
    );

    const archive = await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    assert.equal(archive.status, 'archived');
    assert.deepEqual(await exactBytes(destination), before);
    await assert.rejects(() => realFs.lstat(activeDirectory), (error) => error?.code === 'ENOENT');
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runPostRenameDirectorySyncProbe() {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-archive-fsync-probe-'));
  const probePath = path.join(probeRoot, 'post-rename-directory-sync.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, postRenameDirectorySyncProbeSource(storeUrl), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function prePublicationForeignFileProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

test('public archive preserves a foreign pre-publication final file after temp-open failure', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-pre-publication-foreign-')));
  try {
    const taskId = 'pre-publication-foreign-task';
    const timestamp = '20260803-031001';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    const foreignPath = path.join(destination, 'task_plan.md');
    const foreignBytes = Buffer.from('foreign task plan bytes\\n');
    let faultEnabled = false;
    let injectionCount = 0;
    const faultingOpen = async (targetPath, flags, ...rest) => {
      if (faultEnabled
        && flags === 'wx'
        && typeof targetPath === 'string'
        && path.dirname(path.resolve(targetPath)) === destination
        && path.basename(targetPath).startsWith('.task_plan.md.')) {
        faultEnabled = false;
        injectionCount += 1;
        await realFs.writeFile(foreignPath, foreignBytes);
        const error = new Error('Injected pre-publication temporary-file open failure.');
        error.code = 'EIO';
        throw error;
      }
      return realFs.open(targetPath, flags, ...rest);
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, open: faultingOpen }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise foreign archive publication ownership.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the archive foreign-file fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The archive foreign-file fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    faultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    const after = await exactBytes(activeDirectory);
    let observedForeignBytes = null;
    try {
      observedForeignBytes = await realFs.readFile(foreignPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }

    assert.deepEqual(
      {
        errorCode: archiveError?.code,
        archiveErrorCode: archiveError?.archiveError?.code,
        injectionCount,
        activeBytesPreserved: TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName])),
        foreignBytesPreserved: observedForeignBytes?.equals(foreignBytes) ?? false
      },
      {
        errorCode: 'ERR_TRIO_ARCHIVE_CLEANUP',
        archiveErrorCode: 'ERR_TRIO_ARCHIVE_PUBLICATION',
        injectionCount: 1,
        activeBytesPreserved: true,
        foreignBytesPreserved: true
      },
      'A pre-publication foreign final file must remain outside archive cleanup ownership.'
    );
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runPrePublicationForeignFileProbe() {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-archive-pre-publication-probe-'));
  const probePath = path.join(probeRoot, 'pre-publication-foreign-file.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, prePublicationForeignFileProbeSource(storeUrl), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function createOnlyCollisionProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

test('public archive refuses a foreign final file at the create-only publication point', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-create-only-collision-')));
  try {
    const taskId = 'create-only-collision-task';
    const timestamp = '20260803-031002';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    const foreignPath = path.join(destination, 'task_plan.md');
    const foreignBytes = Buffer.from('foreign final bytes\\n');
    let faultEnabled = false;
    let injectionCount = 0;
    const faultingLink = async (sourcePath, targetPath) => {
      if (faultEnabled
        && path.resolve(targetPath) === foreignPath
        && path.basename(sourcePath).startsWith('.task_plan.md.')) {
        faultEnabled = false;
        injectionCount += 1;
        await realFs.writeFile(foreignPath, foreignBytes);
        const error = new Error('Injected create-only final collision.');
        error.code = 'EEXIST';
        throw error;
      }
      return realFs.link(sourcePath, targetPath);
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, link: faultingLink }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise create-only archive collision handling.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the create-only collision fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The create-only collision fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    faultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    const after = await exactBytes(activeDirectory);
    const destinationEntries = (await realFs.readdir(destination)).sort();

    assert.deepEqual(
      {
        errorCode: archiveError?.code,
        archiveErrorCode: archiveError?.archiveError?.code,
        injectionCount,
        activeBytesPreserved: TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName])),
        foreignBytesPreserved: (await realFs.readFile(foreignPath)).equals(foreignBytes),
        hasOwnedTemporary: destinationEntries.some((name) => name.startsWith('.task_plan.md.'))
      },
      {
        errorCode: 'ERR_TRIO_ARCHIVE_CLEANUP',
        archiveErrorCode: 'ERR_TRIO_ARCHIVE_PUBLICATION',
        injectionCount: 1,
        activeBytesPreserved: true,
        foreignBytesPreserved: true,
        hasOwnedTemporary: true
      },
      'A create-only collision must preserve the foreign final and avoid deleting an unvalidated destination set.'
    );
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runCreateOnlyCollisionProbe() {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-archive-create-only-probe-'));
  const probePath = path.join(probeRoot, 'create-only-collision.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, createOnlyCollisionProbeSource(storeUrl), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function stableFinalReplacementProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

test('public archive preserves a stable final replacement after link publication', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-final-replacement-')));
  try {
    const taskId = 'final-replacement-task';
    const timestamp = '20260803-031003';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    const finalPath = path.join(destination, 'task_plan.md');
    const foreignBytes = Buffer.from('stable foreign replacement\\n');
    let faultEnabled = false;
    let injectionCount = 0;
    const faultingOpen = async (targetPath, flags, ...rest) => {
      if (faultEnabled
        && flags === 'r'
        && typeof targetPath === 'string'
        && path.resolve(targetPath) === destination) {
        try {
          await realFs.lstat(finalPath);
          faultEnabled = false;
          injectionCount += 1;
          await realFs.unlink(finalPath);
          await realFs.writeFile(finalPath, foreignBytes);
          const error = new Error('Injected directory sync failure after stable final replacement.');
          error.code = 'EIO';
          throw error;
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
      return realFs.open(targetPath, flags, ...rest);
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, open: faultingOpen }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise archive final replacement preservation.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the stable final replacement fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The stable final replacement fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    faultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    const after = await exactBytes(activeDirectory);
    const destinationEntries = (await realFs.readdir(destination)).sort();

    assert.deepEqual(
      {
        errorCode: archiveError?.code,
        archiveErrorCode: archiveError?.archiveError?.code,
        injectionCount,
        activeBytesPreserved: TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName])),
        foreignBytesPreserved: (await realFs.readFile(finalPath)).equals(foreignBytes),
        temporaryPreserved: destinationEntries.some((name) => name.startsWith('.task_plan.md.'))
      },
      {
        errorCode: 'ERR_TRIO_ARCHIVE_CLEANUP',
        archiveErrorCode: 'ERR_TRIO_DIRECTORY_SYNC',
        injectionCount: 1,
        activeBytesPreserved: true,
        foreignBytesPreserved: true,
        temporaryPreserved: true
      },
      'A stable final replacement must fail cleanup before any destination deletion.'
    );
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runStableFinalReplacementProbe() {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-archive-final-replacement-probe-'));
  const probePath = path.join(probeRoot, 'stable-final-replacement.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, stableFinalReplacementProbeSource(storeUrl), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function laterPublicationFailureProbeSource(storeUrl, unknownEntry) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];
const UNKNOWN_ENTRY = ${JSON.stringify(unknownEntry)};

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

async function runCase(t, { unknownEntry }) {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), unknownEntry ? 'trio-archive-later-unknown-' : 'trio-archive-later-owned-')));
  try {
    const taskId = unknownEntry ? 'later-unknown-task' : 'later-owned-task';
    const timestamp = unknownEntry ? '20260803-031005' : '20260803-031004';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    const unknownPath = path.join(destination, 'unknown.txt');
    let faultEnabled = false;
    let injectionCount = 0;
    const faultingOpen = async (targetPath, flags, ...rest) => {
      if (faultEnabled
        && flags === 'wx'
        && typeof targetPath === 'string'
        && path.dirname(path.resolve(targetPath)) === destination
        && path.basename(targetPath).startsWith('.findings.md.')) {
        faultEnabled = false;
        injectionCount += 1;
        if (unknownEntry) await realFs.writeFile(unknownPath, 'foreign unknown entry\\n');
        const error = new Error('Injected later archive publication failure.');
        error.code = 'EIO';
        throw error;
      }
      return realFs.open(targetPath, flags, ...rest);
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, open: faultingOpen }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise later archive publication failure handling.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the later publication fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The later publication fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    faultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    const after = await exactBytes(activeDirectory);
    const activeBytesPreserved = TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName]));

    if (unknownEntry) {
      assert.deepEqual(
        {
          errorCode: archiveError?.code,
          archiveErrorCode: archiveError?.archiveError?.code,
          injectionCount,
          activeBytesPreserved,
          destinationEntries: (await realFs.readdir(destination)).sort(),
          unknownBytes: await realFs.readFile(unknownPath, 'utf8')
        },
        {
          errorCode: 'ERR_TRIO_ARCHIVE_CLEANUP',
          archiveErrorCode: 'ERR_TRIO_ARCHIVE_PUBLICATION',
          injectionCount: 1,
          activeBytesPreserved: true,
          destinationEntries: ['task_plan.md', 'unknown.txt'],
          unknownBytes: 'foreign unknown entry\\n'
        },
        'An unknown later-file entry must prevent every destination deletion.'
      );
      return;
    }

    await assert.rejects(() => realFs.readdir(destination), (error) => error?.code === 'ENOENT');
    assert.deepEqual(
      {
        errorCode: archiveError?.code,
        injectionCount,
        activeBytesPreserved
      },
      {
        errorCode: 'ERR_TRIO_ARCHIVE_PUBLICATION',
        injectionCount: 1,
        activeBytesPreserved: true
      },
      'A later owned-only failure must roll back every owned publication.'
    );
    const archive = await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    assert.equal(archive.status, 'archived');
    assert.deepEqual(await exactBytes(destination), before);
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
}

test('public archive handles one later publication failure mode', async (t) => {
  await runCase(t, { unknownEntry: UNKNOWN_ENTRY });
});
`;
}

async function runLaterPublicationFailureProbe(unknownEntry) {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), unknownEntry ? 'trio-archive-later-unknown-probe-' : 'trio-archive-later-owned-probe-'));
  const probePath = path.join(probeRoot, 'later-publication-failure.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, laterPublicationFailureProbeSource(storeUrl, unknownEntry), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function ambiguousLinkProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

test('public archive cleans a final publication after link succeeds and reports an error', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-ambiguous-link-')));
  try {
    const taskId = 'ambiguous-link-task';
    const timestamp = '20260803-031006';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    const finalPath = path.join(destination, 'task_plan.md');
    let faultEnabled = false;
    let injectionCount = 0;
    const faultingLink = async (sourcePath, targetPath) => {
      if (faultEnabled
        && path.resolve(targetPath) === finalPath
        && path.basename(sourcePath).startsWith('.task_plan.md.')) {
        faultEnabled = false;
        injectionCount += 1;
        await realFs.link(sourcePath, targetPath);
        const error = new Error('Injected real-link-then-throw failure.');
        error.code = 'EIO';
        throw error;
      }
      return realFs.link(sourcePath, targetPath);
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, link: faultingLink }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise ambiguous hard-link publication cleanup.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the ambiguous hard-link fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The ambiguous hard-link fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    faultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    const after = await exactBytes(activeDirectory);

    await assert.rejects(() => realFs.readdir(destination), (error) => error?.code === 'ENOENT');
    assert.deepEqual(
      {
        errorCode: archiveError?.code,
        injectionCount,
        activeBytesPreserved: TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName]))
      },
      {
        errorCode: 'ERR_TRIO_ARCHIVE_PUBLICATION',
        injectionCount: 1,
        activeBytesPreserved: true
      },
      'A link that physically published before throwing must still be recognized as owned cleanup state.'
    );

    const archive = await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    assert.equal(archive.status, 'archived');
    assert.deepEqual(await exactBytes(destination), before);
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runAmbiguousLinkProbe() {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-archive-ambiguous-link-probe-'));
  const probePath = path.join(probeRoot, 'ambiguous-link.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, ambiguousLinkProbeSource(storeUrl), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function unsupportedLinkProbeSource(storeUrl, linkCode) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const LINK_CODE = ${JSON.stringify(linkCode)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

test('public archive fails closed when hard-link publication is unsupported', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-unsupported-link-')));
  try {
    const taskId = \`unsupported-link-\${LINK_CODE.toLowerCase()}\`;
    const timestamp = '20260803-031007';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    const finalPath = path.join(destination, 'task_plan.md');
    let faultEnabled = false;
    let injectionCount = 0;
    const faultingLink = async (sourcePath, targetPath) => {
      if (faultEnabled
        && path.resolve(targetPath) === finalPath
        && path.basename(sourcePath).startsWith('.task_plan.md.')) {
        faultEnabled = false;
        injectionCount += 1;
        const error = new Error('Injected unsupported hard-link publication.');
        error.code = LINK_CODE;
        throw error;
      }
      return realFs.link(sourcePath, targetPath);
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, link: faultingLink }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise unsupported archive hard-link handling.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the unsupported hard-link fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The unsupported hard-link fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    faultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    const after = await exactBytes(activeDirectory);

    await assert.rejects(() => realFs.readdir(destination), (error) => error?.code === 'ENOENT');
    assert.deepEqual(
      {
        errorCode: archiveError?.code,
        causeCode: archiveError?.cause?.code,
        injectionCount,
        activeBytesPreserved: TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName]))
      },
      {
        errorCode: 'ERR_TRIO_ARCHIVE_PUBLICATION',
        causeCode: LINK_CODE,
        injectionCount: 1,
        activeBytesPreserved: true
      },
      'Unsupported hard links must not fall back to a weaker publication primitive.'
    );
    const archive = await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    assert.equal(archive.status, 'archived');
    assert.deepEqual(await exactBytes(destination), before);
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runUnsupportedLinkProbe(linkCode) {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), `trio-archive-unsupported-link-${linkCode.toLowerCase()}-`));
  const probePath = path.join(probeRoot, 'unsupported-link.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, unsupportedLinkProbeSource(storeUrl, linkCode), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function temporaryWriteFailureProbeSource(storeUrl, failurePoint) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const FAILURE_POINT = ${JSON.stringify(failurePoint)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

test('public archive cleans an identified temporary lease after write preparation fails', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-temp-write-failure-')));
  try {
    const taskId = \`temp-\${FAILURE_POINT}-task\`;
    const timestamp = '20260803-031008';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    let faultEnabled = false;
    let injectionCount = 0;
    const faultingOpen = async (targetPath, flags, ...rest) => {
      const handle = await realFs.open(targetPath, flags, ...rest);
      if (!faultEnabled
        || flags !== 'wx'
        || typeof targetPath !== 'string'
        || path.dirname(path.resolve(targetPath)) !== destination
        || !path.basename(targetPath).startsWith('.task_plan.md.')) {
        return handle;
      }
      faultEnabled = false;
      injectionCount += 1;
      return {
        stat: (...args) => handle.stat(...args),
        writeFile: FAILURE_POINT === 'write'
          ? async () => {
            const error = new Error('Injected temporary write failure.');
            error.code = 'EIO';
            throw error;
          }
          : (...args) => handle.writeFile(...args),
        sync: FAILURE_POINT === 'sync'
          ? async () => {
            const error = new Error('Injected temporary file sync failure.');
            error.code = 'EIO';
            throw error;
          }
          : (...args) => handle.sync(...args),
        close: (...args) => handle.close(...args)
      };
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, open: faultingOpen }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise temporary archive write failure cleanup.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the temporary write fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The temporary write fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    faultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    const after = await exactBytes(activeDirectory);

    await assert.rejects(() => realFs.readdir(destination), (error) => error?.code === 'ENOENT');
    assert.deepEqual(
      {
        errorCode: archiveError?.code,
        causeCode: archiveError?.cause?.code,
        injectionCount,
        activeBytesPreserved: TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName]))
      },
      {
        errorCode: 'ERR_TRIO_ARCHIVE_PUBLICATION',
        causeCode: 'EIO',
        injectionCount: 1,
        activeBytesPreserved: true
      },
      'An identified temporary lease must be cleaned without leaving archive residue.'
    );
    const archive = await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    assert.equal(archive.status, 'archived');
    assert.deepEqual(await exactBytes(destination), before);
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runTemporaryWriteFailureProbe(failurePoint) {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), `trio-archive-temp-${failurePoint}-probe-`));
  const probePath = path.join(probeRoot, 'temporary-write-failure.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, temporaryWriteFailureProbeSource(storeUrl, failurePoint), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function postLinkTemporaryFailureProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

test('public archive cleans both aliases when temporary settlement fails after publication', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-post-link-temp-')));
  try {
    const taskId = 'post-link-temp-task';
    const timestamp = '20260803-031009';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    let faultEnabled = false;
    let injectionCount = 0;
    const faultingUnlink = async (targetPath) => {
      if (faultEnabled
        && typeof targetPath === 'string'
        && path.dirname(path.resolve(targetPath)) === destination
        && path.basename(targetPath).startsWith('.task_plan.md.')) {
        faultEnabled = false;
        injectionCount += 1;
        const error = new Error('Injected post-link temporary settlement failure.');
        error.code = 'EIO';
        throw error;
      }
      return realFs.unlink(targetPath);
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, unlink: faultingUnlink }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise post-link temporary settlement cleanup.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the post-link temporary fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The post-link temporary fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    faultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    const after = await exactBytes(activeDirectory);

    await assert.rejects(() => realFs.readdir(destination), (error) => error?.code === 'ENOENT');
    assert.deepEqual(
      {
        errorCode: archiveError?.code,
        injectionCount,
        activeBytesPreserved: TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName]))
      },
      {
        errorCode: 'ERR_TRIO_ARCHIVE_PUBLICATION',
        injectionCount: 1,
        activeBytesPreserved: true
      },
      'A post-link temporary failure must clean both owned aliases before retry.'
    );
    const archive = await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    assert.equal(archive.status, 'archived');
    assert.deepEqual(await exactBytes(destination), before);
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runPostLinkTemporaryFailureProbe() {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-archive-post-link-temp-probe-'));
  const probePath = path.join(probeRoot, 'post-link-temporary-failure.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, postLinkTemporaryFailureProbeSource(storeUrl), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function destinationReplacementProbeSource(storeUrl, populated) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const POPULATED = ${JSON.stringify(populated)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

test('public archive refuses a destination replacement after claim', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-destination-replacement-')));
  try {
    const taskId = POPULATED ? 'populated-destination-replacement-task' : 'empty-destination-replacement-task';
    const timestamp = POPULATED ? '20260803-031011' : '20260803-031010';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    const sentinelPath = path.join(destination, 'sentinel.txt');
    let faultEnabled = false;
    let injectionCount = 0;
    const faultingOpen = async (targetPath, flags, ...rest) => {
      const handle = await realFs.open(targetPath, flags, ...rest);
      if (faultEnabled
        && flags === 'r'
        && typeof targetPath === 'string'
        && path.resolve(targetPath) === destination) {
        faultEnabled = false;
        injectionCount += 1;
        await realFs.rm(destination, { recursive: true, force: true });
        await realFs.mkdir(destination);
        if (POPULATED) await realFs.writeFile(sentinelPath, 'foreign destination sentinel\\n');
      }
      return handle;
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, open: faultingOpen }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise archive destination replacement preservation.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the destination replacement fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The destination replacement fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    faultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    const after = await exactBytes(activeDirectory);

    assert.deepEqual(
      {
        errorCode: archiveError?.code,
        archiveErrorCode: archiveError?.archiveError?.code,
        injectionCount,
        activeBytesPreserved: TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName])),
        destinationEntries: (await realFs.readdir(destination)).sort(),
        sentinel: POPULATED ? await realFs.readFile(sentinelPath, 'utf8') : null
      },
      {
        errorCode: 'ERR_TRIO_ARCHIVE_CLEANUP',
        archiveErrorCode: 'ERR_TRIO_ARCHIVE_OWNERSHIP',
        injectionCount: 1,
        activeBytesPreserved: true,
        destinationEntries: POPULATED ? ['sentinel.txt'] : [],
        sentinel: POPULATED ? 'foreign destination sentinel\\n' : null
      },
      'A replaced destination directory must remain outside every publication and cleanup mutation.'
    );
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runDestinationReplacementProbe(populated) {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), populated ? 'trio-archive-populated-destination-probe-' : 'trio-archive-empty-destination-probe-'));
  const probePath = path.join(probeRoot, 'destination-replacement.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, destinationReplacementProbeSource(storeUrl, populated), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function sameInodeContentDriftProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

test('public archive rejects same-inode final content drift before cleanup', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-same-inode-drift-')));
  try {
    const taskId = 'same-inode-drift-task';
    const timestamp = '20260803-031012';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    const finalPath = path.join(destination, 'task_plan.md');
    const driftBytes = Buffer.from('same inode content drift\\n');
    let faultEnabled = false;
    let injectionCount = 0;
    let sameInode = false;
    const faultingOpen = async (targetPath, flags, ...rest) => {
      if (faultEnabled
        && flags === 'r'
        && typeof targetPath === 'string'
        && path.resolve(targetPath) === destination) {
        try {
          const before = await realFs.lstat(finalPath, { bigint: true });
          faultEnabled = false;
          injectionCount += 1;
          await realFs.writeFile(finalPath, driftBytes);
          const after = await realFs.lstat(finalPath, { bigint: true });
          sameInode = before.dev === after.dev && before.ino === after.ino;
          const error = new Error('Injected same-inode content drift after hard-link publication.');
          error.code = 'EIO';
          throw error;
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
      return realFs.open(targetPath, flags, ...rest);
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, open: faultingOpen }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise same-inode archive content drift handling.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the same-inode content drift fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The same-inode content drift fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    faultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    const after = await exactBytes(activeDirectory);
    const destinationEntries = (await realFs.readdir(destination)).sort();

    assert.deepEqual(
      {
        errorCode: archiveError?.code,
        archiveErrorCode: archiveError?.archiveError?.code,
        injectionCount,
        sameInode,
        activeBytesPreserved: TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName])),
        driftBytesPreserved: (await realFs.readFile(finalPath)).equals(driftBytes),
        temporaryPreserved: destinationEntries.some((name) => name.startsWith('.task_plan.md.'))
      },
      {
        errorCode: 'ERR_TRIO_ARCHIVE_CLEANUP',
        archiveErrorCode: 'ERR_TRIO_DIRECTORY_SYNC',
        injectionCount: 1,
        sameInode: true,
        activeBytesPreserved: true,
        driftBytesPreserved: true,
        temporaryPreserved: true
      },
      'Content drift on the published inode must produce zero destination deletion.'
    );
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runSameInodeContentDriftProbe() {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-archive-same-inode-drift-probe-'));
  const probePath = path.join(probeRoot, 'same-inode-content-drift.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, sameInodeContentDriftProbeSource(storeUrl), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function leaseCloseFailureProbeSource(storeUrl, failureCount) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const FAILURE_COUNT = ${JSON.stringify(failureCount)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

test('public archive finalizes every lease before source removal', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-close-failure-')));
  try {
    const taskId = \`lease-close-\${FAILURE_COUNT}-task\`;
    const timestamp = '20260803-031013';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    let faultEnabled = false;
    let injected = 0;
    const faultingOpen = async (targetPath, flags, ...rest) => {
      const handle = await realFs.open(targetPath, flags, ...rest);
      if (!faultEnabled
        || flags !== 'wx'
        || typeof targetPath !== 'string'
        || path.dirname(path.resolve(targetPath)) !== destination
        || !path.basename(targetPath).startsWith('.')) {
        return handle;
      }
      return {
        stat: (...args) => handle.stat(...args),
        writeFile: (...args) => handle.writeFile(...args),
        sync: (...args) => handle.sync(...args),
        close: async (...args) => {
          await handle.close(...args);
          if (injected < FAILURE_COUNT) {
            injected += 1;
            const error = new Error('Injected archive lease close failure after real close.');
            error.code = 'EIO';
            throw error;
          }
        }
      };
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, open: faultingOpen }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise archive lease close error composition.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the archive lease-close fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The archive lease-close fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    faultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    faultEnabled = false;
    const after = await exactBytes(activeDirectory);

    await assert.rejects(() => realFs.readdir(destination), (error) => error?.code === 'ENOENT');
    assert.deepEqual(
      {
        errorCode: archiveError?.code,
        archiveErrorCode: archiveError?.archiveError?.code,
        injected,
        aggregateCause: archiveError?.cause instanceof AggregateError,
        activeBytesPreserved: TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName]))
      },
      {
        errorCode: 'ERR_TRIO_ARCHIVE_CLEANUP',
        archiveErrorCode: 'ERR_TRIO_ARCHIVE_CLOSE',
        injected: FAILURE_COUNT,
        aggregateCause: FAILURE_COUNT > 1,
        activeBytesPreserved: true
      },
      'Lease close failures must remain pre-source-removal cleanup failures.'
    );
    const archive = await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    assert.equal(archive.status, 'archived');
    assert.deepEqual(await exactBytes(destination), before);
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runLeaseCloseFailureProbe(failureCount) {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), `trio-archive-close-${failureCount}-probe-`));
  const probePath = path.join(probeRoot, 'lease-close-failure.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, leaseCloseFailureProbeSource(storeUrl, failureCount), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function openSuccessStatFailureProbeSource(storeUrl, targetKind) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const TARGET_KIND = ${JSON.stringify(targetKind)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

test('public archive preserves provisional ownership when identity stat fails', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-stat-failure-')));
  try {
    const taskId = \`stat-failure-\${TARGET_KIND}-task\`;
    const timestamp = TARGET_KIND === 'directory' ? '20260803-031014' : '20260803-031015';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    let faultEnabled = false;
    let injectionCount = 0;
    const faultingOpen = async (targetPath, flags, ...rest) => {
      const handle = await realFs.open(targetPath, flags, ...rest);
      const matchesDirectory = TARGET_KIND === 'directory'
        && flags === 'r'
        && typeof targetPath === 'string'
        && path.resolve(targetPath) === destination;
      const matchesTemporary = TARGET_KIND === 'temporary'
        && flags === 'wx'
        && typeof targetPath === 'string'
        && path.dirname(path.resolve(targetPath)) === destination
        && path.basename(targetPath).startsWith('.task_plan.md.');
      if (!faultEnabled || (!matchesDirectory && !matchesTemporary)) return handle;
      faultEnabled = false;
      injectionCount += 1;
      return {
        stat: async () => {
          const error = new Error('Injected handle identity stat failure.');
          error.code = 'EIO';
          throw error;
        },
        writeFile: (...args) => handle.writeFile(...args),
        sync: (...args) => handle.sync(...args),
        close: (...args) => handle.close(...args)
      };
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, open: faultingOpen }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise archive provisional identity failure handling.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the provisional identity fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The provisional identity fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    faultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    const after = await exactBytes(activeDirectory);
    const destinationEntries = (await realFs.readdir(destination)).sort();

    assert.deepEqual(
      {
        errorCode: archiveError?.code,
        archiveErrorCode: archiveError?.archiveError?.code,
        injectionCount,
        activeBytesPreserved: TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName])),
        destinationEntries
      },
      {
        errorCode: 'ERR_TRIO_ARCHIVE_CLEANUP',
        archiveErrorCode: TARGET_KIND === 'directory' ? 'EIO' : 'ERR_TRIO_ARCHIVE_PUBLICATION',
        injectionCount: 1,
        activeBytesPreserved: true,
        destinationEntries: TARGET_KIND === 'directory' ? [] : destinationEntries
      },
      'Identity-pending leases must preserve their path state rather than authorize cleanup deletion.'
    );
    if (TARGET_KIND === 'temporary') {
      assert.equal(destinationEntries.length, 1);
      assert.match(destinationEntries[0], /^\.task_plan\.md\./u);
    }
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runOpenSuccessStatFailureProbe(targetKind) {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), `trio-archive-stat-${targetKind}-probe-`));
  const probePath = path.join(probeRoot, 'open-success-stat-failure.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, openSuccessStatFailureProbeSource(storeUrl, targetKind), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function ambiguousTemporaryUnlinkProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

async function entriesOrMissing(directory) {
  try {
    return (await realFs.readdir(directory)).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

test('public archive rolls back after a real temporary unlink reports an error', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-ambiguous-temp-unlink-')));
  try {
    const taskId = 'ambiguous-temp-unlink-task';
    const timestamp = '20260803-031016';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    let faultEnabled = false;
    let injectionCount = 0;
    const faultingUnlink = async (targetPath) => {
      if (faultEnabled
        && typeof targetPath === 'string'
        && path.dirname(path.resolve(targetPath)) === destination
        && path.basename(targetPath).startsWith('.task_plan.md.')) {
        faultEnabled = false;
        injectionCount += 1;
        await realFs.unlink(targetPath);
        const error = new Error('Injected real temporary unlink followed by EIO.');
        error.code = 'EIO';
        throw error;
      }
      return realFs.unlink(targetPath);
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, unlink: faultingUnlink }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise ambiguous temporary unlink settlement.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the ambiguous temporary unlink fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The ambiguous temporary unlink fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    faultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    let after = null;
    try {
      after = await exactBytes(activeDirectory);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }

    assert.deepEqual(
      {
        errorCode: archiveError?.code,
        injectionCount,
        activeBytesPreserved: after !== null && TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName])),
        destinationEntries: await entriesOrMissing(destination)
      },
      {
        errorCode: 'ERR_TRIO_ARCHIVE_PUBLICATION',
        injectionCount: 1,
        activeBytesPreserved: true,
        destinationEntries: null
      },
      'A real unlink followed by an error must settle the temp lease but still preserve active bytes for retry.'
    );
    const archive = await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    assert.equal(archive.status, 'archived');
    assert.deepEqual(await exactBytes(destination), before);
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runAmbiguousTemporaryUnlinkProbe() {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-archive-ambiguous-temp-unlink-probe-'));
  const probePath = path.join(probeRoot, 'ambiguous-temporary-unlink.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, ambiguousTemporaryUnlinkProbeSource(storeUrl), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function ambiguousCleanupMutationProbeSource(storeUrl, mutationKind) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const MUTATION_KIND = ${JSON.stringify(mutationKind)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

test('public archive settles cleanup mutations that completed before reporting an error', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-ambiguous-cleanup-')));
  try {
    const taskId = \`ambiguous-cleanup-\${MUTATION_KIND}-task\`;
    const timestamp = MUTATION_KIND === 'unlink' ? '20260803-031017' : '20260803-031018';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    const finalPath = path.join(destination, 'task_plan.md');
    let archiveFaultEnabled = false;
    let mutationFaultEnabled = false;
    let archiveFaultCount = 0;
    let mutationFaultCount = 0;
    const faultingOpen = async (targetPath, flags, ...rest) => {
      if (archiveFaultEnabled
        && flags === 'r'
        && typeof targetPath === 'string'
        && path.resolve(targetPath) === destination) {
        try {
          await realFs.lstat(finalPath);
          archiveFaultEnabled = false;
          archiveFaultCount += 1;
          const error = new Error('Injected post-link directory sync failure for cleanup mutation probe.');
          error.code = 'EIO';
          throw error;
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
      return realFs.open(targetPath, flags, ...rest);
    };
    const faultingUnlink = async (targetPath) => {
      if (mutationFaultEnabled
        && MUTATION_KIND === 'unlink'
        && path.resolve(targetPath) === finalPath) {
        mutationFaultEnabled = false;
        mutationFaultCount += 1;
        await realFs.unlink(targetPath);
        const error = new Error('Injected real final unlink followed by EIO.');
        error.code = 'EIO';
        throw error;
      }
      return realFs.unlink(targetPath);
    };
    const faultingRmdir = async (targetPath) => {
      if (mutationFaultEnabled
        && MUTATION_KIND === 'rmdir'
        && path.resolve(targetPath) === destination) {
        mutationFaultEnabled = false;
        mutationFaultCount += 1;
        await realFs.rmdir(targetPath);
        const error = new Error('Injected real destination rmdir followed by EIO.');
        error.code = 'EIO';
        throw error;
      }
      return realFs.rmdir(targetPath);
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, open: faultingOpen, unlink: faultingUnlink, rmdir: faultingRmdir }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise ambiguous archive cleanup mutation settlement.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the ambiguous cleanup mutation fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The ambiguous cleanup mutation fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    archiveFaultEnabled = true;
    mutationFaultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    const after = await exactBytes(activeDirectory);

    await assert.rejects(() => realFs.readdir(destination), (error) => error?.code === 'ENOENT');
    assert.deepEqual(
      {
        errorCode: archiveError?.code,
        archiveFaultCount,
        mutationFaultCount,
        activeBytesPreserved: TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName]))
      },
      {
        errorCode: 'ERR_TRIO_DIRECTORY_SYNC',
        archiveFaultCount: 1,
        mutationFaultCount: 1,
        activeBytesPreserved: true
      },
      'Cleanup must settle a real mutation before rethrowing the original archive error.'
    );
    const archive = await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    assert.equal(archive.status, 'archived');
    assert.deepEqual(await exactBytes(destination), before);
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runAmbiguousCleanupMutationProbe(mutationKind) {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), `trio-archive-ambiguous-${mutationKind}-probe-`));
  const probePath = path.join(probeRoot, 'ambiguous-cleanup-mutation.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, ambiguousCleanupMutationProbeSource(storeUrl, mutationKind), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function finalCleanupDoubleFaultProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];
const ORIGINAL_CODE = 'E_TEST_ARCHIVE_ORIGINAL';
const MUTATION_CODE = 'E_TEST_FINAL_UNLINK';
const OBSERVATION_CODE = 'E_TEST_FINAL_LSTAT';

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

function reachableCodes(error, seen = new Set(), codes = new Set()) {
  if (!error || typeof error !== 'object' || seen.has(error)) return codes;
  seen.add(error);
  if (typeof error.code === 'string') codes.add(error.code);
  reachableCodes(error.cause, seen, codes);
  reachableCodes(error.archiveError, seen, codes);
  for (const nested of error.cleanupErrors ?? []) reachableCodes(nested, seen, codes);
  for (const nested of error.leaseErrors ?? []) reachableCodes(nested, seen, codes);
  for (const nested of error.errors ?? []) reachableCodes(nested, seen, codes);
  return codes;
}

test('public archive retains both final cleanup mutation and settlement-observation failures', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-final-double-fault-')));
  try {
    const taskId = 'final-double-fault-task';
    const timestamp = '20260803-034001';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    const finalPath = path.join(destination, 'task_plan.md');
    let archiveFaultEnabled = false;
    let mutationFaultEnabled = false;
    let observationFaultEnabled = false;
    let archiveFaultCount = 0;
    let mutationFaultCount = 0;
    let observationFaultCount = 0;

    const faultingOpen = async (targetPath, flags, ...rest) => {
      if (archiveFaultEnabled
        && flags === 'r'
        && typeof targetPath === 'string'
        && path.resolve(targetPath) === destination) {
        try {
          await realFs.lstat(finalPath);
          archiveFaultEnabled = false;
          archiveFaultCount += 1;
          const error = new Error('Injected original archive failure after final publication.');
          error.code = ORIGINAL_CODE;
          throw error;
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
      return realFs.open(targetPath, flags, ...rest);
    };
    const faultingUnlink = async (targetPath) => {
      if (mutationFaultEnabled && path.resolve(targetPath) === finalPath) {
        mutationFaultEnabled = false;
        observationFaultEnabled = true;
        mutationFaultCount += 1;
        const error = new Error('Injected cleanup final unlink failure without mutation.');
        error.code = MUTATION_CODE;
        throw error;
      }
      return realFs.unlink(targetPath);
    };
    const faultingLstat = async (targetPath, ...rest) => {
      if (observationFaultEnabled && path.resolve(targetPath) === finalPath) {
        observationFaultEnabled = false;
        observationFaultCount += 1;
        const error = new Error('Injected cleanup final settlement observation failure.');
        error.code = OBSERVATION_CODE;
        throw error;
      }
      return realFs.lstat(targetPath, ...rest);
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, open: faultingOpen, unlink: faultingUnlink, lstat: faultingLstat }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise final cleanup double-fault reporting.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the final cleanup double-fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The final cleanup double-fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    archiveFaultEnabled = true;
    mutationFaultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    const after = await exactBytes(activeDirectory);
    const codes = [...reachableCodes(archiveError)].sort();
    const activeBytesPreserved = TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName]));
    console.log(JSON.stringify({
      errorCode: archiveError?.code,
      archiveFaultCount,
      mutationFaultCount,
      observationFaultCount,
      activeBytesPreserved,
      codes
    }));

    assert.equal(activeBytesPreserved, true);
    assert.equal(archiveFaultCount, 1);
    assert.equal(mutationFaultCount, 1);
    assert.equal(observationFaultCount, 1);
    assert.ok(codes.includes('ERR_TRIO_DIRECTORY_SYNC'));
    assert.ok(codes.includes(ORIGINAL_CODE));
    assert.ok(codes.includes(MUTATION_CODE), 'The cleanup mutation code must remain reachable after observation failure.');
    assert.ok(codes.includes(OBSERVATION_CODE));
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runFinalCleanupDoubleFaultProbe() {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-archive-final-double-fault-probe-'));
  const probePath = path.join(probeRoot, 'final-cleanup-double-fault.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, finalCleanupDoubleFaultProbeSource(storeUrl), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function temporarySettlementDoubleFaultProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];
const MUTATION_CODE = 'E_TEST_TEMP_UNLINK';
const OBSERVATION_CODE = 'E_TEST_TEMP_LSTAT';

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

async function entriesOrMissing(directory) {
  try {
    return (await realFs.readdir(directory)).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function reachableCodes(error, seen = new Set(), codes = new Set()) {
  if (!error || typeof error !== 'object' || seen.has(error)) return codes;
  seen.add(error);
  if (typeof error.code === 'string') codes.add(error.code);
  reachableCodes(error.cause, seen, codes);
  reachableCodes(error.archiveError, seen, codes);
  for (const nested of error.cleanupErrors ?? []) reachableCodes(nested, seen, codes);
  for (const nested of error.leaseErrors ?? []) reachableCodes(nested, seen, codes);
  for (const nested of error.errors ?? []) reachableCodes(nested, seen, codes);
  return codes;
}

test('public archive retains normal temporary settlement mutation and observation failures', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-temp-double-fault-')));
  try {
    const taskId = 'temp-double-fault-task';
    const timestamp = '20260803-034002';
    const destination = path.join(root, 'planning', 'archive', timestamp + '-' + taskId);
    const foreignPath = path.join(root, 'foreign-sentinel.txt');
    const foreignBytes = Buffer.from('foreign sentinel bytes\\n');
    let mutationFaultEnabled = false;
    let observationFaultEnabled = false;
    let temporaryPath = null;
    let mutationFaultCount = 0;
    let observationFaultCount = 0;

    const isTaskPlanTemporary = (targetPath) => typeof targetPath === 'string'
      && path.dirname(path.resolve(targetPath)) === destination
      && path.basename(targetPath).startsWith('.task_plan.md.');
    const faultingUnlink = async (targetPath) => {
      if (mutationFaultEnabled && isTaskPlanTemporary(targetPath)) {
        mutationFaultEnabled = false;
        observationFaultEnabled = true;
        temporaryPath = path.resolve(targetPath);
        mutationFaultCount += 1;
        const error = new Error('Injected normal temporary settlement unlink failure without mutation.');
        error.code = MUTATION_CODE;
        throw error;
      }
      return realFs.unlink(targetPath);
    };
    const faultingLstat = async (targetPath, ...rest) => {
      if (observationFaultEnabled && path.resolve(targetPath) === temporaryPath) {
        observationFaultEnabled = false;
        observationFaultCount += 1;
        const error = new Error('Injected normal temporary settlement observation failure.');
        error.code = OBSERVATION_CODE;
        throw error;
      }
      return realFs.lstat(targetPath, ...rest);
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, unlink: faultingUnlink, lstat: faultingLstat }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise temporary settlement double-fault reporting.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the temporary settlement double-fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The temporary settlement double-fault probe has durable acceptance evidence.'
    });
    await realFs.writeFile(foreignPath, foreignBytes);

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    mutationFaultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    const after = await exactBytes(activeDirectory);
    const codes = [...reachableCodes(archiveError)].sort();
    const activeBytesPreserved = TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName]));
    const foreignBytesPreserved = (await realFs.readFile(foreignPath)).equals(foreignBytes);
    const destinationEntries = await entriesOrMissing(destination);
    console.log(JSON.stringify({
      errorCode: archiveError?.code,
      mutationFaultCount,
      observationFaultCount,
      activeBytesPreserved,
      foreignBytesPreserved,
      destinationEntries,
      codes
    }));

    assert.equal(activeBytesPreserved, true);
    assert.equal(foreignBytesPreserved, true);
    assert.equal(destinationEntries, null);
    assert.equal(mutationFaultCount, 1);
    assert.equal(observationFaultCount, 1);
    assert.ok(codes.includes('ERR_TRIO_ARCHIVE_PUBLICATION'));
    assert.ok(codes.includes(MUTATION_CODE), 'The normal temporary mutation code must remain reachable after observation failure.');
    assert.ok(codes.includes(OBSERVATION_CODE));
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runTemporarySettlementDoubleFaultProbe() {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-archive-temp-double-fault-probe-'));
  const probePath = path.join(probeRoot, 'temporary-settlement-double-fault.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, temporarySettlementDoubleFaultProbeSource(storeUrl), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function destinationRmdirDoubleFaultProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];
const ORIGINAL_CODE = 'E_TEST_RMDIR_ARCHIVE_ORIGINAL';
const MUTATION_CODE = 'E_TEST_DESTINATION_RMDIR';
const OBSERVATION_CODE = 'E_TEST_DESTINATION_LSTAT';

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

function reachableCodes(error, seen = new Set(), codes = new Set()) {
  if (!error || typeof error !== 'object' || seen.has(error)) return codes;
  seen.add(error);
  if (typeof error.code === 'string') codes.add(error.code);
  reachableCodes(error.cause, seen, codes);
  reachableCodes(error.archiveError, seen, codes);
  for (const nested of error.cleanupErrors ?? []) reachableCodes(nested, seen, codes);
  for (const nested of error.leaseErrors ?? []) reachableCodes(nested, seen, codes);
  for (const nested of error.errors ?? []) reachableCodes(nested, seen, codes);
  return codes;
}

test('public archive retains destination rmdir mutation and settlement-observation failures', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-rmdir-double-fault-')));
  try {
    const taskId = 'rmdir-double-fault-task';
    const timestamp = '20260803-034003';
    const destination = path.join(root, 'planning', 'archive', timestamp + '-' + taskId);
    const finalPath = path.join(destination, 'task_plan.md');
    const foreignPath = path.join(root, 'foreign-sentinel.txt');
    const foreignBytes = Buffer.from('foreign rmdir sentinel bytes\\n');
    let archiveFaultEnabled = false;
    let mutationFaultEnabled = false;
    let observationFaultEnabled = false;
    let archiveFaultCount = 0;
    let mutationFaultCount = 0;
    let observationFaultCount = 0;

    const faultingOpen = async (targetPath, flags, ...rest) => {
      if (archiveFaultEnabled
        && flags === 'r'
        && typeof targetPath === 'string'
        && path.resolve(targetPath) === destination) {
        try {
          await realFs.lstat(finalPath);
          archiveFaultEnabled = false;
          archiveFaultCount += 1;
          const error = new Error('Injected original archive failure before destination cleanup.');
          error.code = ORIGINAL_CODE;
          throw error;
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
      return realFs.open(targetPath, flags, ...rest);
    };
    const faultingRmdir = async (targetPath) => {
      if (mutationFaultEnabled && path.resolve(targetPath) === destination) {
        mutationFaultEnabled = false;
        observationFaultEnabled = true;
        mutationFaultCount += 1;
        const error = new Error('Injected destination rmdir failure without mutation.');
        error.code = MUTATION_CODE;
        throw error;
      }
      return realFs.rmdir(targetPath);
    };
    const faultingLstat = async (targetPath, ...rest) => {
      if (observationFaultEnabled && path.resolve(targetPath) === destination) {
        observationFaultEnabled = false;
        observationFaultCount += 1;
        const error = new Error('Injected destination rmdir settlement observation failure.');
        error.code = OBSERVATION_CODE;
        throw error;
      }
      return realFs.lstat(targetPath, ...rest);
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, open: faultingOpen, rmdir: faultingRmdir, lstat: faultingLstat }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise destination rmdir double-fault reporting.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the destination rmdir double-fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The destination rmdir double-fault probe has durable acceptance evidence.'
    });
    await realFs.writeFile(foreignPath, foreignBytes);

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    archiveFaultEnabled = true;
    mutationFaultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    const after = await exactBytes(activeDirectory);
    const codes = [...reachableCodes(archiveError)].sort();
    const activeBytesPreserved = TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName]));
    const foreignBytesPreserved = (await realFs.readFile(foreignPath)).equals(foreignBytes);
    console.log(JSON.stringify({
      errorCode: archiveError?.code,
      archiveFaultCount,
      mutationFaultCount,
      observationFaultCount,
      activeBytesPreserved,
      foreignBytesPreserved,
      codes
    }));

    assert.equal(activeBytesPreserved, true);
    assert.equal(foreignBytesPreserved, true);
    assert.equal(archiveFaultCount, 1);
    assert.equal(mutationFaultCount, 1);
    assert.equal(observationFaultCount, 1);
    assert.ok(codes.includes(MUTATION_CODE), 'The destination rmdir mutation code must remain reachable after observation failure.');
    assert.ok(codes.includes('ERR_TRIO_DIRECTORY_SYNC'));
    assert.ok(codes.includes(ORIGINAL_CODE));
    assert.ok(codes.includes(OBSERVATION_CODE));
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runDestinationRmdirDoubleFaultProbe() {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-archive-rmdir-double-fault-probe-'));
  const probePath = path.join(probeRoot, 'destination-rmdir-double-fault.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, destinationRmdirDoubleFaultProbeSource(storeUrl), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function cleanupReplacementProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

test('public archive stops cleanup when destination changes between owned unlinks', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-cleanup-replacement-')));
  try {
    const taskId = 'cleanup-replacement-task';
    const timestamp = '20260803-031019';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    const finalPath = path.join(destination, 'task_plan.md');
    const sentinelPath = path.join(destination, 'foreign.txt');
    let archiveFaultEnabled = false;
    let replacementEnabled = false;
    let archiveFaultCount = 0;
    let replacementCount = 0;
    const faultingOpen = async (targetPath, flags, ...rest) => {
      if (archiveFaultEnabled
        && flags === 'r'
        && typeof targetPath === 'string'
        && path.resolve(targetPath) === destination) {
        try {
          await realFs.lstat(finalPath);
          archiveFaultEnabled = false;
          archiveFaultCount += 1;
          const error = new Error('Injected post-link directory sync failure for replacement probe.');
          error.code = 'EIO';
          throw error;
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
      return realFs.open(targetPath, flags, ...rest);
    };
    const faultingUnlink = async (targetPath) => {
      if (replacementEnabled && path.resolve(targetPath) === finalPath) {
        replacementEnabled = false;
        replacementCount += 1;
        await realFs.unlink(targetPath);
        await realFs.rm(destination, { recursive: true, force: true });
        await realFs.mkdir(destination);
        await realFs.writeFile(sentinelPath, 'foreign replacement survives\\n');
        return;
      }
      return realFs.unlink(targetPath);
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, open: faultingOpen, unlink: faultingUnlink }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise cleanup destination replacement handling.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the cleanup destination replacement fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The cleanup destination replacement fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    archiveFaultEnabled = true;
    replacementEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    const after = await exactBytes(activeDirectory);

    assert.deepEqual(
      {
        errorCode: archiveError?.code,
        archiveErrorCode: archiveError?.archiveError?.code,
        archiveFaultCount,
        replacementCount,
        activeBytesPreserved: TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName])),
        destinationEntries: await realFs.readdir(destination),
        sentinel: await realFs.readFile(sentinelPath, 'utf8')
      },
      {
        errorCode: 'ERR_TRIO_ARCHIVE_CLEANUP',
        archiveErrorCode: 'ERR_TRIO_DIRECTORY_SYNC',
        archiveFaultCount: 1,
        replacementCount: 1,
        activeBytesPreserved: true,
        destinationEntries: ['foreign.txt'],
        sentinel: 'foreign replacement survives\\n'
      },
      'Cleanup must stop before any mutation of a replacement destination directory.'
    );
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runCleanupReplacementProbe() {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), 'trio-archive-cleanup-replacement-probe-'));
  const probePath = path.join(probeRoot, 'cleanup-replacement.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, cleanupReplacementProbeSource(storeUrl), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

function ambiguousClaimOrOpenProbeSource(storeUrl, faultKind) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const FAULT_KIND = ${JSON.stringify(faultKind)};
const TRIO_FILES = ['task_plan.md', 'findings.md', 'progress.md'];

async function exactBytes(directory) {
  return Object.fromEntries(await Promise.all(TRIO_FILES.map(async (fileName) => [
    fileName,
    await realFs.readFile(path.join(directory, fileName))
  ])));
}

test('public archive preserves ambiguous paths without a returned live handle', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-archive-ambiguous-handle-')));
  try {
    const taskId = \`ambiguous-\${FAULT_KIND}-task\`;
    const timestamp = FAULT_KIND === 'mkdir' ? '20260803-031020' : '20260803-031021';
    const destination = path.join(root, 'planning', 'archive', \`\${timestamp}-\${taskId}\`);
    let faultEnabled = false;
    let injectionCount = 0;
    const faultingMkdir = async (targetPath, ...rest) => {
      if (faultEnabled && FAULT_KIND === 'mkdir' && path.resolve(targetPath) === destination) {
        faultEnabled = false;
        injectionCount += 1;
        await realFs.mkdir(targetPath, ...rest);
        const error = new Error('Injected real destination mkdir without a returned success value.');
        error.code = 'EIO';
        throw error;
      }
      return realFs.mkdir(targetPath, ...rest);
    };
    const faultingOpen = async (targetPath, flags, ...rest) => {
      if (faultEnabled
        && FAULT_KIND === 'open'
        && flags === 'wx'
        && typeof targetPath === 'string'
        && path.dirname(path.resolve(targetPath)) === destination
        && path.basename(targetPath).startsWith('.task_plan.md.')) {
        faultEnabled = false;
        injectionCount += 1;
        const handle = await realFs.open(targetPath, flags, ...rest);
        await handle.close();
        const error = new Error('Injected real temporary open without a returned handle.');
        error.code = 'EIO';
        throw error;
      }
      return realFs.open(targetPath, flags, ...rest);
    };

    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, mkdir: faultingMkdir, open: faultingOpen }
    });
    const store = await import(STORE_URL);
    await store.initializeTrioTask(root, taskId, 'Exercise ambiguous archive claim and open handling.');
    await store.acceptTrioTask(root, taskId, {
      actor: 'chief',
      detail: 'Chief accepted the ambiguous handle fault probe.'
    });
    await store.closeTrioTask(root, taskId, {
      actor: 'chief',
      reason: 'The ambiguous handle fault probe has durable acceptance evidence.'
    });

    const activeDirectory = path.join(root, 'planning', 'active', taskId);
    const before = await exactBytes(activeDirectory);
    faultEnabled = true;
    let archiveError;
    try {
      await store.archiveTrioTask(root, taskId, { actor: 'chief', timestamp });
    } catch (error) {
      archiveError = error;
    }
    const after = await exactBytes(activeDirectory);
    const destinationEntries = (await realFs.readdir(destination)).sort();

    assert.deepEqual(
      {
        errorCode: archiveError?.code,
        archiveErrorCode: archiveError?.archiveError?.code,
        injectionCount,
        activeBytesPreserved: TRIO_FILES.every((fileName) => before[fileName].equals(after[fileName])),
        destinationEntries
      },
      {
        errorCode: 'ERR_TRIO_ARCHIVE_CLEANUP',
        archiveErrorCode: FAULT_KIND === 'mkdir' ? 'ERR_TRIO_IO' : 'ERR_TRIO_ARCHIVE_PUBLICATION',
        injectionCount: 1,
        activeBytesPreserved: true,
        destinationEntries: FAULT_KIND === 'mkdir' ? [] : destinationEntries
      },
      'No returned handle means the archive must preserve path residue rather than guess deletion authority.'
    );
    if (FAULT_KIND === 'open') {
      assert.equal(destinationEntries.length, 1);
      assert.match(destinationEntries[0], /^\.task_plan\.md\./u);
    }
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

async function runAmbiguousClaimOrOpenProbe(faultKind) {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), `trio-archive-ambiguous-${faultKind}-probe-`));
  const probePath = path.join(probeRoot, 'ambiguous-claim-or-open.test.mjs');
  const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
  try {
    await writeFile(probePath, ambiguousClaimOrOpenProbeSource(storeUrl, faultKind), 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

test('generic reserved lifecycle names cannot bypass chief acceptance and closed Trios reject writes', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-lifecycle-accept-');
  try {
    await initialize(store, root, 'accept-task');
    for (const event of ['accepted', 'stopped', 'closed', 'archived']) {
      await assert.rejects(
        () => store.appendProgressEvent(root, 'accept-task', {
          event,
          actor: 'chief',
          detail: `Generic ${event} must not create lifecycle evidence.`
        }),
        (error) => error?.code === 'ERR_TRIO_RESERVED_EVENT'
      );
    }
    await store.appendProgressEvent(root, 'accept-task', {
      event: 'worker_done',
      actor: 'worker-1',
      detail: 'Worker finished the implementation.'
    });
    await assert.rejects(
      () => store.closeTrioTask(root, 'accept-task', { actor: 'chief', reason: 'No acceptance evidence yet.' }),
      /accepted|stopped|evidence/i
    );
    await assert.rejects(
      () => store.acceptTrioTask(root, 'accept-task', { actor: 'worker-1', detail: 'Worker cannot accept.' }),
      /chief/i
    );

    await store.acceptTrioTask(root, 'accept-task', {
      actor: 'chief',
      detail: 'Chief accepted the durable evidence.'
    });
    await assert.rejects(
      () => store.closeTrioTask(root, 'accept-task', { actor: 'worker-1', reason: 'Worker cannot close.' }),
      /chief/i
    );
    await store.closeTrioTask(root, 'accept-task', {
      actor: 'chief',
      reason: 'Accepted evidence is complete.'
    });

    const taskPlan = await readFile(path.join(root, 'planning', 'active', 'accept-task', 'task_plan.md'), 'utf8');
    assert.equal((taskPlan.match(/^Status:/gmu) ?? []).length, 1);
    assert.match(taskPlan, /^Status: closed$/mu);
    assert.match(taskPlan, /^Archive Eligible: yes$/mu);
    assert.match(taskPlan, /^Close Reason: Accepted evidence is complete\.$/mu);
    assert.equal((taskPlan.match(/^Archive Eligible:/gmu) ?? []).length, 1);
    assert.equal((taskPlan.match(/^Close Reason:/gmu) ?? []).length, 1);

    await assert.rejects(
      () => store.appendProgressEvent(root, 'accept-task', {
        event: 'review_note',
        actor: 'worker-1',
        detail: 'Progress cannot land after close.'
      }),
      /active|closed|lifecycle/i
    );
    await assert.rejects(
      () => store.acceptTrioTask(root, 'accept-task', {
        actor: 'chief',
        detail: 'Acceptance cannot land after close.'
      }),
      /active|closed|lifecycle/i
    );
    await assert.rejects(
      () => store.stopTrioTask(root, 'accept-task', {
        actor: 'chief',
        reason: 'Stop cannot land after close.'
      }),
      /active|closed|lifecycle/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('expected bindings are target-bound before their Trio hashes are verified', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-lifecycle-binding-target-');
  try {
    const taskA = await initialize(store, root, 'binding-task-a');
    await initialize(store, root, 'binding-task-b');
    await store.acceptTrioTask(root, 'binding-task-b', {
      actor: 'chief',
      detail: 'Chief accepted task B.'
    });

    await assert.rejects(
      () => store.closeTrioTask(root, 'binding-task-b', {
        actor: 'chief',
        reason: 'Task A binding must not authorize task B.',
        expectedBinding: taskA.binding
      }),
      (error) => error?.code === 'ERR_TRIO_BINDING_TARGET'
    );
    assert.equal((await readTrioTask(root, { taskId: 'binding-task-b' })).status, 'active');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('chief stop is durable evidence and archive preserves the exact Trio bytes', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-lifecycle-archive-');
  try {
    const initialized = await initialize(store, root, 'stop-task', 'Stop and archive a task.');
    await store.stopTrioTask(root, 'stop-task', {
      actor: 'chief',
      reason: 'The approved scope is no longer required.'
    });
    await store.closeTrioTask(root, 'stop-task', {
      actor: 'chief',
      reason: 'Stopped evidence permits closure.'
    });

    const sourceDir = path.join(root, 'planning', 'active', 'stop-task');
    const beforeBytes = Object.fromEntries(await Promise.all(
      ['task_plan.md', 'findings.md', 'progress.md'].map(async (name) => [
        name,
        await readFile(path.join(sourceDir, name), 'utf8')
      ])
    ));
    const archive = await store.archiveTrioTask(root, 'stop-task', {
      actor: 'chief',
      timestamp: '20260802-235959'
    });
    const destination = path.join(root, 'planning', 'archive', '20260802-235959-stop-task');

    assert.equal(archive.archiveDir, await realpath(destination));
    await assert.rejects(() => readFile(path.join(sourceDir, 'task_plan.md')), /ENOENT|no such file/i);
    assert.deepEqual(await fileNames(destination), ['findings.md', 'progress.md', 'task_plan.md']);
    for (const [name, bytes] of Object.entries(beforeBytes)) {
      assert.equal(await readFile(path.join(destination, name), 'utf8'), bytes);
    }
    assert.match(await readFile(path.join(destination, 'progress.md'), 'utf8'), /Event: stopped/u);
    assert.ok(initialized.taskDir.endsWith(path.join('planning', 'active', 'stop-task')));

    await assert.rejects(
      () => store.archiveTrioTask(root, 'stop-task', {
        actor: 'chief',
        timestamp: '20260802-235960'
      }),
      /not found|active|archiv/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('archive rejects invalid UTF-8 before destination claim and permits a clean retry after repair', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-lifecycle-archive-invalid-utf8-');
  try {
    const initialized = await initialize(store, root, 'utf8-task', 'Validate archive source bytes before claim.');
    await store.acceptTrioTask(root, 'utf8-task', {
      actor: 'chief',
      detail: 'Chief accepted the valid Trio before archive.'
    });
    await store.closeTrioTask(root, 'utf8-task', {
      actor: 'chief',
      reason: 'Accepted evidence allows archive validation.'
    });

    const sourceDir = path.join(root, 'planning', 'active', 'utf8-task');
    const sourceBeforeCorruption = Object.fromEntries(await Promise.all(
      ['task_plan.md', 'findings.md', 'progress.md'].map(async (name) => [
        name,
        await readFile(path.join(sourceDir, name))
      ])
    ));
    const findingsPath = path.join(sourceDir, 'findings.md');
    await writeFile(findingsPath, Buffer.from([0xff]));
    const sourceAfterCorruption = Object.fromEntries(await Promise.all(
      ['task_plan.md', 'findings.md', 'progress.md'].map(async (name) => [
        name,
        await readFile(path.join(sourceDir, name))
      ])
    ));
    const destination = path.join(root, 'planning', 'archive', '20260803-010001-utf8-task');

    await assert.rejects(
      () => store.archiveTrioTask(root, 'utf8-task', {
        actor: 'chief',
        timestamp: '20260803-010001'
      }),
      (error) => error?.code === 'ERR_TRIO_CORRUPT'
    );
    await assert.rejects(
      () => readdir(path.join(root, 'planning', 'archive')),
      (error) => error?.code === 'ENOENT'
    );
    await assert.rejects(() => readdir(destination), (error) => error?.code === 'ENOENT');
    assert.deepEqual(await fileNames(sourceDir), ['findings.md', 'progress.md', 'task_plan.md']);
    for (const [name, bytes] of Object.entries(sourceAfterCorruption)) {
      assert.deepEqual(await readFile(path.join(sourceDir, name)), bytes);
    }

    await writeFile(findingsPath, sourceBeforeCorruption['findings.md']);
    const archive = await store.archiveTrioTask(root, 'utf8-task', {
      actor: 'chief',
      timestamp: '20260803-010001'
    });
    assert.equal(archive.archiveDir, await realpath(destination));
    assert.deepEqual(await readFile(path.join(destination, 'findings.md')), sourceBeforeCorruption['findings.md']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('archive cleans a post-rename directory-sync failure before a same-timestamp retry', async () => {
  const result = await runPostRenameDirectorySyncProbe();
  assert.equal(
    result.code,
    0,
    `Post-rename directory-sync probe failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.equal(result.signal, null);
});

test('archive cleanup preserves a foreign final file that appears before publication', async () => {
  const result = await runPrePublicationForeignFileProbe();
  assert.equal(
    result.code,
    0,
    `Pre-publication foreign-file probe failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.equal(result.signal, null);
});

test('archive uses a create-only final publication primitive', async () => {
  const result = await runCreateOnlyCollisionProbe();
  assert.equal(
    result.code,
    0,
    `Create-only collision probe failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.equal(result.signal, null);
});

test('archive cleanup refuses a stable final replacement', async () => {
  const result = await runStableFinalReplacementProbe();
  assert.equal(
    result.code,
    0,
    `Stable final replacement probe failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.equal(result.signal, null);
});

test('archive cleanly rolls back only a fully validated later publication set', async () => {
  const ownedOnly = await runLaterPublicationFailureProbe(false);
  assert.equal(
    ownedOnly.code,
    0,
    `Later owned-only publication probe failed (signal: ${ownedOnly.signal ?? 'none'}).\nstdout:\n${ownedOnly.stdout}\nstderr:\n${ownedOnly.stderr}`
  );
  assert.equal(ownedOnly.signal, null);
  const unknown = await runLaterPublicationFailureProbe(true);
  assert.equal(
    unknown.code,
    0,
    `Later unknown-entry publication probe failed (signal: ${unknown.signal ?? 'none'}).\nstdout:\n${unknown.stdout}\nstderr:\n${unknown.stderr}`
  );
  assert.equal(unknown.signal, null);
});

test('archive identifies a final publication after an ambiguous hard-link error', async () => {
  const result = await runAmbiguousLinkProbe();
  assert.equal(
    result.code,
    0,
    `Ambiguous hard-link probe failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.equal(result.signal, null);
});

test('archive has no weaker publication fallback when hard links are unsupported', async () => {
  for (const linkCode of ['EXDEV', 'EOPNOTSUPP']) {
    const result = await runUnsupportedLinkProbe(linkCode);
    assert.equal(
      result.code,
      0,
      `Unsupported ${linkCode} probe failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.equal(result.signal, null);
  }
});

test('archive cleans identified temporary leases after write and sync failures', async () => {
  for (const failurePoint of ['write', 'sync']) {
    const result = await runTemporaryWriteFailureProbe(failurePoint);
    assert.equal(
      result.code,
      0,
      `Temporary ${failurePoint} failure probe failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.equal(result.signal, null);
  }
});

test('archive cleans both aliases after a post-link temporary settlement failure', async () => {
  const result = await runPostLinkTemporaryFailureProbe();
  assert.equal(
    result.code,
    0,
    `Post-link temporary failure probe failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.equal(result.signal, null);
});

test('archive refuses empty and populated destination replacements after claim', async () => {
  for (const populated of [false, true]) {
    const result = await runDestinationReplacementProbe(populated);
    assert.equal(
      result.code,
      0,
      `Destination replacement probe (${populated ? 'populated' : 'empty'}) failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.equal(result.signal, null);
  }
});

test('archive rejects same-inode content drift before cleanup mutation', async () => {
  const result = await runSameInodeContentDriftProbe();
  assert.equal(
    result.code,
    0,
    `Same-inode content drift probe failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.equal(result.signal, null);
});

test('archive composes one and multiple pre-source-removal lease close failures', async () => {
  for (const failureCount of [1, 2]) {
    const result = await runLeaseCloseFailureProbe(failureCount);
    assert.equal(
      result.code,
      0,
      `Lease close failure probe (${failureCount}) failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.equal(result.signal, null);
  }
});

test('archive leaves directory and temporary leases untouched when identity capture fails', async () => {
  for (const targetKind of ['directory', 'temporary']) {
    const result = await runOpenSuccessStatFailureProbe(targetKind);
    assert.equal(
      result.code,
      0,
      `Open-success stat-failure probe (${targetKind}) failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.equal(result.signal, null);
  }
});

test('archive rolls back after a real temporary unlink reports an error', async () => {
  const result = await runAmbiguousTemporaryUnlinkProbe();
  assert.equal(
    result.code,
    0,
    `Ambiguous temporary unlink probe failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.equal(result.signal, null);
});

test('archive settles real final-unlink and rmdir errors during cleanup', async () => {
  for (const mutationKind of ['unlink', 'rmdir']) {
    const result = await runAmbiguousCleanupMutationProbe(mutationKind);
    assert.equal(
      result.code,
      0,
      `Ambiguous cleanup ${mutationKind} probe failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.equal(result.signal, null);
  }
});

test('archive retains the mutation and observation causes of a final cleanup double fault', async () => {
  const result = await runFinalCleanupDoubleFaultProbe();
  assert.equal(
    result.code,
    0,
    `Final cleanup double-fault probe failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.equal(result.signal, null);
});

test('archive retains the mutation and observation causes of a normal temporary settlement double fault', async () => {
  const result = await runTemporarySettlementDoubleFaultProbe();
  assert.equal(
    result.code,
    0,
    `Temporary settlement double-fault probe failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.equal(result.signal, null);
});

test('archive retains the mutation and observation causes of a destination rmdir double fault', async () => {
  const result = await runDestinationRmdirDoubleFaultProbe();
  assert.equal(
    result.code,
    0,
    `Destination rmdir double-fault probe failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.equal(result.signal, null);
});

test('archive stops cleanup after destination replacement between owned unlinks', async () => {
  const result = await runCleanupReplacementProbe();
  assert.equal(
    result.code,
    0,
    `Cleanup replacement probe failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.equal(result.signal, null);
});

test('archive leaves ambiguous mkdir and temporary-open residue untouched', async () => {
  for (const faultKind of ['mkdir', 'open']) {
    const result = await runAmbiguousClaimOrOpenProbe(faultKind);
    assert.equal(
      result.code,
      0,
      `Ambiguous ${faultKind} probe failed (signal: ${result.signal ?? 'none'}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.equal(result.signal, null);
  }
});

test('close and archive fail closed for corrupt, drifted, extra-file, and destination-symlink state', async () => {
  const store = await requireStore();
  const corruptRoot = await createRoot('trio-lifecycle-corrupt-');
  const driftRoot = await createRoot('trio-lifecycle-drift-');
  const extraRoot = await createRoot('trio-lifecycle-extra-');
  const symlinkRoot = await createRoot('trio-lifecycle-destination-symlink-');
  const outsideRoot = await createRoot('trio-lifecycle-destination-outside-');
  try {
    await initialize(store, corruptRoot, 'corrupt-task');
    await store.acceptTrioTask(corruptRoot, 'corrupt-task', { actor: 'chief', detail: 'Accepted before corruption.' });
    const corruptPlan = path.join(corruptRoot, 'planning', 'active', 'corrupt-task', 'task_plan.md');
    await writeFile(corruptPlan, 'Status: active\nStatus: active\n', 'utf8');
    await assert.rejects(
      () => store.closeTrioTask(corruptRoot, 'corrupt-task', { actor: 'chief', reason: 'Reject corrupt state.' }),
      /corrupt|status|ambiguous/i
    );

    await initialize(store, driftRoot, 'drift-task');
    await store.acceptTrioTask(driftRoot, 'drift-task', { actor: 'chief', detail: 'Accepted before drift.' });
    const observed = await readTrioTask(driftRoot, { taskId: 'drift-task' });
    await writeFile(path.join(driftRoot, 'planning', 'active', 'drift-task', 'findings.md'), '# Drifted findings\n', 'utf8');
    await assert.rejects(
      () => store.closeTrioTask(driftRoot, 'drift-task', {
        actor: 'chief',
        reason: 'Reject drifted state.',
        expectedBinding: observed.binding
      }),
      /drift|mismatch|binding/i
    );

    await initialize(store, extraRoot, 'extra-task');
    await store.acceptTrioTask(extraRoot, 'extra-task', { actor: 'chief', detail: 'Accepted before extra state.' });
    await store.closeTrioTask(extraRoot, 'extra-task', { actor: 'chief', reason: 'Close before archive extra-file proof.' });
    await writeFile(path.join(extraRoot, 'planning', 'active', 'extra-task', 'extra.json'), '{}\n', 'utf8');
    await assert.rejects(
      () => store.archiveTrioTask(extraRoot, 'extra-task', {
        actor: 'chief',
        timestamp: '20260802-235958'
      }),
      /extra|exact|three|durable/i
    );

    await initialize(store, symlinkRoot, 'symlink-task');
    await store.acceptTrioTask(symlinkRoot, 'symlink-task', { actor: 'chief', detail: 'Accepted before destination proof.' });
    await store.closeTrioTask(symlinkRoot, 'symlink-task', { actor: 'chief', reason: 'Close before destination proof.' });
    await mkdir(path.join(symlinkRoot, 'planning', 'archive'), { recursive: true });
    await symlink(outsideRoot, path.join(symlinkRoot, 'planning', 'archive', '20260802-235957-symlink-task'));
    await assert.rejects(
      () => store.archiveTrioTask(symlinkRoot, 'symlink-task', {
        actor: 'chief',
        timestamp: '20260802-235957'
      }),
      /symlink|collision|exist/i
    );
    assert.match(
      await readFile(path.join(symlinkRoot, 'planning', 'active', 'symlink-task', 'task_plan.md'), 'utf8'),
      /^Status: closed$/mu
    );
  } finally {
    await rm(corruptRoot, { recursive: true, force: true });
    await rm(driftRoot, { recursive: true, force: true });
    await rm(extraRoot, { recursive: true, force: true });
    await rm(symlinkRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test('archive requires chief and refuses empty or populated destination collisions without clobbering', async () => {
  const store = await requireStore();
  const actorRoot = await createRoot('trio-lifecycle-archive-actor-');
  const emptyRoot = await createRoot('trio-lifecycle-archive-empty-collision-');
  const populatedRoot = await createRoot('trio-lifecycle-archive-populated-collision-');
  try {
    await initialize(store, actorRoot, 'actor-task');
    await store.stopTrioTask(actorRoot, 'actor-task', { actor: 'chief', reason: 'Prepare archive actor guard.' });
    await store.closeTrioTask(actorRoot, 'actor-task', { actor: 'chief', reason: 'Closed for archive actor guard.' });
    await assert.rejects(
      () => store.archiveTrioTask(actorRoot, 'actor-task', { timestamp: '20260803-000001' }),
      /chief/i
    );
    assert.equal((await readTrioTask(actorRoot, { taskId: 'actor-task' })).status, 'closed');

    await initialize(store, emptyRoot, 'empty-task');
    await store.stopTrioTask(emptyRoot, 'empty-task', { actor: 'chief', reason: 'Prepare empty collision.' });
    await store.closeTrioTask(emptyRoot, 'empty-task', { actor: 'chief', reason: 'Closed for empty collision.' });
    const emptyDestination = path.join(emptyRoot, 'planning', 'archive', '20260803-000002-empty-task');
    await mkdir(emptyDestination, { recursive: true });
    await assert.rejects(
      () => store.archiveTrioTask(emptyRoot, 'empty-task', {
        actor: 'chief',
        timestamp: '20260803-000002'
      }),
      /collision|exist/i
    );
    assert.deepEqual(await readdir(emptyDestination), []);
    assert.equal((await readTrioTask(emptyRoot, { taskId: 'empty-task' })).status, 'closed');

    await initialize(store, populatedRoot, 'populated-task');
    await store.stopTrioTask(populatedRoot, 'populated-task', { actor: 'chief', reason: 'Prepare populated collision.' });
    await store.closeTrioTask(populatedRoot, 'populated-task', { actor: 'chief', reason: 'Closed for populated collision.' });
    const populatedDestination = path.join(populatedRoot, 'planning', 'archive', '20260803-000003-populated-task');
    await mkdir(populatedDestination, { recursive: true });
    await writeFile(path.join(populatedDestination, 'sentinel.txt'), 'keep me\n', 'utf8');
    await assert.rejects(
      () => store.archiveTrioTask(populatedRoot, 'populated-task', {
        actor: 'chief',
        timestamp: '20260803-000003'
      }),
      /collision|exist/i
    );
    assert.equal(await readFile(path.join(populatedDestination, 'sentinel.txt'), 'utf8'), 'keep me\n');
    assert.equal((await readTrioTask(populatedRoot, { taskId: 'populated-task' })).status, 'closed');
  } finally {
    await rm(actorRoot, { recursive: true, force: true });
    await rm(emptyRoot, { recursive: true, force: true });
    await rm(populatedRoot, { recursive: true, force: true });
  }
});

test('all Trio write commands require an explicit task and preserve the read-only commands', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-lifecycle-command-');
  try {
    const missingTaskCommands = [
      ['init', '--root', root, '--goal', 'Missing task.'],
      ['progress', '--root', root, '--event', 'note', '--actor', 'worker', '--detail', 'Missing task.'],
      ['accept', '--root', root, '--actor', 'chief', '--detail', 'Missing task.'],
      ['stop', '--root', root, '--actor', 'chief', '--reason', 'Missing task.'],
      ['close', '--root', root, '--actor', 'chief', '--reason', 'Missing task.'],
      ['archive', '--root', root, '--actor', 'chief', '--timestamp', '20260802-235956']
    ];
    for (const args of missingTaskCommands) {
      await assert.rejects(() => trioCommand(args, { writeOutput: false }), /task|required|explicit/i);
    }

    const initReport = await trioCommand(
      ['init', '--root', root, '--task', 'cli-task', '--goal', 'Exercise the CLI lifecycle.'],
      { writeOutput: false }
    );
    assert.equal(initReport.command, 'init');
    await trioCommand(
      ['progress', '--root', root, '--task', 'cli-task', '--event', 'worker_done', '--actor', 'worker-1', '--detail', 'Done.'],
      { writeOutput: false }
    );
    await trioCommand(
      ['stop', '--root', root, '--task', 'cli-task', '--actor', 'chief', '--reason', 'Stopped.'],
      { writeOutput: false }
    );
    await trioCommand(
      ['close', '--root', root, '--task', 'cli-task', '--actor', 'chief', '--reason', 'Closed by CLI.'],
      { writeOutput: false }
    );
    await assert.rejects(
      () => trioCommand([
        'archive', '--root', root, '--task', 'cli-task', '--timestamp', '20260803-000004'
      ], { writeOutput: false }),
      /actor|required/i
    );
    const archive = await trioCommand([
      'archive', '--root', root, '--task', 'cli-task', '--actor', 'chief', '--timestamp', '20260803-000004'
    ], { writeOutput: false });
    assert.equal(archive.command, 'archive');
    assert.equal(await readFile(path.join(root, 'planning', 'archive', '20260803-000004-cli-task', 'progress.md'), 'utf8').then((value) => /Event: stopped/u.test(value)), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI accepts chief evidence before closing and archiving an independent lifecycle', async () => {
  const root = await createRoot('trio-lifecycle-cli-accept-');
  try {
    const init = await trioCommand([
      'init', '--root', root, '--task', 'cli-accept-task', '--goal', 'Exercise the CLI accepted archive chain.'
    ], { writeOutput: false });
    const progress = await trioCommand([
      'progress', '--root', root, '--task', 'cli-accept-task', '--event', 'worker_done', '--actor', 'worker-1', '--detail', 'Worker completed the scoped implementation.'
    ], { writeOutput: false });
    const accepted = await trioCommand([
      'accept', '--root', root, '--task', 'cli-accept-task', '--actor', 'chief', '--detail', 'Chief accepted the durable evidence.'
    ], { writeOutput: false });
    const closed = await trioCommand([
      'close', '--root', root, '--task', 'cli-accept-task', '--actor', 'chief', '--reason', 'Accepted evidence is complete.'
    ], { writeOutput: false });
    const archive = await trioCommand([
      'archive', '--root', root, '--task', 'cli-accept-task', '--actor', 'chief', '--timestamp', '20260803-010002'
    ], { writeOutput: false });
    const destination = path.join(root, 'planning', 'archive', '20260803-010002-cli-accept-task');
    const activeTaskDir = path.join(await realpath(root), 'planning', 'active', 'cli-accept-task');
    const progressPath = path.join(activeTaskDir, 'progress.md');
    const taskPlanPath = path.join(activeTaskDir, 'task_plan.md');

    assert.equal(init.command, 'init');
    assert.deepEqual(init.writes, [
      path.join(activeTaskDir, 'task_plan.md'),
      path.join(activeTaskDir, 'findings.md'),
      progressPath
    ]);
    assert.equal(progress.command, 'progress');
    assert.deepEqual(progress.writes, [progressPath]);
    assert.equal(accepted.command, 'accept');
    assert.deepEqual(accepted.writes, [progressPath]);
    assert.equal(closed.command, 'close');
    assert.deepEqual(closed.writes, [taskPlanPath]);
    assert.deepEqual(archive.writes, [archive.result.archiveDir]);
    assert.equal(archive.task, null);
    assert.equal(archive.result.archiveDir, await realpath(destination));
    const archivedProgress = await readFile(path.join(destination, 'progress.md'), 'utf8');
    assert.match(archivedProgress, /^Event: accepted$/mu);
    assert.match(archivedProgress, /^Actor: chief$/mu);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('parallel API and CLI progress writes retain every successful event', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-lifecycle-api-cli-contention-');
  try {
    const initialized = await initialize(store, root, 'api-cli-task');
    const results = await Promise.allSettled([
      store.appendProgressEvent(root, 'api-cli-task', {
        event: 'review_note',
        actor: 'api-worker',
        detail: 'API progress survives contention.'
      }),
      trioCommand([
        'progress', '--root', root, '--task', 'api-cli-task', '--event', 'review_note', '--actor', 'cli-worker', '--detail', 'CLI progress survives contention.'
      ], { writeOutput: false })
    ]);
    const successful = results.filter((result) => result.status === 'fulfilled');
    assert.ok(successful.length > 0);
    const progress = await readFile(initialized.paths.progress, 'utf8');
    if (results[0].status === 'fulfilled') assert.match(progress, /API progress survives contention\./u);
    if (results[1].status === 'fulfilled') assert.match(progress, /CLI progress survives contention\./u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
