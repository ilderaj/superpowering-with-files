import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function defaultSkillRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function includesAll(text, terms) {
  return terms.every((term) => text.includes(term));
}

export function evaluateClosureContract(fixture, output) {
  const hardFailures = [];

  if (!includesAll(output, fixture.requiredPhrases)) {
    hardFailures.push(`missing required phrases: ${fixture.requiredPhrases.join(', ')}`);
  }

  if (!/Start every loop in `Assess`|Start every loop in Assess/.test(output)) {
    hardFailures.push('contract must say every loop begins in Assess');
  }

  if (!/15-minute cadence|15-minute/.test(output)) {
    hardFailures.push('contract must include the 15-minute re-check cadence');
  }

  const pass = hardFailures.length === 0;

  return {
    id: fixture.id,
    title: fixture.title,
    pass,
    notes: hardFailures
  };
}

export async function evaluateAutonomousReleaseClosureFixtures(skillRoot = defaultSkillRoot()) {
  const fixturesDir = path.join(skillRoot, 'fixtures');
  const outputsDir = path.join(skillRoot, 'outputs');
  const fixtureNames = (await readdir(fixturesDir)).filter((name) => name.endsWith('.json')).sort();

  const results = [];
  for (const fixtureName of fixtureNames) {
    const fixture = JSON.parse(await readFile(path.join(fixturesDir, fixtureName), 'utf8'));
    const output = await readFile(path.join(outputsDir, `${fixture.id}.md`), 'utf8');
    results.push(evaluateClosureContract(fixture, output));
  }

  return {
    summary: {
      total: results.length,
      passed: results.filter((result) => result.pass).length,
      failed: results.filter((result) => !result.pass).length
    },
    results
  };
}

export function formatAutonomousReleaseClosureReport(report) {
  const lines = [];
  lines.push(
    `Autonomous Release Closure Eval: ${report.summary.passed}/${report.summary.total} fixtures passed`
  );
  lines.push('');

  for (const result of report.results) {
    lines.push(`${result.pass ? 'PASS' : 'FAIL'} ${result.id}`);
    for (const note of result.notes) {
      lines.push(`  - ${note}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
