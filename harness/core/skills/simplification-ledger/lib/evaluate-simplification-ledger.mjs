import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_SECTIONS = ['## Scenario', '## Ledger', '## Summary'];

function defaultSkillRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function findMissing(text, terms) {
  return terms.filter((term) => !text.includes(term));
}

function countRows(text) {
  return [...text.matchAll(/^- line:\s+\d+\s+\|\s+simplification:\s+.+\|\s+ceiling:\s+.+\|\s+upgrade trigger:\s+.+$/gm)].length;
}

export function evaluateOutput(fixture, output) {
  const notes = [];
  const missingSections = findMissing(output, REQUIRED_SECTIONS);
  if (missingSections.length > 0) {
    notes.push(`missing required sections: ${missingSections.join(', ')}`);
  }

  const rowCount = countRows(output);
  if (rowCount !== fixture.expectedRows) {
    notes.push(`expected ${fixture.expectedRows} ledger rows, got ${rowCount}`);
  }

  if (!output.includes('Read-only ledger report.')) {
    notes.push('summary must keep the report explicitly read-only');
  }

  if (/rewrite markers|installer command|new runtime|modify files/i.test(output)) {
    notes.push('output must not widen into rewrite or runtime guidance');
  }

  if (fixture.expectNoMatches) {
    if (!output.includes('No simplification markers found.')) {
      notes.push('no-match fixture must say `No simplification markers found.`');
    }
  } else {
    for (const field of ['file:', 'line:', 'simplification:', 'ceiling:', 'upgrade trigger:']) {
      if (!output.includes(field)) {
        notes.push(`missing ledger field: ${field}`);
      }
    }
  }

  if (fixture.requireNoTrigger && !output.includes('upgrade trigger: no-trigger')) {
    notes.push('missing-trigger fixture must surface `upgrade trigger: no-trigger`');
  }

  return {
    id: fixture.id,
    title: fixture.title,
    pass: notes.length === 0,
    rowCount,
    notes
  };
}

export async function evaluateSimplificationLedgerFixtures(skillRoot = defaultSkillRoot()) {
  const fixturesDir = path.join(skillRoot, 'fixtures');
  const outputsDir = path.join(skillRoot, 'outputs');
  const fixtureNames = (await readdir(fixturesDir)).filter((name) => name.endsWith('.json')).sort();

  const results = [];
  for (const fixtureName of fixtureNames) {
    const fixture = JSON.parse(await readFile(path.join(fixturesDir, fixtureName), 'utf8'));
    const output = await readFile(path.join(outputsDir, `${fixture.id}.md`), 'utf8');
    results.push(evaluateOutput(fixture, output));
  }

  const summary = {
    total: results.length,
    passed: results.filter((result) => result.pass).length,
    failed: results.filter((result) => !result.pass).length
  };

  return { summary, results };
}

export function formatSimplificationLedgerReport(report) {
  const lines = [];
  lines.push(
    `Simplification Ledger Eval: ${report.summary.passed}/${report.summary.total} fixtures passed`
  );
  lines.push('');

  for (const result of report.results) {
    lines.push(`${result.pass ? 'PASS' : 'FAIL'} ${result.id} | rows=${result.rowCount}`);
    for (const note of result.notes) {
      lines.push(`- ${note}`);
    }
    if (result.notes.length === 0) {
      lines.push('- ok');
    }
  }

  return `${lines.join('\n')}\n`;
}
