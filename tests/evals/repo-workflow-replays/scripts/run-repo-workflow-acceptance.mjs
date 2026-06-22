#!/usr/bin/env node
import {
  formatRepoWorkflowAcceptanceReport,
  runRepoWorkflowAcceptanceReplay
} from '../lib/run-repo-workflow-acceptance.mjs';

const json = process.argv.includes('--json');
const variantArg = process.argv.find((arg) => arg.startsWith('--variant='));
const variant = variantArg ? variantArg.slice('--variant='.length) : undefined;
const report = await runRepoWorkflowAcceptanceReplay({ variant });

process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : formatRepoWorkflowAcceptanceReport(report));

if (report.summary.failed > 0) {
  process.exitCode = 1;
}
