#!/usr/bin/env node
import {
  evaluateAcceptanceRunFile,
  formatAcceptanceRunReport,
  renderAcceptanceScorecardMarkdown
} from '../lib/evaluate-acceptance-runs.mjs';

const args = process.argv.slice(2);
const markdown = args.includes('--markdown');

const report = await evaluateAcceptanceRunFile();
process.stdout.write(markdown ? renderAcceptanceScorecardMarkdown(report) : formatAcceptanceRunReport(report));

if (!report.pass) {
  process.exitCode = 1;
}
