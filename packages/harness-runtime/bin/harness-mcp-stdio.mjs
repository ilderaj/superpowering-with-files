#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { runtimePackageRoot } from '../src/index.mjs';

const serverPath = path.join(runtimePackageRoot, 'harness/mcp/stdio.mjs');
const result = spawnSync(process.execPath, [serverPath, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: 'inherit'
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
