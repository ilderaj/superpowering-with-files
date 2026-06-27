import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SECTION_LABELS = [
  'Objective',
  'Context',
  'Constraints',
  'Work Discipline',
  'Validation',
  'Done Criteria',
  'Stop/Escalate',
  'Next Step'
];

function defaultSkillRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function extractFencedPrompt(markdown) {
  const trimmed = markdown.trim();
  const match = trimmed.match(/^```(?:text|md|markdown)?\n([\s\S]*?)\n```$/);
  if (!match) {
    return null;
  }
  return match[1].trim();
}

function extractSections(prompt) {
  const sections = new Map();

  for (let index = 0; index < SECTION_LABELS.length; index += 1) {
    const label = SECTION_LABELS[index];
    const pattern =
      label === 'Objective'
        ? /(?:^\/goal\s+|^|\n)Objective:/m
        : new RegExp(`(?:^|\\n)${label}:`, 'm');
    const match = pattern.exec(prompt);
    if (!match) {
      sections.set(label, null);
      continue;
    }

    const start = match.index + match[0].length;
    const remaining = prompt.slice(start);
    const nextLabels = SECTION_LABELS.slice(index + 1)
      .map((nextLabel) => `\\n${nextLabel}:`)
      .join('|');
    const nextPattern = nextLabels ? new RegExp(nextLabels, 'm') : null;
    const nextMatch = nextPattern ? nextPattern.exec(remaining) : null;
    const end = nextMatch ? start + nextMatch.index : prompt.length;
    sections.set(label, prompt.slice(start, end).trim());
  }

  return sections;
}

function includesAll(text, terms) {
  const normalizedText = text.replaceAll('`', '');
  return terms.every((term) => normalizedText.includes(term.replaceAll('`', '')));
}

function hasNumericTarget(doneCriteria) {
  return /\b\d+(?:\.\d+)?\b/.test(doneCriteria);
}

