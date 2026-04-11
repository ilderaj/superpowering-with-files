import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readState } from '../lib/state.mjs';

export async function verify() {
  const rootDir = process.cwd();
  const state = await readState(rootDir);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    checks: {
      stateReadable: true,
      selectedTargets: Object.keys(state.targets),
      scope: state.scope,
      projectionMode: state.projectionMode
    }
  };

  const dir = path.join(rootDir, 'reports/verification');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(dir, 'latest.md'), [
    '# Harness Verification Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Scope: ${report.checks.scope}`,
    `Projection mode: ${report.checks.projectionMode}`,
    `Targets: ${report.checks.selectedTargets.join(', ') || 'none'}`
  ].join('\n') + '\n');

  console.log('Verification report written to reports/verification/latest.md');
}
