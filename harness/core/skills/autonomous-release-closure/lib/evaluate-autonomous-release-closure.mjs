import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_OUTPUT_SECTIONS = ['## Scenario', '## Expected Decisions', '## Required Evidence'];
const REQUIRED_CONTRACT_SCENARIOS = [
  'stacked promotion chain',
  'disjoint PR ambiguity',
  'finishing handoff',
  'loop budget / fallback',
  'rereview waiting control'
];

const CONTRACT_ARTIFACTS = [
  {
    id: 'SKILL.md',
    pathParts: ['SKILL.md'],
    requiredSections: [
      '## Outcome Contract',
      '## Trigger Model',
      '## Best Fit Scenarios',
      '## Bridge From `finishing-a-development-branch`',
      '## Multi-PR Target Resolution',
      '## Loop Budget And Termination',
      '## Fallback / Spillover Rule',
      '## Workflow',
      '## Stage Contracts'
    ],
    requiredPhrases: [
      'does **not** provide an auto-trigger',
      'leaf or work PR -> candidate or integration branch PR -> trunk PR',
      '10 full loops',
      '2 hours of wall-clock time',
      'partial-success',
      'closure loop',
      'does not mean each closure loop lasts 15 minutes',
      'whichever happens first',
      'not complete just because `@codex review` was posted',
      'next_reassess_due_at'
    ],
    scenarioChecks: {
      'stacked promotion chain': [
        '## Multi-PR Target Resolution',
        'leaf or work PR -> candidate or integration branch PR -> trunk PR'
      ],
      'disjoint PR ambiguity': [
        '## Multi-PR Target Resolution',
        'multiple disjoint chains',
        'blocked-with-evidence'
      ],
      'finishing handoff': [
        '## Bridge From `finishing-a-development-branch`',
        'Hand off to `autonomous-release-closure` after finishing succeeds'
      ],
      'loop budget / fallback': [
        '## Loop Budget And Termination',
        '10 full loops',
        '## Fallback / Spillover Rule',
        'does not mean each closure loop lasts 15 minutes'
      ],
      'rereview waiting control': [
        '### `ReReview`',
        'whichever happens first',
        'not complete just because `@codex review` was posted',
        'next_reassess_due_at'
      ]
    }
  },
  {
    id: 'template.md',
    pathParts: ['template.md'],
    requiredSections: [
      '## Loop Skeleton',
      '## Loop Budget',
      '## Review Polling Cadence',
      '## Waiting-State Record',
      '## Terminal States',
      '## Hard Stops',
      '## Finishing Handoff'
    ],
    requiredPhrases: [
      'continue here only when unattended closure work is still required',
      'if multiple disjoint chains remain, stop at `blocked-with-evidence`',
      '10 full loops',
      '2 hours wall-clock',
      '3 consecutive same-class blockers',
      'the `closure loop`',
      'does not mean each closure loop lasts 15 minutes',
      'whichever happens first',
      'not complete when `@codex review` is merely posted',
      'next_reassess_due_at'
    ],
    scenarioChecks: {
      'stacked promotion chain': ['prove exactly one promotion chain'],
      'disjoint PR ambiguity': ['multiple disjoint chains remain'],
      'finishing handoff': ['continue here only when unattended closure work is still required'],
      'loop budget / fallback': [
        'on budget exhaustion, make a fallback decision instead of spinning',
        'does not mean each closure loop lasts 15 minutes'
      ],
      'rereview waiting control': [
        'whichever happens first',
        'not complete when `@codex review` is merely posted',
        'next_reassess_due_at'
      ]
    }
  },
  {
    id: 'examples.md',
    pathParts: ['examples.md'],
    requiredSections: [
      '# Autonomous Release Closure Examples',
      '## Example 1: Actionable review feedback loop',
      '## Example 2: Single proven stacked promotion chain',
      '## Example 3: Disjoint PR ambiguity -> `blocked-with-evidence`',
      '## Example 4: `finishing-a-development-branch` handoff after PR creation',
      '## Example 5: Merge completed but adoption follow-through still open'
    ],
    requiredPhrases: [
      'The skill does not guess which chain to merge first',
      'starts at `Assess` against the created PR',
      '`main` is treated as the default final destination, not the default immediate target',
      'it does not wait 15 minutes because no new external review result is pending yet',
      '15-minute review polling cadence',
      'whichever happens first',
      'does not mark `ReReview` complete immediately after posting `@codex review`',
      'next_reassess_due_at'
    ],
    scenarioChecks: {
      'stacked promotion chain': ['## Example 2: Single proven stacked promotion chain'],
      'disjoint PR ambiguity': ['## Example 3: Disjoint PR ambiguity -> `blocked-with-evidence`'],
      'finishing handoff': ['## Example 4: `finishing-a-development-branch` handoff after PR creation'],
      'loop budget / fallback': [
        'it does not wait 15 minutes because no new external review result is pending yet',
        '15-minute review polling cadence'
      ],
      'rereview waiting control': [
        'whichever happens first',
        'does not mark `ReReview` complete immediately after posting `@codex review`',
        'next_reassess_due_at'
      ]
    }
  }
];

function defaultSkillRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function findMissing(text, terms) {
  return terms.filter((term) => !text.includes(term));
}

function evaluateScenarioCoverage(text, scenarioChecks = {}) {
  const coveredScenarios = [];
  const missingScenarios = [];

  for (const [scenario, markers] of Object.entries(scenarioChecks)) {
    const matched = markers.every((marker) => text.includes(marker));
    if (matched) {
      coveredScenarios.push(scenario);
    } else {
      missingScenarios.push(scenario);
    }
  }

  return { coveredScenarios, missingScenarios };
}

export function evaluateClosureContract(fixture, output) {
  const hardFailures = [];
  const missingPhrases = findMissing(output, fixture.requiredPhrases);
  const requiredSections = fixture.requiredSections ?? REQUIRED_OUTPUT_SECTIONS;
  const missingSections = findMissing(output, requiredSections);

  if (missingPhrases.length > 0) {
    hardFailures.push(`missing required phrases: ${missingPhrases.join(', ')}`);
  }

  if (!/Start every closure loop in `Assess`|Start every closure loop in Assess|Start every loop in `Assess`|Start every loop in Assess/.test(output)) {
    hardFailures.push('contract must say every closure loop begins in Assess');
  }

  if (!/15-minute cadence|15-minute/.test(output)) {
    hardFailures.push('contract must include the 15-minute re-check cadence');
  }

  if (missingSections.length > 0) {
    hardFailures.push(`missing required sections: ${missingSections.join(', ')}`);
  }

  const pass = hardFailures.length === 0;

  return {
    id: fixture.id,
    title: fixture.title,
    pass,
    requiredSections,
    missingSections,
    missingPhrases,
    notes: hardFailures
  };
}

export function evaluateContractArtifacts(artifactEntries) {
  const results = artifactEntries.map((artifact) => {
    const missingSections = findMissing(artifact.text, artifact.requiredSections);
    const missingPhrases = findMissing(artifact.text, artifact.requiredPhrases ?? []);
    const { coveredScenarios, missingScenarios } = evaluateScenarioCoverage(
      artifact.text,
      artifact.scenarioChecks
    );
    const notes = [];

    if (missingSections.length > 0) {
      notes.push(`missing required sections: ${missingSections.join(', ')}`);
    }
    if (missingPhrases.length > 0) {
      notes.push(`missing required phrases: ${missingPhrases.join(', ')}`);
    }
    if (missingScenarios.length > 0) {
      notes.push(`missing scenario coverage: ${missingScenarios.join(', ')}`);
    }

    return {
      id: artifact.id,
      pass: notes.length === 0,
      requiredSections: artifact.requiredSections,
      missingSections,
      requiredPhrases: artifact.requiredPhrases ?? [],
      missingPhrases,
      coveredScenarios,
      missingScenarios,
      notes
    };
  });

  const coveredScenarios = [...new Set(results.flatMap((result) => result.coveredScenarios))].sort();
  const missingScenarios = REQUIRED_CONTRACT_SCENARIOS.filter(
    (scenario) => !coveredScenarios.includes(scenario)
  );

  return {
    requiredArtifacts: CONTRACT_ARTIFACTS.map((artifact) => artifact.id),
    requiredScenarios: REQUIRED_CONTRACT_SCENARIOS,
    passed: results.filter((result) => result.pass).length,
    failed: results.filter((result) => !result.pass).length,
    scenarioCoverage: {
      required: REQUIRED_CONTRACT_SCENARIOS,
      covered: coveredScenarios,
      missing: missingScenarios
    },
    results
  };
}

export function reportHasAutonomousReleaseClosureFailures(report) {
  return report.summary.failed > 0 || report.contract.failed > 0;
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

  const artifactEntries = await Promise.all(
    CONTRACT_ARTIFACTS.map(async (artifact) => ({
      ...artifact,
      text: await readFile(path.join(skillRoot, ...artifact.pathParts), 'utf8')
    }))
  );
  const contract = evaluateContractArtifacts(artifactEntries);

  return {
    summary: {
      total: results.length,
      passed: results.filter((result) => result.pass).length,
      failed: results.filter((result) => !result.pass).length
    },
    results,
    contract
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

  lines.push('');
  lines.push(
    `Contract Artifacts: ${report.contract.passed}/${report.contract.requiredArtifacts.length} passed`
  );
  for (const result of report.contract.results) {
    lines.push(`${result.pass ? 'PASS' : 'FAIL'} ${result.id}`);
    for (const note of result.notes) {
      lines.push(`  - ${note}`);
    }
  }
  lines.push(
    `Scenario Coverage: ${
      report.contract.scenarioCoverage.covered.length
    }/${report.contract.scenarioCoverage.required.length} covered`
  );
  if (report.contract.scenarioCoverage.missing.length > 0) {
    lines.push(`  Missing: ${report.contract.scenarioCoverage.missing.join(', ')}`);
  }

  return `${lines.join('\n')}\n`;
}
