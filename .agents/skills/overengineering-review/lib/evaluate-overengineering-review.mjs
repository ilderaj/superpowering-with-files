import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_SECTIONS = ['## Scenario', '## Findings', '## Summary'];
const SUPPORTED_TAGS = ['delete', 'stdlib', 'native', 'yagni', 'shrink'];

function defaultSkillRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function findMissing(text, terms) {
  return terms.filter((term) => !text.includes(term));
}

function finalNetLine(text) {
  const match = text.trim().match(/net: -(\d+) lines possible\.$/m);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function evaluateOutput(fixture, output) {
  const notes = [];
  const missingSections = findMissing(output, REQUIRED_SECTIONS);
  if (missingSections.length > 0) {
    notes.push(`missing required sections: ${missingSections.join(', ')}`);
  }

  const netLines = finalNetLine(output);
  if (netLines === null) {
    notes.push('missing final `net: -<N> lines possible.` line');
  }

  const tagMatches = [...output.matchAll(/^tag:\s*(delete|stdlib|native|yagni|shrink)$/gm)].map((match) => match[1]);
  const uniqueTags = [...new Set(tagMatches)];

  if (fixture.noFindings) {
    if (!output.includes('No overengineering findings in scope.')) {
      notes.push('out-of-scope fixture must say `No overengineering findings in scope.`');
    }
    if (!output.includes('belongs to normal review, not this skill')) {
      notes.push('out-of-scope fixture must redirect correctness review back to normal review');
    }
    if (tagMatches.length > 0) {
      notes.push('out-of-scope fixture must not fabricate overengineering tags');
    }
  } else {
    if (uniqueTags.length !== 1 || uniqueTags[0] !== fixture.requiredTag) {
      notes.push(`expected exactly one \`${fixture.requiredTag}\` tag`);
    }
    for (const field of ['surface:', 'change:', 'why:']) {
      if (!output.includes(field)) {
        notes.push(`missing required finding field: ${field}`);
      }
    }
  }

  const forbiddenScopeTerms = /(correctness bug|security bug|performance bug)/i;
  if (!fixture.noFindings && forbiddenScopeTerms.test(output)) {
    notes.push('actionable fixtures should stay on overengineering, not generic bug review');
  }

  if (typeof fixture.expectedLinesSaved === 'number' && netLines !== fixture.expectedLinesSaved) {
    notes.push(`expected net line savings ${fixture.expectedLinesSaved}, got ${String(netLines)}`);
  }

  return {
    id: fixture.id,
    title: fixture.title,
    pass: notes.length === 0,
    requiredTag: fixture.requiredTag ?? null,
    noFindings: fixture.noFindings === true,
    tags: uniqueTags,
    netLines,
    notes
  };
}

export async function evaluateOverengineeringReviewFixtures(skillRoot = defaultSkillRoot()) {
  const fixturesDir = path.join(skillRoot, 'fixtures');
  const outputsDir = path.join(skillRoot, 'outputs');
  const fixtureNames = (await readdir(fixturesDir)).filter((name) => name.endsWith('.json')).sort();

  const results = [];
  for (const fixtureName of fixtureNames) {
    const fixture = JSON.parse(await readFile(path.join(fixturesDir, fixtureName), 'utf8'));
    const output = await readFile(path.join(outputsDir, `${fixture.id}.md`), 'utf8');
    results.push(evaluateOutput(fixture, output));
  }

  const coveredTags = [...new Set(results.flatMap((result) => result.tags))].sort();
  const summary = {
    total: results.length,
    passed: results.filter((result) => result.pass).length,
    failed: results.filter((result) => !result.pass).length,
    coveredTags
  };

  return { summary, results };
}

export function formatOverengineeringReviewReport(report) {
  const lines = [];
  lines.push(
    `Overengineering Review Eval: ${report.summary.passed}/${report.summary.total} fixtures passed`
  );
  lines.push(`Covered tags: ${report.summary.coveredTags.join(', ')}`);
  lines.push('');

  for (const result of report.results) {
    lines.push(`${result.pass ? 'PASS' : 'FAIL'} ${result.id} | net=${result.netLines ?? 'n/a'} | tags=${result.tags.join(', ') || 'none'}`);
    for (const note of result.notes) {
      lines.push(`- ${note}`);
    }
    if (result.notes.length === 0) {
      lines.push('- ok');
    }
  }

  return `${lines.join('\n')}\n`;
}
