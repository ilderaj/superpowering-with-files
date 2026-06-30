import os from 'node:os';
import path from 'node:path';
import { readHarnessHealth } from '../installer/lib/health.mjs';
import { readState } from '../installer/lib/state.mjs';
import { resolveHarnessRoot } from './root-policy.mjs';
import { sanitizeText } from './redaction.mjs';

export const VERIFY_PROOF_SURFACE = 'repo-verification';
export const VERIFY_COMMANDS = [
  'npm run verify:all',
  './scripts/harness verify --output=.harness/verification'
];

function resolveVerificationOutputPath(rootDir, explicitOutputPath) {
  if (!explicitOutputPath) {
    return path.join(rootDir, '.harness/verification/latest.md');
  }

  return path.isAbsolute(explicitOutputPath)
    ? path.join(explicitOutputPath, 'latest.md')
    : path.join(rootDir, explicitOutputPath, 'latest.md');
}

function renderMarkdown(report) {
  const context = report.health?.context;
  const lines = [
    '# Harness Verification Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Scope: ${report.checks.scope}`,
    `Projection mode: ${report.checks.projectionMode}`,
    `Targets: ${report.checks.selectedTargets.join(', ') || 'none'}`,
    '',
    `Context entry verdict: ${context?.summary?.entries?.verdict ?? 'unknown'}`,
    `Hook payload verdict: ${context?.summary?.hooks?.verdict ?? 'unknown'}`,
    `Planning hot context verdict: ${context?.summary?.planning?.verdict ?? 'unknown'}`,
    `Skill profile verdict: ${context?.summary?.skillProfiles?.verdict ?? 'unknown'}`
  ];
  return `${lines.join('\n')}\n`;
}

export async function runHarnessVerify(input = {}) {
  const resolved = await resolveHarnessRoot(input.root, input);
  const state = await readState(resolved.rootDir);
  const health = await readHarnessHealth(resolved.rootDir, input.homeDir ?? os.homedir());
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    checks: {
      stateReadable: true,
      selectedTargets: Object.keys(state.targets),
      scope: state.scope,
      projectionMode: state.projectionMode
    },
    health
  };

  return {
    rootDir: resolved.rootDir,
    report,
    markdown: sanitizeText(renderMarkdown(report), input),
    outputPath: resolveVerificationOutputPath(resolved.rootDir, input.outputPath),
    proofSurface: VERIFY_PROOF_SURFACE,
    commands: [...VERIFY_COMMANDS]
  };
}
