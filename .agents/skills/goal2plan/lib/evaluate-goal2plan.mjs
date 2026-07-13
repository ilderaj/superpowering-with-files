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

function hasNumericTarget(text) {
  return /\b\d+(?:\.\d+)?\b/.test(text);
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
  const hardFailures = [];
  const fencedPrompt = extractFencedPrompt(prompt);
  const innerPrompt = fencedPrompt ?? prompt.trim();
  const sections = extractSections(innerPrompt);
  const objective = sections.get('Objective') ?? '';
  const constraints = sections.get('Constraints') ?? '';
  const workDiscipline = sections.get('Work Discipline') ?? '';
  const validation = sections.get('Validation') ?? '';
  const doneCriteria = sections.get('Done Criteria') ?? '';
  const stopEscalate = sections.get('Stop/Escalate') ?? '';
  const nextStep = sections.get('Next Step') ?? '';
  const missingSections = SECTION_LABELS.filter((label) => !sections.get(label));
  const promptLength = innerPrompt.length;

  maybeAdd(hardFailures, fencedPrompt !== null, 'response must be exactly one markdown fenced block');
  maybeAdd(hardFailures, innerPrompt.startsWith('/goal'), 'inner prompt must start with `/goal`');
  maybeAdd(hardFailures, promptLength <= 4000, `prompt exceeds 4000 characters (${promptLength})`);
  maybeAdd(hardFailures, missingSections.length === 0, `missing sections: ${missingSections.join(', ')}`);
  maybeAdd(hardFailures, sectionOrderIsValid(innerPrompt), 'section labels must appear in the required order');
  maybeAdd(
    hardFailures,
    /reviewed implementation plan/i.test(objective),
    'Objective must produce a reviewed implementation plan'
  );
  maybeAdd(
    hardFailures,
    /do not execute implementation/i.test(innerPrompt),
    'prompt must explicitly say not to execute implementation'
  );
  maybeAdd(
    hardFailures,
    /native Codex `?\/goal`?/i.test(innerPrompt) || /native \/goal/i.test(innerPrompt),
    'prompt must mention a native Codex `/goal` flow'
  );
  maybeAdd(
    hardFailures,
    /do not implement a runner|do not build an external runner/i.test(innerPrompt),
    'prompt must say it does not implement a runner or external runner'
  );
  maybeAdd(
    hardFailures,
    /intake sufficiency|missing intake dimensions|intake gaps|missing intake/i.test(innerPrompt),
    'prompt must inspect intake sufficiency or missing intake dimensions before drafting the plan'
  );
  maybeAdd(
    hardFailures,
    /fallback|reclassify|direct or tracked execution|straightforward enough/i.test(innerPrompt),
    'prompt must explain how Goal2Plan stops and falls back when the task proves simpler than expected'
  );
  maybeAdd(
    hardFailures,
    /checkpoint/i.test(workDiscipline) && (/progress\.md/i.test(workDiscipline) || /progress log/i.test(workDiscipline)),
    'prompt must define checkpoints and a short progress log for the planning loop'
  );
  maybeAdd(
    hardFailures,
    /test seam/i.test(innerPrompt) &&
      /tracer-bullet vertical slice/i.test(innerPrompt) &&
      /blocking edges/i.test(innerPrompt) &&
      /Standards\/Spec review split/i.test(innerPrompt) &&
      /not `?tickets\.md`?/i.test(innerPrompt),
    'prompt must include the SWF coding intake contract without making tickets.md authoritative'
  );
  maybeAdd(
    hardFailures,
    constraints.includes('planning/active/<task-id>/') || workDiscipline.includes('planning/active/<task-id>/'),
    'prompt must preserve `planning/active/<task-id>/` as authoritative memory'
  );
  maybeAdd(
    hardFailures,
    innerPrompt.includes('docs/superpowers/plans/<date>-<task-id>.md'),
    'prompt must mention the companion-plan path'
  );
  maybeAdd(
    hardFailures,
    /`?1`?\s+read-only reviewer subagent/i.test(innerPrompt),
    'prompt must require `1` read-only reviewer subagent'
  );
  maybeAdd(
    hardFailures,
    /`?3`?[- ]round cap|`?3`? planning cycles|`?3`? review rounds/i.test(innerPrompt),
    'prompt must include a `3`-round planning cap'
  );
  maybeAdd(hardFailures, hasNumericTarget(doneCriteria), 'Done Criteria must include at least one numeric target');
  maybeAdd(hardFailures, validation.length > 0, 'Validation section must be non-empty');
  maybeAdd(hardFailures, stopEscalate.length > 0, 'Stop/Escalate section must be non-empty');
  maybeAdd(hardFailures, nextStep.length > 0, 'Next Step section must be non-empty');

  if (fixture.requiredPhrases?.length) {
    maybeAdd(
      hardFailures,
      includesAll(innerPrompt, fixture.requiredPhrases),
      `prompt is missing required phrases: ${fixture.requiredPhrases.join(', ')}`
    );
  }

  let score = 0;
  if (fencedPrompt !== null && innerPrompt.startsWith('/goal') && missingSections.length === 0 && sectionOrderIsValid(innerPrompt)) score += 2;
  if (/reviewed implementation plan/i.test(objective) && /do not execute implementation/i.test(innerPrompt)) score += 2;
  if (
    (constraints.includes('planning/active/<task-id>/') || workDiscipline.includes('planning/active/<task-id>/'))
    && innerPrompt.includes('docs/superpowers/plans/<date>-<task-id>.md')
  ) {
    score += 2;
  }
  if (
    /`?1`?\s+read-only reviewer subagent/i.test(innerPrompt)
    && /`?3`?/.test(stopEscalate + doneCriteria + workDiscipline)
    && /intake sufficiency|missing intake dimensions|intake gaps|missing intake/i.test(innerPrompt)
    && /fallback|reclassify|direct or tracked execution|straightforward enough/i.test(innerPrompt)
    && /checkpoint/i.test(workDiscipline)
    && (/progress\.md/i.test(workDiscipline) || /progress log/i.test(workDiscipline))
  ) {
    score += 2;
  }
  if (hasNumericTarget(doneCriteria) && validation.length > 0 && stopEscalate.length > 0 && nextStep.length > 0) score += 2;

  const pass = hardFailures.length === 0 && score >= 9;

  return {
    id: fixture.id,
    title: fixture.title,
    length: promptLength,
    usesFencedBlock: fencedPrompt !== null,
    hasNumericTarget: hasNumericTarget(doneCriteria),
    missingSections,
    hardFailures,
    score,
    pass,
    notes: pass ? [] : hardFailures
  };
}

export async function evaluateGoal2PlanFixtures(skillRoot = defaultSkillRoot()) {
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

  return {
    summary: {
      total: results.length,
      passed: results.filter((result) => result.pass).length,
      failed: results.filter((result) => !result.pass).length,
      maxLength: Math.max(...results.map((result) => result.length)),
      minScore: Math.min(...results.map((result) => result.score))
    },
    results
  };
}

export function formatGoal2PlanReport(report) {
  const lines = [];
  lines.push(`Goal2Plan Eval: ${report.summary.passed}/${report.summary.total} fixtures passed`);
  lines.push(`Max prompt length: ${report.summary.maxLength}`);
  lines.push(`Lowest score: ${report.summary.minScore}/10`);
  lines.push('');

  for (const result of report.results) {
    lines.push(`${result.pass ? 'PASS' : 'FAIL'} ${result.id} (${result.score}/10, len=${result.length})`);
    for (const note of result.notes) {
      lines.push(`  - ${note}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