function hasConcreteValidationProof(validation) {
  const normalizedValidation = validation.replaceAll('`', '');
  return (
    /\b(?:npm|pnpm|node|uv|python|pytest|cargo|go|git|gh|rg|fd|bun|deno|xcodebuild|swift|make|docker)\b(?:[ \t]+[^\n]+)?/.test(
      normalizedValidation
    )
    || /(?:^|[\s(])(?:[A-Za-z0-9_.<>{}-]+\/)*[A-Za-z0-9_.<>{}-]+\.(?:md|mjs|ts|js|json|yml|yaml|py)\b/.test(
      normalizedValidation
    )
  );
}

function maybeAdd(notes, condition, message) {
  if (!condition) {
    notes.push(message);
  }
}

function sectionOrderIsValid(prompt) {
  let lastIndex = -1;
  for (const label of SECTION_LABELS) {
    const index =
      label === 'Objective'
        ? prompt.search(/(?:^\/goal\s+|^|\n)Objective:/m)
        : prompt.indexOf(`${label}:`);
    if (index === -1 || index < lastIndex) {
      return false;
    }
    lastIndex = index;
  }
  return true;
}

export function evaluatePrompt(fixture, prompt) {
  const notes = [];
  const fencedPrompt = extractFencedPrompt(prompt);
  const innerPrompt = fencedPrompt ?? prompt;
  const sections = extractSections(innerPrompt);
  const doneCriteria = sections.get('Done Criteria') ?? '';
  const workDiscipline = sections.get('Work Discipline') ?? '';
  const validation = sections.get('Validation') ?? '';
  const stopEscalate = sections.get('Stop/Escalate') ?? '';
  const nextStep = sections.get('Next Step') ?? '';
  const promptLength = innerPrompt.length;
  const missingSections = SECTION_LABELS.filter((label) => !sections.get(label));
  const hardFailures = [];

  maybeAdd(hardFailures, fencedPrompt !== null, 'response must be exactly one markdown fenced block');
  maybeAdd(hardFailures, innerPrompt.startsWith('/goal'), 'inner prompt must start with `/goal`');
  maybeAdd(hardFailures, promptLength <= 4000, `prompt exceeds 4000 characters (${promptLength})`);
  if (typeof fixture.maxLength === 'number') {
    maybeAdd(hardFailures, promptLength <= fixture.maxLength, `prompt exceeds fixture maxLength (${fixture.maxLength})`);
  }
  maybeAdd(hardFailures, missingSections.length === 0, `missing sections: ${missingSections.join(', ')}`);
  maybeAdd(hardFailures, sectionOrderIsValid(innerPrompt), 'section labels must appear in the required order');
  maybeAdd(hardFailures, hasNumericTarget(doneCriteria), 'Done Criteria must include at least one numeric target');
  maybeAdd(
    hardFailures,
    workDiscipline.includes('planning/active/<task-id>/'),
    'Work Discipline must preserve `planning/active/<task-id>/` as authoritative memory'
  );
  maybeAdd(
    hardFailures,
    includesAll(workDiscipline, ['quick', 'tracked', 'deep-reasoning']),
    'Work Discipline must mention quick, tracked, and deep-reasoning routing'
  );
  maybeAdd(
    hardFailures,
    workDiscipline.includes('docs/superpowers/plans/<date>-<task-id>.md')
      && /(reviewer|verifier)/i.test(workDiscipline)
      && /deep-reasoning[\s\S]{0,240}(reviewer|verifier)|(reviewer|verifier)[\s\S]{0,240}deep-reasoning/i.test(
        workDiscipline
      ),
    'Work Discipline must limit companion-plan/verifier behavior to deep-reasoning rounds'
  );
  maybeAdd(hardFailures, validation.length > 0, 'Validation section must be non-empty');
  maybeAdd(
    hardFailures,
    hasConcreteValidationProof(validation),
    'Validation must name at least one concrete command or authoritative evidence surface'
  );
  maybeAdd(hardFailures, stopEscalate.length > 0, 'Stop/Escalate section must be non-empty');
  maybeAdd(hardFailures, nextStep.length > 0, 'Next Step section must be non-empty');

  if (fixture.requireAssumptions) {
    maybeAdd(hardFailures, innerPrompt.includes('Assumptions:'), 'fixture requires explicit assumptions');
  }

  if (fixture.requireInferredMetricLabel) {
    maybeAdd(
      hardFailures,
      /Inferred acceptance metric/i.test(innerPrompt),
      'fixture requires an `Inferred acceptance metric` label'
    );
  }

  if (fixture.mustStayLightweight) {
    maybeAdd(
      hardFailures,
      /do not create a companion plan or subagents/i.test(innerPrompt),
      'quick fixture must explicitly keep quick rounds lightweight'
    );
  }

  if (fixture.requireDeepArtifacts) {
    maybeAdd(
      hardFailures,
      innerPrompt.includes('docs/superpowers/plans/<date>-<task-id>.md') && /`?3`? verifier rounds/.test(innerPrompt),
      'deep-reasoning fixture must mention companion-plan path and verifier-round cap'
    );
  }

  if (fixture.expectedFocusTerms?.length) {
    maybeAdd(
      hardFailures,
      includesAll(innerPrompt, fixture.expectedFocusTerms),
      `prompt is missing expected focus terms: ${fixture.expectedFocusTerms.join(', ')}`
    );
  }

  let score = 0;

  if (fencedPrompt !== null && innerPrompt.startsWith('/goal') && missingSections.length === 0 && sectionOrderIsValid(innerPrompt)) score += 2;
  if (hasNumericTarget(doneCriteria) && (!fixture.requireInferredMetricLabel || /Inferred acceptance metric/i.test(prompt))) score += 2;
  if (
    workDiscipline.includes('planning/active/<task-id>/')
    && includesAll(workDiscipline, ['quick', 'tracked', 'deep-reasoning'])
    && /goal drift/i.test(innerPrompt)
  ) {
    score += 2;
  }
  if (typeof fixture.maxLength === 'number' ? promptLength <= fixture.maxLength : promptLength < 2000) score += 1;
  if (/goal drift/i.test(innerPrompt)) score += 1;
  if (hasConcreteValidationProof(validation)) score += 1;
  if (/stop|ask|escalate/i.test(stopEscalate)) score += 1;
  if (nextStep.length > 0) score += 1;

  const pass = hardFailures.length === 0 && score >= 9;
  const notesOut = pass ? [] : [...hardFailures, ...notes];

  return {
    id: fixture.id,
    title: fixture.title,
    category: fixture.category,
    expectedRoute: fixture.expectedRoute,
    length: promptLength,
    usesFencedBlock: fencedPrompt !== null,
    score,
    pass,
    hasNumericTarget: hasNumericTarget(doneCriteria),
    missingSections,
    hardFailures,
    notes: notesOut
  };
}

export async function evaluateGoalWriterFixtures(skillRoot = defaultSkillRoot()) {
  const fixturesDir = path.join(skillRoot, 'fixtures');
  const outputsDir = path.join(skillRoot, 'outputs');
  const fixtureNames = (await readdir(fixturesDir))
    .filter((name) => name.endsWith('.json'))
    .sort();

  const results = [];

  for (const fixtureName of fixtureNames) {
    const fixture = JSON.parse(await readFile(path.join(fixturesDir, fixtureName), 'utf8'));
    const prompt = await readFile(path.join(outputsDir, `${fixture.id}.goal.md`), 'utf8');
    results.push(evaluatePrompt(fixture, prompt));
  }

  const summary = {
    total: results.length,
    passed: results.filter((result) => result.pass).length,
    failed: results.filter((result) => !result.pass).length,
    maxLength: Math.max(...results.map((result) => result.length)),
    minScore: Math.min(...results.map((result) => result.score))
  };

  return { summary, results };
}

export function formatGoalWriterReport(report) {
  const lines = [];
  lines.push(`Goal Writer Eval: ${report.summary.passed}/${report.summary.total} fixtures passed`);
  lines.push(`Max prompt length: ${report.summary.maxLength}`);
  lines.push(`Lowest score: ${report.summary.minScore}/10`);
  lines.push('');

  for (const result of report.results) {
    lines.push(
      `${result.pass ? 'PASS' : 'FAIL'} ${result.id} | ${result.score}/10 | ${result.length} chars | numeric=${result.hasNumericTarget}`
    );
    for (const note of result.notes) {
      lines.push(`- ${note}`);
    }
    if (!result.notes.length) {
      lines.push('- no actionable notes');
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
