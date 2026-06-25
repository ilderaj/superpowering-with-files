import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_SECTIONS = ['## Scenario', '## Decision Ladder', '## Recommendation', '## Guardrails'];
const LADDER_LABELS = [
  '1. no work / less work:',
  '2. stdlib:',
  '3. native:',
  '4. installed dependencies:',
  '5. smallest working diff:'
];

function defaultEvalRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function findMissing(text, terms) {
  return terms.filter((term) => !text.includes(term));
}

function sectionSlice(text, heading, followingHeadings) {
  const start = text.indexOf(heading);
  if (start === -1) {
    return null;
  }

  const contentStart = start + heading.length;
  const tail = text.slice(contentStart);
  const nextOffsets = followingHeadings
    .map((nextHeading) => tail.indexOf(nextHeading))
    .filter((offset) => offset >= 0);
  const end = nextOffsets.length > 0 ? contentStart + Math.min(...nextOffsets) : text.length;
  return text.slice(contentStart, end).trim();
}

function extractLine(sectionText, label) {
  if (!sectionText) {
    return null;
  }

  const match = sectionText.match(new RegExp(`^${label}\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

export function evaluateOutput(fixture, output) {
  const notes = [];
  const missingSections = findMissing(output, REQUIRED_SECTIONS);
  if (missingSections.length > 0) {
    notes.push(`missing required sections: ${missingSections.join(', ')}`);
  }

  const ladderOffsets = LADDER_LABELS.map((label) => output.indexOf(label));
  if (ladderOffsets.some((offset) => offset < 0)) {
    notes.push('missing one or more canonical ladder labels');
  } else if (ladderOffsets.some((offset, index) => index > 0 && offset <= ladderOffsets[index - 1])) {
    notes.push('ladder labels must appear in canonical order');
  }

  const recommendation = sectionSlice(output, '## Recommendation', ['## Guardrails']) ?? '';
  const guardrails = sectionSlice(output, '## Guardrails', []) ?? '';

  const decision = extractLine(recommendation, 'decision:');
  if (decision !== fixture.expectedDecision) {
    notes.push(`expected decision ${fixture.expectedDecision}, got ${decision ?? 'missing'}`);
  }

  const winningStep = extractLine(recommendation, 'winning step:');
  if (winningStep !== fixture.expectedWinningStep) {
    notes.push(`expected winning step ${fixture.expectedWinningStep}, got ${winningStep ?? 'missing'}`);
  }

  const reject = extractLine(recommendation, 'reject:');
  if (!reject || !reject.includes(fixture.mustReject)) {
    notes.push(`reject line must explicitly reject ${fixture.mustReject}`);
  }

  for (const phrase of fixture.requiredPhrases ?? []) {
    if (!output.toLowerCase().includes(String(phrase).toLowerCase())) {
      notes.push(`missing required phrase: ${phrase}`);
    }
  }

  if (fixture.guardrailRequired) {
    if (!/keep validation/i.test(guardrails)) {
      notes.push('guardrail fixture must explicitly keep validation');
    }
    if (!/trust-boundary/i.test(guardrails)) {
      notes.push('guardrail fixture must explicitly keep trust-boundary protection');
    }
    if (!/not a working simplification/i.test(output)) {
      notes.push('guardrail fixture must say the unsafe shortcut is not a working simplification');
    }
  }

  return {
    id: fixture.id,
    title: fixture.title,
    pass: notes.length === 0,
    decision,
    winningStep,
    notes
  };
}

export async function evaluateSimplicityLadderFixtures(evalRoot = defaultEvalRoot()) {
  const fixturesDir = path.join(evalRoot, 'simplicity-ladder-fixtures');
  const outputsDir = path.join(evalRoot, 'simplicity-ladder-outputs');
  const fixtureNames = (await readdir(fixturesDir)).filter((name) => name.endsWith('.json')).sort();

  const results = [];
  for (const fixtureName of fixtureNames) {
    const fixture = JSON.parse(await readFile(path.join(fixturesDir, fixtureName), 'utf8'));
    const output = await readFile(path.join(outputsDir, `${fixture.id}.md`), 'utf8');
    results.push(evaluateOutput(fixture, output));
  }

  const coveredWinningSteps = [...new Set(results.map((result) => result.winningStep))].sort();
  const summary = {
    total: results.length,
    passed: results.filter((result) => result.pass).length,
    failed: results.filter((result) => !result.pass).length,
    coveredWinningSteps
  };

  return { summary, results };
}

export function formatSimplicityLadderReport(report) {
  const lines = [];
  lines.push(`Simplicity Ladder Eval: ${report.summary.passed}/${report.summary.total} fixtures passed`);
  lines.push(`Winning steps covered: ${report.summary.coveredWinningSteps.join(', ')}`);
  lines.push('');

  for (const result of report.results) {
    lines.push(
      `${result.pass ? 'PASS' : 'FAIL'} ${result.id} | decision=${result.decision ?? 'missing'} | winning-step=${result.winningStep ?? 'missing'}`
    );
    for (const note of result.notes) {
      lines.push(`- ${note}`);
    }
    if (result.notes.length === 0) {
      lines.push('- ok');
    }
  }

  return `${lines.join('\n')}\n`;
}
