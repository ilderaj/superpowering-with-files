import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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

async function treePaths(root) {
  const result = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      const relative = path.relative(root, target).split(path.sep).join('/');
      result.push(relative);
      if (entry.isDirectory()) await visit(target);
    }
  }
  await visit(root);
  return result.sort();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function statIdentity(targetPath) {
  const info = await lstat(targetPath, { bigint: true });
  return Object.freeze({ dev: info.dev, ino: info.ino, nlink: info.nlink });
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

async function runStoreFaultProbe(label, source) {
  const probeRoot = await mkdtemp(path.join(os.tmpdir(), `trio-store-${label}-`));
  const probePath = path.join(probeRoot, `${label}.test.mjs`);
  try {
    await writeFile(probePath, source, 'utf8');
    return await runNodeTest(['--experimental-test-module-mocks', '--test', probePath]);
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

test('atomicWriteText preserves old bytes on interruption and cleans same-directory temporary files', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-store-atomic-');
  try {
    const target = path.join(root, 'state.md');
    const oldBytes = Buffer.from('old bytes\n');
    await writeFile(target, oldBytes);

    await assert.rejects(
      () => store.atomicWriteText(target, 'new bytes\n', { signal: AbortSignal.abort() }),
      /abort|interrupt/i
    );
    assert.deepEqual(await readFile(target), oldBytes);
    assert.deepEqual(await readdir(root), ['state.md']);

    await assert.rejects(
      () => store.atomicWriteText(target, 'drifted bytes\n', { expectedSha256: '0'.repeat(64) }),
      /drift|sha-?256|expected/i
    );
    assert.deepEqual(await readFile(target), oldBytes);
    assert.deepEqual(await readdir(root), ['state.md']);

    await store.atomicWriteText(target, 'new bytes\n', { expectedSha256: sha256(oldBytes) });
    assert.equal(await readFile(target, 'utf8'), 'new bytes\n');
    assert.deepEqual(await readdir(root), ['state.md']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function conditionalCreateProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const statIdentity = async (targetPath) => {
  const info = await realFs.lstat(targetPath, { bigint: true });
  return { dev: info.dev, ino: info.ino, nlink: info.nlink };
};
const identity = async (targetPath) => {
  return { ...await statIdentity(targetPath), bytes: await realFs.readFile(targetPath) };
};
const identityOrMissing = async (targetPath) => {
  try {
    return await identity(targetPath);
  } catch (error) {
    return { missing: error?.code === 'ENOENT', code: error?.code };
  }
};

test('public conditional create preserves a foreign link-time create without rename fallback', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-store-create-link-')));
  try {
    const target = path.join(root, 'state.json');
    const foreignBytes = Buffer.from('foreign state bytes\\n');
    const expectedParentIdentity = await statIdentity(root);
    let injectionCount = 0;
    let finalRenameCount = 0;
    let foreign;
    const faultingLink = async (sourcePath, targetPath) => {
      if (path.resolve(targetPath) === target && path.basename(sourcePath).startsWith('.state.json.')) {
        injectionCount += 1;
        await realFs.writeFile(target, foreignBytes);
        foreign = await identity(target);
      }
      return realFs.link(sourcePath, targetPath);
    };
    const faultingRename = async (sourcePath, targetPath) => {
      if (path.resolve(targetPath) === target && path.basename(sourcePath).startsWith('.state.json.')) {
        finalRenameCount += 1;
        const error = new Error('rename fallback is forbidden for conditional create');
        error.code = 'ERR_TEST_RENAME_FALLBACK';
        throw error;
      }
      return realFs.rename(sourcePath, targetPath);
    };
    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, link: faultingLink, rename: faultingRename }
    });
    const store = await import(STORE_URL);
    let failure;
    try {
      await store.atomicWriteText(target, 'Trio state bytes\\n', {
        expectedSha256: null,
        expectedParentIdentity
      });
    } catch (error) {
      failure = error;
    }
    assert.deepEqual(
      {
        code: failure?.code,
        injectionCount,
        finalRenameCount,
        foreign,
        actual: await identityOrMissing(target)
      },
      {
        code: 'ERR_TRIO_CREATE_CONFLICT',
        injectionCount: 1,
        finalRenameCount: 0,
        foreign,
        actual: foreign
      }
    );
    assert.equal(foreign.bytes.equals(foreignBytes), true);
    assert.equal(hash(foreign.bytes), hash(foreignBytes));
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

function sameContentReplacementProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const statIdentity = async (targetPath) => {
  const info = await realFs.lstat(targetPath, { bigint: true });
  return { dev: info.dev, ino: info.ino, nlink: info.nlink };
};
const identity = async (targetPath) => {
  return { ...await statIdentity(targetPath), bytes: await realFs.readFile(targetPath) };
};

test('public conditional replacement rejects a same-content foreign inode', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-store-same-content-')));
  try {
    const target = path.join(root, 'state.json');
    const held = path.join(root, 'held-state.json');
    const oldBytes = Buffer.from('same state bytes\\n');
    await realFs.writeFile(target, oldBytes);
    const original = await identity(target);
    const expectedParentIdentity = await statIdentity(root);
    let foreign;
    let injectionCount = 0;
    const faultingOpen = async (targetPath, flags, ...rest) => {
      const handle = await realFs.open(targetPath, flags, ...rest);
      if (flags !== 'wx' || path.dirname(path.resolve(targetPath)) !== root || !path.basename(targetPath).startsWith('.state.json.')) {
        return handle;
      }
      return {
        writeFile: (...args) => handle.writeFile(...args),
        sync: async (...args) => {
          await handle.sync(...args);
          if (injectionCount === 0) {
            injectionCount += 1;
            await realFs.rename(target, held);
            await realFs.writeFile(target, oldBytes);
            foreign = await identity(target);
          }
        },
        close: (...args) => handle.close(...args)
      };
    };
    await t.mock.module('node:fs/promises', { namedExports: { ...realFs, open: faultingOpen } });
    const store = await import(STORE_URL);
    let failure;
    try {
      await store.atomicWriteText(target, 'Trio replacement bytes\\n', {
        expectedSha256: hash(oldBytes),
        expectedTargetIdentity: {
          dev: original.dev,
          ino: original.ino,
          nlink: original.nlink
        },
        expectedParentIdentity
      });
    } catch (error) {
      failure = error;
    }
    const actual = await identity(target);
    assert.deepEqual(
      {
        code: failure?.code,
        injectionCount,
        sameContent: hash(actual.bytes) === hash(oldBytes),
        original,
        foreign,
        actual
      },
      {
        code: 'ERR_TRIO_TARGET_IDENTITY',
        injectionCount: 1,
        sameContent: true,
        original,
        foreign,
        actual: foreign
      }
    );
    assert.notDeepEqual(foreign, original);
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

function stableParentReplacementProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const statIdentity = async (targetPath) => {
  const info = await realFs.lstat(targetPath, { bigint: true });
  return { dev: info.dev, ino: info.ino, nlink: info.nlink };
};
const identity = async (targetPath) => {
  return { ...await statIdentity(targetPath), bytes: await realFs.readFile(targetPath) };
};

test('public conditional publication rejects a stable real parent replacement before the final check', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-store-parent-replacement-')));
  try {
    const parent = path.join(root, 'managed');
    const displaced = path.join(root, 'managed-displaced');
    const outside = path.join(root, 'outside');
    const target = path.join(parent, 'state.json');
    const replacementTarget = path.join(parent, 'state.json');
    const displacedTarget = path.join(displaced, 'state.json');
    const outsideTarget = path.join(outside, 'sentinel.txt');
    const oldBytes = Buffer.from('old managed bytes\\n');
    const replacementBytes = Buffer.from('replacement parent bytes\\n');
    const outsideBytes = Buffer.from('outside sentinel bytes\\n');
    await Promise.all([realFs.mkdir(parent), realFs.mkdir(outside)]);
    await Promise.all([realFs.writeFile(target, oldBytes), realFs.writeFile(outsideTarget, outsideBytes)]);
    const originalTarget = await identity(target);
    const originalParent = await statIdentity(parent);
    let replacementParent;
    let replacementTargetIdentity;
    let injectionCount = 0;
    const faultingOpen = async (targetPath, flags, ...rest) => {
      const handle = await realFs.open(targetPath, flags, ...rest);
      if (flags !== 'wx' || path.dirname(path.resolve(targetPath)) !== parent || !path.basename(targetPath).startsWith('.state.json.')) {
        return handle;
      }
      return {
        writeFile: (...args) => handle.writeFile(...args),
        sync: async (...args) => {
          await handle.sync(...args);
          if (injectionCount === 0) {
            injectionCount += 1;
            await realFs.rename(parent, displaced);
            await realFs.mkdir(parent);
            await realFs.writeFile(replacementTarget, replacementBytes);
            replacementParent = await statIdentity(parent);
            replacementTargetIdentity = await identity(replacementTarget);
          }
        },
        close: (...args) => handle.close(...args)
      };
    };
    await t.mock.module('node:fs/promises', { namedExports: { ...realFs, open: faultingOpen } });
    const store = await import(STORE_URL);
    let failure;
    try {
      await store.atomicWriteText(target, 'new managed bytes\\n', {
        expectedSha256: hash(oldBytes),
        expectedTargetIdentity: {
          dev: originalTarget.dev,
          ino: originalTarget.ino,
          nlink: originalTarget.nlink
        },
        expectedParentIdentity: originalParent
      });
    } catch (error) {
      failure = error;
    }
    assert.deepEqual(
      {
        code: failure?.code,
        injectionCount,
        parentChanged: originalParent.ino !== replacementParent?.ino,
        displaced: await identity(displacedTarget),
        replacement: await identity(replacementTarget),
        outside: await realFs.readFile(outsideTarget)
      },
      {
        code: 'ERR_TRIO_PARENT_IDENTITY',
        injectionCount: 1,
        parentChanged: true,
        displaced: originalTarget,
        replacement: replacementTargetIdentity,
        outside: outsideBytes
      }
    );
    assert.deepEqual(await realFs.readFile(displacedTarget), oldBytes);
    assert.deepEqual(await realFs.readFile(replacementTarget), replacementBytes);
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

function postPublicationReceiptProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const statIdentity = async (targetPath) => {
  const info = await realFs.lstat(targetPath, { bigint: true });
  return { dev: info.dev, ino: info.ino, nlink: info.nlink };
};
const identity = async (targetPath) => {
  return statIdentity(targetPath);
};

test('public conditional publication exposes an exact receipt after parent fsync failure', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-store-post-publication-')));
  try {
    const target = path.join(root, 'state.json');
    const oldBytes = Buffer.from('old bytes\\n');
    const nextText = 'published bytes\\n';
    await realFs.writeFile(target, oldBytes);
    const expectedTargetIdentity = await identity(target);
    const expectedParentIdentity = await statIdentity(root);
    let injectionCount = 0;
    let published;
    const faultingOpen = async (targetPath, flags, ...rest) => {
      if (flags === 'r' && path.resolve(targetPath) === root) {
        published = await identity(target);
        injectionCount += 1;
        const error = new Error('injected parent directory fsync failure after publication');
        error.code = 'EIO';
        throw error;
      }
      return realFs.open(targetPath, flags, ...rest);
    };
    await t.mock.module('node:fs/promises', { namedExports: { ...realFs, open: faultingOpen } });
    const store = await import(STORE_URL);
    let failure;
    try {
      await store.atomicWriteText(target, nextText, {
        expectedSha256: hash(oldBytes),
        expectedTargetIdentity,
        expectedParentIdentity
      });
    } catch (error) {
      failure = error;
    }
    const actual = await identity(target);
    assert.deepEqual(
      {
        code: failure?.code,
        causeCode: failure?.cause?.code,
        injectionCount,
        bytes: await realFs.readFile(target, 'utf8'),
        receipt: failure?.publication,
        actual
      },
      {
        code: 'ERR_TRIO_DIRECTORY_SYNC',
        causeCode: 'EIO',
        injectionCount: 1,
        bytes: nextText,
        receipt: { path: target, sha256: hash(Buffer.from(nextText, 'utf8')), ...published },
        actual: published
      }
    );
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

function linkReceiptRegistrationProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const statIdentity = async (targetPath) => {
  const info = await realFs.lstat(targetPath, { bigint: true });
  return { dev: info.dev, ino: info.ino, nlink: info.nlink };
};
const identity = async (targetPath) => ({ ...await statIdentity(targetPath), bytes: await realFs.readFile(targetPath) });
const receiptFor = (targetPath, bytes, identityValue) => ({ path: targetPath, sha256: hash(bytes), ...identityValue });

test('public conditional create registers its receipt before the first post-link fallible observation', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-store-link-receipt-')));
  try {
    const target = path.join(root, 'state.json');
    const nextBytes = Buffer.from('created bytes\\n');
    const expectedParentIdentity = await statIdentity(root);
    let linkCount = 0;
    let lstatFaultCount = 0;
    let failPostLinkLstat = false;
    let published;
    const faultingLink = async (sourcePath, targetPath) => {
      if (path.resolve(targetPath) === target && path.basename(sourcePath).startsWith('.state.json.')) {
        linkCount += 1;
        await realFs.link(sourcePath, targetPath);
        published = await statIdentity(target);
        failPostLinkLstat = true;
        return;
      }
      return realFs.link(sourcePath, targetPath);
    };
    const faultingLstat = async (targetPath, ...rest) => {
      if (failPostLinkLstat && path.resolve(targetPath) === target) {
        failPostLinkLstat = false;
        lstatFaultCount += 1;
        const error = new Error('injected first post-link observation failure');
        error.code = 'E_TEST_POST_LINK_LSTAT';
        throw error;
      }
      return realFs.lstat(targetPath, ...rest);
    };
    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, link: faultingLink, lstat: faultingLstat }
    });
    const store = await import(STORE_URL);
    let failure;
    try {
      await store.atomicWriteText(target, nextBytes.toString('utf8'), {
        expectedSha256: null,
        expectedParentIdentity
      });
    } catch (error) {
      failure = error;
    }
    const after = await identity(target);
    const { bytes: afterBytes, ...afterIdentity } = after;
    assert.deepEqual(
      {
        code: failure?.code,
        causeCode: failure?.cause?.code,
        linkCount,
        lstatFaultCount,
        receipt: failure?.publication,
        afterBytes
      },
      {
        code: 'ERR_TRIO_IO',
        causeCode: 'E_TEST_POST_LINK_LSTAT',
        linkCount: 1,
        lstatFaultCount: 1,
        receipt: receiptFor(target, nextBytes, afterIdentity),
        afterBytes: nextBytes
      }
    );
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

function ambiguousPublicationProbeSource(storeUrl, mode) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const MODE = ${JSON.stringify(mode)};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const statIdentity = async (targetPath) => {
  const info = await realFs.lstat(targetPath, { bigint: true });
  return { dev: info.dev, ino: info.ino, nlink: info.nlink };
};
const receiptFor = (targetPath, bytes, identityValue) => ({ path: targetPath, sha256: hash(bytes), ...identityValue });

test('public atomic writer reports a proven ambiguous publication without replacing foreign state', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-store-ambiguous-publication-')));
  try {
    const target = path.join(root, 'state.json');
    const nextBytes = Buffer.from('published bytes\\n');
    const oldBytes = Buffer.from('old bytes\\n');
    if (MODE === 'rename') await realFs.writeFile(target, oldBytes);
    const expectedParentIdentity = await statIdentity(root);
    const expectedTargetIdentity = MODE === 'rename' ? await statIdentity(target) : undefined;
    let injectionCount = 0;
    let published;
    const faultingLink = async (sourcePath, targetPath) => {
      if (MODE === 'link' && path.resolve(targetPath) === target && path.basename(sourcePath).startsWith('.state.json.')) {
        injectionCount += 1;
        await realFs.link(sourcePath, targetPath);
        published = await statIdentity(target);
        const error = new Error('injected real link then throw');
        error.code = 'E_TEST_LINK_AMBIGUOUS';
        throw error;
      }
      return realFs.link(sourcePath, targetPath);
    };
    const faultingRename = async (sourcePath, targetPath) => {
      if (MODE === 'rename' && path.resolve(targetPath) === target && path.basename(sourcePath).startsWith('.state.json.')) {
        injectionCount += 1;
        await realFs.rename(sourcePath, targetPath);
        published = await statIdentity(target);
        const error = new Error('injected real rename then throw');
        error.code = 'E_TEST_RENAME_AMBIGUOUS';
        throw error;
      }
      return realFs.rename(sourcePath, targetPath);
    };
    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, link: faultingLink, rename: faultingRename }
    });
    const store = await import(STORE_URL);
    let failure;
    try {
      await store.atomicWriteText(target, nextBytes.toString('utf8'), MODE === 'link'
        ? { expectedSha256: null, expectedParentIdentity }
        : { expectedSha256: hash(oldBytes), expectedTargetIdentity, expectedParentIdentity });
    } catch (error) {
      failure = error;
    }
    const settledIdentity = await statIdentity(target);
    assert.deepEqual(
      {
        code: failure?.code,
        causeCode: failure?.cause?.code,
        injectionCount,
        receipt: failure?.publication,
        bytes: await realFs.readFile(target)
      },
      {
        code: 'ERR_TRIO_ATOMIC_WRITE',
        causeCode: MODE === 'link' ? 'E_TEST_LINK_AMBIGUOUS' : 'E_TEST_RENAME_AMBIGUOUS',
        injectionCount: 1,
        receipt: receiptFor(target, nextBytes, settledIdentity),
        bytes: nextBytes
      }
    );
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

function dualFailurePublicationProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const PRIMARY_CODE = 'E_TEST_AMBIGUOUS_PRIMARY';
const CLEANUP_CODE = 'E_TEST_TEMP_CLEANUP';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const statIdentity = async (targetPath) => {
  const info = await realFs.lstat(targetPath, { bigint: true });
  return { dev: info.dev, ino: info.ino, nlink: info.nlink };
};
const receiptFor = (targetPath, bytes, identityValue) => ({ path: targetPath, sha256: hash(bytes), ...identityValue });
function reachableCodes(error, seen = new Set(), codes = new Set()) {
  if (!error || typeof error !== 'object' || seen.has(error)) return codes;
  seen.add(error);
  if (typeof error.code === 'string') codes.add(error.code);
  reachableCodes(error.cause, seen, codes);
  reachableCodes(error.cleanupError, seen, codes);
  reachableCodes(error.releaseError, seen, codes);
  for (const nested of error.errors ?? []) reachableCodes(nested, seen, codes);
  return codes;
}

test('public atomic writer retains a proven publication receipt when primary and temp cleanup both fail', async (t) => {
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-store-dual-publication-failure-')));
  try {
    const target = path.join(root, 'state.json');
    const nextBytes = Buffer.from('published bytes\\n');
    const expectedParentIdentity = await statIdentity(root);
    let primaryCount = 0;
    let cleanupCount = 0;
    let published;
    const faultingLink = async (sourcePath, targetPath) => {
      if (path.resolve(targetPath) === target && path.basename(sourcePath).startsWith('.state.json.')) {
        primaryCount += 1;
        await realFs.link(sourcePath, targetPath);
        published = await statIdentity(target);
        const error = new Error('injected link publication failure');
        error.code = PRIMARY_CODE;
        throw error;
      }
      return realFs.link(sourcePath, targetPath);
    };
    const faultingUnlink = async (targetPath) => {
      if (path.dirname(path.resolve(targetPath)) === root && path.basename(targetPath).startsWith('.state.json.')) {
        cleanupCount += 1;
        const error = new Error('injected temporary cleanup failure');
        error.code = CLEANUP_CODE;
        throw error;
      }
      return realFs.unlink(targetPath);
    };
    await t.mock.module('node:fs/promises', {
      namedExports: { ...realFs, link: faultingLink, unlink: faultingUnlink }
    });
    const store = await import(STORE_URL);
    let failure;
    try {
      await store.atomicWriteText(target, nextBytes.toString('utf8'), {
        expectedSha256: null,
        expectedParentIdentity
      });
    } catch (error) {
      failure = error;
    }
    const codes = [...reachableCodes(failure)].sort();
    assert.deepEqual(
      {
        primaryCount,
        cleanupCount,
        hasPrimary: codes.includes(PRIMARY_CODE),
        hasCleanup: codes.includes(CLEANUP_CODE),
        receipt: failure?.publication,
        bytes: await realFs.readFile(target)
      },
      {
        primaryCount: 1,
        cleanupCount: 1,
        hasPrimary: true,
        hasCleanup: true,
        receipt: receiptFor(target, nextBytes, published),
        bytes: nextBytes
      }
    );
  } finally {
    await realFs.rm(root, { recursive: true, force: true });
  }
});
`;
}

function lockReleaseDualFailureProbeSource(storeUrl) {
  return `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_URL = ${JSON.stringify(storeUrl)};
const PRIMARY_CODE = 'E_TEST_LOCK_OPERATION_PRIMARY';
const FROZEN_CODE = 'E_TEST_LOCK_OPERATION_FROZEN';
const RELEASE_CODE = 'E_TEST_LOCK_RELEASE_RENAME';
const RELEASE_WRAPPER_CODE = 'ERR_TRIO_LOCK_CLEANUP';
const COMPOSITE_NAME = 'TrioOperationReleaseError';
const COMPOSITE_CODE = 'ERR_TRIO_OPERATION_RELEASE';
const TRUTHY_PRIMITIVE_PRIMARY = 42;
const FALSY_PRIMITIVE_PRIMARY = 0;
function graphContains(value, target, seen = new Set()) {
  if (Object.is(value, target)) return true;
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return graphContains(value.cause, target, seen)
    || graphContains(value.operationError, target, seen)
    || graphContains(value.releaseError, target, seen)
    || [...(value.errors ?? [])].some((nested) => graphContains(nested, target, seen));
}

test('public publication lock retains mutable, frozen, and primitive operation failures with release failure', async (t) => {
  let releaseRenameCount = 0;
  let releaseLockPath;
  let releaseFailure;
  const faultingRename = async (sourcePath, targetPath) => {
    if (path.basename(sourcePath).startsWith('swf-trio-v2-lock-') && path.basename(targetPath).includes('.release-')) {
      releaseRenameCount += 1;
      releaseLockPath = sourcePath;
      releaseFailure = new Error('injected publication lock release rename failure');
      releaseFailure.code = RELEASE_CODE;
      throw releaseFailure;
    }
    return realFs.rename(sourcePath, targetPath);
  };
  await t.mock.module('node:fs/promises', { namedExports: { ...realFs, rename: faultingRename } });
  const store = await import(STORE_URL);
  const cases = [
    {
      label: 'mutable Error',
      mutable: true,
      primary() {
        const error = new Error('injected mutable operation failure');
        error.code = PRIMARY_CODE;
        return error;
      }
    },
    {
      label: 'Object.freeze(Error)',
      mutable: false,
      primary() {
        const error = new Error('injected frozen operation failure');
        error.code = FROZEN_CODE;
        return Object.freeze(error);
      }
    },
    {
      label: 'truthy primitive primary',
      mutable: false,
      primary() {
        return TRUTHY_PRIMITIVE_PRIMARY;
      }
    },
    {
      label: 'falsy primitive primary',
      mutable: false,
      primary() {
        return FALSY_PRIMITIVE_PRIMARY;
      }
    }
  ];

  for (const item of cases) {
    await t.test(item.label, async () => {
      const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'trio-store-lock-release-dual-')));
      const primary = item.primary();
      const renameCountBefore = releaseRenameCount;
      releaseLockPath = undefined;
      releaseFailure = undefined;
      let failure;
      try {
        await store.withTrioPublicationLock(root, async () => {
          throw primary;
        });
      } catch (error) {
        failure = error;
      }
      try {
        assert.equal(releaseRenameCount, renameCountBefore + 1, item.label);
        assert.ok(releaseFailure, item.label);
        assert.equal(typeof releaseLockPath, 'string', item.label);
        if (item.mutable) {
          assert.deepEqual(
            {
              topLevelIsPrimary: failure === primary,
              topLevelCode: failure?.code,
              releaseErrorCode: failure?.releaseError?.code,
              releaseCauseIsExact: failure?.releaseError?.cause === releaseFailure,
              primaryReachable: graphContains(failure, primary),
              releaseReachable: graphContains(failure, releaseFailure)
            },
            {
              topLevelIsPrimary: true,
              topLevelCode: PRIMARY_CODE,
              releaseErrorCode: RELEASE_WRAPPER_CODE,
              releaseCauseIsExact: true,
              primaryReachable: true,
              releaseReachable: true
            },
            item.label
          );
          return;
        }
        assert.deepEqual(
          {
            name: failure?.name,
            code: failure?.code,
            aggregate: failure instanceof AggregateError,
            typeError: failure instanceof TypeError,
            causeIsPrimary: Object.is(failure?.cause, primary),
            operationErrorIsPrimary: Object.is(failure?.operationError, primary),
            releaseErrorCode: failure?.releaseError?.code,
            releaseCauseIsExact: failure?.releaseError?.cause === releaseFailure,
            errorsAreExact: Array.isArray(failure?.errors)
              && failure.errors.length === 2
              && Object.is(failure.errors[0], primary)
              && failure.errors[1] === failure.releaseError,
            primaryReachable: graphContains(failure, primary),
            releaseReachable: graphContains(failure, releaseFailure)
          },
          {
            name: COMPOSITE_NAME,
            code: COMPOSITE_CODE,
            aggregate: true,
            typeError: false,
            causeIsPrimary: true,
            operationErrorIsPrimary: true,
            releaseErrorCode: RELEASE_WRAPPER_CODE,
            releaseCauseIsExact: true,
            errorsAreExact: true,
            primaryReachable: true,
            releaseReachable: true
          },
          item.label
        );
      } finally {
        if (releaseLockPath) await realFs.rm(releaseLockPath, { recursive: true, force: true });
        await realFs.rm(root, { recursive: true, force: true });
      }
    });
  }
});
`;
}

function assertFaultProbePassed(result) {
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
}

test('atomicWriteText conditionally creates only an absent target and retains a foreign link-time create', async () => {
  assertFaultProbePassed(await runStoreFaultProbe(
    'conditional-create',
    conditionalCreateProbeSource(new URL('../../harness/trio/core/store.mjs', import.meta.url).href)
  ));
});

test('atomicWriteText rejects a same-content foreign inode replacement before publication', async () => {
  assertFaultProbePassed(await runStoreFaultProbe(
    'same-content-replacement',
    sameContentReplacementProbeSource(new URL('../../harness/trio/core/store.mjs', import.meta.url).href)
  ));
});

test('atomicWriteText rejects a stable real parent replacement before final identity check without outside mutation', async () => {
  assertFaultProbePassed(await runStoreFaultProbe(
    'stable-parent-replacement',
    stableParentReplacementProbeSource(new URL('../../harness/trio/core/store.mjs', import.meta.url).href)
  ));
});

test('atomicWriteText attaches an exact publication receipt after parent directory fsync failure', async () => {
  assertFaultProbePassed(await runStoreFaultProbe(
    'post-publication-receipt',
    postPublicationReceiptProbeSource(new URL('../../harness/trio/core/store.mjs', import.meta.url).href)
  ));
});

test('atomicWriteText registers a create-only receipt before a post-link observation can fail', async () => {
  assertFaultProbePassed(await runStoreFaultProbe(
    'link-receipt-registration',
    linkReceiptRegistrationProbeSource(new URL('../../harness/trio/core/store.mjs', import.meta.url).href)
  ));
});

test('atomicWriteText reports a proven ambiguous hard-link publication', async () => {
  assertFaultProbePassed(await runStoreFaultProbe(
    'ambiguous-link-publication',
    ambiguousPublicationProbeSource(new URL('../../harness/trio/core/store.mjs', import.meta.url).href, 'link')
  ));
});

test('atomicWriteText reports a proven ambiguous rename publication', async () => {
  assertFaultProbePassed(await runStoreFaultProbe(
    'ambiguous-rename-publication',
    ambiguousPublicationProbeSource(new URL('../../harness/trio/core/store.mjs', import.meta.url).href, 'rename')
  ));
});

test('atomicWriteText retains its primary error and receipt when temporary cleanup also fails', async () => {
  assertFaultProbePassed(await runStoreFaultProbe(
    'dual-publication-failure',
    dualFailurePublicationProbeSource(new URL('../../harness/trio/core/store.mjs', import.meta.url).href)
  ));
});

test('withTrioPublicationLock keeps a primary operation failure and a release failure observable', async () => {
  assertFaultProbePassed(await runStoreFaultProbe(
    'lock-release-dual-failure',
    lockReleaseDualFailureProbeSource(new URL('../../harness/trio/core/store.mjs', import.meta.url).href)
  ));
});

test('atomicWriteText rejects inherited, incomplete, or extra identity evidence without mutation', async () => {
  const store = await requireStore();
  const cases = [
    {
      label: 'inherited target dev',
      build({ target }) {
        return {
          expectedTargetIdentity: Object.assign(Object.create({ dev: target.dev }), {
            ino: target.ino,
            nlink: target.nlink
          })
        };
      }
    },
    {
      label: 'extra target field',
      build({ target }) {
        return { expectedTargetIdentity: { ...target, extra: true } };
      }
    },
    {
      label: 'inherited parent ino',
      build({ parent }) {
        return {
          expectedParentIdentity: Object.assign(Object.create({ ino: parent.ino }), {
            dev: parent.dev,
            nlink: parent.nlink
          })
        };
      }
    },
    {
      label: 'extra parent field',
      build({ parent }) {
        return { expectedParentIdentity: { ...parent, extra: true } };
      }
    }
  ];
  for (const item of cases) {
    const root = await createRoot('trio-store-invalid-identity-');
    try {
      const targetPath = path.join(root, 'state.json');
      const oldBytes = Buffer.from('old bytes\n');
      await writeFile(targetPath, oldBytes);
      const target = await statIdentity(targetPath);
      const parent = await statIdentity(root);
      await assert.rejects(
        () => store.atomicWriteText(targetPath, 'new bytes\n', {
          expectedSha256: sha256(oldBytes),
          expectedTargetIdentity: target,
          expectedParentIdentity: parent,
          ...item.build({ target, parent })
        }),
        (error) => error?.code === 'ERR_TRIO_INVALID_IDENTITY',
        item.label
      );
      assert.deepEqual(await readFile(targetPath), oldBytes, item.label);
      assert.deepEqual(await statIdentity(targetPath), target, item.label);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('a residual authority publication lock times out without target mutation or automatic cleanup', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-store-publication-lock-residue-');
  let lockPath;
  try {
    const target = path.join(root, 'state.json');
    const oldBytes = Buffer.from('old bytes\n');
    await writeFile(target, oldBytes);
    const storeUrl = new URL('../../harness/trio/core/store.mjs', import.meta.url).href;
    const childResult = await runNodeTest(['--input-type=module', '--eval', [
      `import { acquireTrioPublicationLock } from ${JSON.stringify(storeUrl)};`,
      "import { lstat, readFile } from 'node:fs/promises';",
      "import path from 'node:path';",
      `const lock = await acquireTrioPublicationLock(${JSON.stringify(root)});`,
      'const info = await lstat(lock.path, { bigint: true });',
      "const owner = await readFile(path.join(lock.path, '.trio-lock-owner'));",
      "process.stdout.write(JSON.stringify({ path: lock.path, dev: info.dev.toString(), ino: info.ino.toString(), nlink: info.nlink.toString(), owner: owner.toString('base64') }));"
    ].join('\n')]);
    assert.equal(childResult.code, 0, childResult.stderr);
    const childLock = JSON.parse(childResult.stdout);
    lockPath = childLock.path;
    const lockBefore = await statIdentity(lockPath);
    const ownerBefore = await readFile(path.join(lockPath, '.trio-lock-owner'));
    assert.deepEqual(lockBefore, {
      dev: BigInt(childLock.dev),
      ino: BigInt(childLock.ino),
      nlink: BigInt(childLock.nlink)
    });
    assert.equal(ownerBefore.toString('base64'), childLock.owner);

    await assert.rejects(
      () => store.withTrioPublicationLock(root, async () => {
        await store.atomicWriteText(target, 'new bytes\n', { expectedSha256: sha256(oldBytes) });
      }),
      (error) => error?.code === 'ERR_TRIO_LOCK_TIMEOUT' && /Timed out waiting/u.test(error.message)
    );
    assert.deepEqual(await readFile(target), oldBytes);
    assert.deepEqual(await statIdentity(lockPath), lockBefore);
    assert.deepEqual(await readFile(path.join(lockPath, '.trio-lock-owner')), ownerBefore);

    await rm(lockPath, { recursive: true, force: true });
    lockPath = undefined;
  } finally {
    if (lockPath) await rm(lockPath, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test('initializeTrioTask creates exactly the three authority files and rejects partial or unsafe state', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-store-init-');
  const partialRoot = await createRoot('trio-store-partial-');
  const symlinkRoot = await createRoot('trio-store-symlink-');
  const outsideRoot = await createRoot('trio-store-outside-');
  try {
    const result = await store.initializeTrioTask(root, 'wave2-task', 'Build the durable Trio write path.');
    const expectedFiles = [
      'planning/active/wave2-task/findings.md',
      'planning/active/wave2-task/progress.md',
      'planning/active/wave2-task/task_plan.md'
    ];
    const actualFiles = (await treePaths(root)).filter((entry) => entry.endsWith('.md'));
    assert.deepEqual(actualFiles, expectedFiles);
    assert.equal(await readFile(result.paths.taskPlan, 'utf8').then((value) => /Goal: Build the durable Trio write path\./u.test(value)), true);
    assert.match(await readFile(result.paths.taskPlan, 'utf8'), /^Status: active$/mu);
    assert.match(await readFile(result.paths.taskPlan, 'utf8'), /^Archive Eligible: no$/mu);
    await assert.rejects(
      () => store.initializeTrioTask(root, 'wave2-task', 'Duplicate task.'),
      /already|exist|partial/i
    );
    await assert.rejects(
      () => store.initializeTrioTask(root, '../escape', 'Traversal.'),
      /invalid|traversal|task id/i
    );

    const partialTask = path.join(partialRoot, 'planning', 'active', 'partial-task');
    await mkdir(partialTask, { recursive: true });
    await writeFile(path.join(partialTask, 'task_plan.md'), 'partial\n');
    await assert.rejects(
      () => store.initializeTrioTask(partialRoot, 'partial-task', 'Do not replace partial state.'),
      /already|exist|partial/i
    );
    assert.equal(await readFile(path.join(partialTask, 'task_plan.md'), 'utf8'), 'partial\n');

    await mkdir(path.join(outsideRoot, 'planning', 'active'), { recursive: true });
    await symlink(path.join(outsideRoot, 'planning'), path.join(symlinkRoot, 'planning'));
    await assert.rejects(
      () => store.initializeTrioTask(symlinkRoot, 'linked-task', 'Reject the planning symlink.'),
      /symlink|boundary/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(partialRoot, { recursive: true, force: true });
    await rm(symlinkRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test('initializeTrioTask persists replacement-token syntax in the goal literally', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-store-literal-goal-');
  try {
    const literalGoal = 'Keep $& literal.';
    const initialized = await store.initializeTrioTask(root, 'literal-goal-task', literalGoal);
    const taskPlan = await readFile(initialized.paths.taskPlan, 'utf8');

    assert.match(taskPlan, /^Goal: Keep \$& literal\.$/mu);
    assert.doesNotMatch(taskPlan, /\{\{goal\}\}/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('appendProgressEvent validates event fields, preserves other Trio bytes, and appends chronological records', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-store-progress-');
  try {
    const initialized = await store.initializeTrioTask(root, 'progress-task', 'Record durable progress.');
    const taskPlanBefore = await readFile(initialized.paths.taskPlan);
    const findingsBefore = await readFile(initialized.paths.findings);

    await store.appendProgressEvent(root, 'progress-task', {
      event: 'worker_done',
      actor: 'worker-1',
      detail: 'Implementation candidate is ready.',
      timestamp: '2026-08-02T15:00:00.000Z'
    });
    await store.appendProgressEvent(root, 'progress-task', {
      event: 'review_note',
      actor: 'chief',
      detail: 'Evidence is ready for the acceptance gate.',
      timestamp: '2026-08-02T15:00:01.000Z'
    });

    const progress = await readFile(initialized.paths.progress, 'utf8');
    assert.ok(progress.indexOf('Event: worker_done') < progress.indexOf('Event: review_note'));
    assert.match(progress, /Timestamp: 2026-08-02T15:00:00\.000Z/u);
    assert.match(progress, /Actor: worker-1/u);
    assert.match(progress, /Detail: Evidence is ready for the acceptance gate\./u);
    assert.deepEqual(await readFile(initialized.paths.taskPlan), taskPlanBefore);
    assert.deepEqual(await readFile(initialized.paths.findings), findingsBefore);

    for (const invalid of [
      { event: '', actor: 'worker', detail: 'detail' },
      { event: 'event', actor: '   ', detail: 'detail' },
      { event: 'event', actor: 'worker', detail: '   ' }
    ]) {
      await assert.rejects(
        () => store.appendProgressEvent(root, 'progress-task', invalid),
        /event|actor|detail|non-empty/i
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('concurrent progress updates preserve every successful event and strictly order generated timestamps', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-store-concurrent-progress-');
  try {
    const initialized = await store.initializeTrioTask(root, 'concurrent-task', 'Serialize concurrent progress updates.');
    const details = [
      'Concurrent detail one.',
      'Concurrent detail two.',
      'Concurrent detail three.',
      'Concurrent detail four.'
    ];
    const results = await Promise.allSettled(details.map((detail, index) => store.appendProgressEvent(root, 'concurrent-task', {
      event: 'review_note',
      actor: `worker-${index + 1}`,
      detail
    })));
    const successful = results.filter((result) => result.status === 'fulfilled');
    assert.ok(successful.length > 0, 'At least one contending progress operation must succeed.');

    const progress = await readFile(initialized.paths.progress, 'utf8');
    for (const result of successful) {
      assert.match(progress, new RegExp(`Detail: ${result.value.detail.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, 'u'));
    }
    assert.equal((progress.match(/^Event: review_note$/gmu) ?? []).length, successful.length);

    const timestamps = [...progress.matchAll(/^Timestamp:\s*(.+)$/gmu)].map((match) => Date.parse(match[1]));
    for (let index = 1; index < timestamps.length; index += 1) {
      assert.ok(timestamps[index] > timestamps[index - 1], 'Generated progress timestamps must strictly increase.');
    }
    assert.equal((await treePaths(root)).some((entry) => /lock|staging|cache|session|sidecar/u.test(entry)), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('appendProgressEvent rejects a reversed historical chronology without changing progress bytes', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-store-reversed-chronology-');
  try {
    const initialized = await store.initializeTrioTask(root, 'chronology-task', 'Reject reversed history.');
    const historicalProgress = [
      '# Progress',
      '',
      'Event: review_note',
      'Timestamp: 2026-08-03T02:00:00.000Z',
      'Actor: chief',
      'Detail: Later event.',
      '',
      'Event: review_note',
      'Timestamp: 2026-08-03T01:00:00.000Z',
      'Actor: chief',
      'Detail: Earlier event after later event.',
      ''
    ].join('\n');
    await writeFile(initialized.paths.progress, historicalProgress, 'utf8');
    const before = await readFile(initialized.paths.progress);

    await assert.rejects(
      () => store.appendProgressEvent(root, 'chronology-task', {
        event: 'review_note',
        actor: 'worker-1',
        detail: 'Must not append to reversed history.'
      }),
      (error) => error?.code === 'ERR_TRIO_CHRONOLOGY'
    );
    assert.deepEqual(await readFile(initialized.paths.progress), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a replaced transient task lock is retained when its original owner releases it', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-store-lock-ownership-');
  let replacementPath;
  let displacedPath;
  try {
    const lock = await store.acquireTrioTaskLock(root, 'lock-ownership-task');
    replacementPath = lock.path;
    displacedPath = `${lock.path}.displaced-${process.pid}`;
    assert.equal((await readdir(lock.path)).length, 1);
    await rename(lock.path, displacedPath);
    await mkdir(lock.path, { mode: 0o700 });

    await assert.rejects(
      () => lock.release(),
      (error) => error?.code === 'ERR_TRIO_LOCK_OWNERSHIP'
    );
    assert.deepEqual(await readdir(lock.path), []);
  } finally {
    if (replacementPath) await rm(replacementPath, { recursive: true, force: true });
    if (displacedPath) await rm(displacedPath, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test('concurrent initialization leaves one exact Trio and no authority-root staging residue', async () => {
  const store = await requireStore();
  const root = await createRoot('trio-store-concurrent-init-');
  try {
    const results = await Promise.allSettled([
      store.initializeTrioTask(root, 'init-race-task', 'First concurrent initialization.'),
      store.initializeTrioTask(root, 'init-race-task', 'Second concurrent initialization.')
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.deepEqual(await treePaths(root), [
      'planning',
      'planning/active',
      'planning/active/init-race-task',
      'planning/active/init-race-task/findings.md',
      'planning/active/init-race-task/progress.md',
      'planning/active/init-race-task/task_plan.md'
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
