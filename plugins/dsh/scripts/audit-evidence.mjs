#!/usr/bin/env node
// Hostless evidence audit CLI (Slice 3, plan item 3).
//
// Runs the same evidence audit as /swf audit against a packet's evidence
// directory on disk, without a dsh host. Requires a build first: the audit
// logic lives in src/evidenceAudit.ts and is imported from dist/.
//
// Usage: node scripts/audit-evidence.mjs <task-id> <authorityRoot> [plugin-root]
// Exit 0 = audit ok; exit 1 = violations found (fail-closed).

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export function pluginRootOf(override) {
  return resolve(override ?? dirname(fileURLToPath(import.meta.url)), '..');
}

export async function main(argv = process.argv.slice(2)) {
  const [taskId, authorityRoot, pluginRootOverride] = argv;
  if (!taskId || !authorityRoot) {
    console.error('Usage: node scripts/audit-evidence.mjs <task-id> <authorityRoot> [plugin-root]');
    return 2;
  }
  const root = pluginRootOf(pluginRootOverride);
  let audit;
  try {
    audit = await import(join(root, 'dist', 'evidenceAudit.js'));
  } catch (error) {
    console.error('dist/evidenceAudit.js not found - run pnpm build first (' + error.message + ')');
    return 2;
  }
  const result = await audit.auditEvidenceDirectory(authorityRoot, taskId);
  if (result.ok) {
    console.log('evidence audit ok: ' + result.files + ' evidence file(s), ' + result.taskId + ' (' + result.authorityRoot + ')');
    return 0;
  }
  console.error('evidence audit FAILED (fail-closed):');
  for (const violation of result.violations) {
    console.error(' - [' + violation.file + '] ' + violation.rule + ': ' + violation.detail);
  }
  return 1;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  process.exitCode = await main();
}

