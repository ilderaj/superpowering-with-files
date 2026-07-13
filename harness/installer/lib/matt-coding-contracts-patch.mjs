import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MATT_TDD_PATCH_MARKER = 'Harness Matt TDD authority patch';
export const MATT_CODE_REVIEW_PATCH_MARKER = 'Harness Matt code-review authority patch';
export const MATT_DOMAIN_MODELING_PATCH_MARKER = 'Harness Matt domain-modeling authority patch';
export const MATT_DEBUG_PATCH_MARKER = 'Harness Matt debugging authority patch';
export const MATT_CODEBASE_DESIGN_PATCH_MARKER = 'Harness Matt codebase-design authority patch';
export const MATT_CODEBASE_DESIGN_SIBLING_MARKER = 'Harness Matt design-it-twice dispatch patch';
export const MATT_IMPLEMENT_PATCH_MARKER = 'Harness Matt implement authority patch';
export const MATT_RESEARCH_PATCH_MARKER = 'Harness Matt research authority patch';
export const MATT_PROTOTYPE_PATCH_MARKER = 'Harness Matt prototype authority patch';
export const MATT_ARCHITECTURE_PATCH_MARKER = 'Harness Matt architecture workflow authority patch';
export const MATT_GRILL_WITH_DOCS_PATCH_MARKER = 'Harness Matt grill-with-docs authority patch';
export const MATT_GRILLING_PATCH_MARKER = 'Harness Matt grilling authority patch';
export const MATT_WRITING_SKILLS_PATCH_MARKER = 'Harness Matt writing-skills authority patch';

function replaceRequired(original, pattern, replacement, marker, filePath) {
  if (original.includes(marker)) return original;
  if (!pattern.test(original)) {
    throw new Error(`Unable to apply ${marker} to ${filePath}`);
  }
  return original.replace(pattern, replacement);
}

async function patchSkill(targetDir, transform) {
  const filePath = path.join(targetDir, 'SKILL.md');
  const original = await readFile(filePath, 'utf8');
  await writeFile(filePath, transform(original, filePath), 'utf8');
}

async function patchFile(targetDir, relativePath, transform) {
  const filePath = path.join(targetDir, relativePath);
  const original = await readFile(filePath, 'utf8');
  await writeFile(filePath, transform(original, filePath), 'utf8');
}

export async function applyMattTddHarnessPatch(targetDir) {
  await patchSkill(targetDir, (original, filePath) => replaceRequired(
    original,
    /\*\*Test only at pre-agreed seams\.\*\*[\s\S]*?Ask: "What's the public interface, and which seams should we test\?"/,
    [
      `**${MATT_TDD_PATCH_MARKER}.**`,
      'Derive the highest practical seam from the approved spec and repository contract. Record it in the test name, fixture, or tracked progress before RED.',
      'Ask the user only when the seam would materially change behavior, architecture, risk, or authorized scope. Ordinary execution inside an approved assignment does not create a new human gate.'
    ].join('\n\n'),
    MATT_TDD_PATCH_MARKER,
    filePath
  ));
}

export async function applyMattCodeReviewHarnessPatch(targetDir) {
  await patchSkill(targetDir, (original, filePath) => {
    let next = replaceRequired(
      original,
      /Both axes run as \*\*parallel sub-agents\*\*[\s\S]*?The issue tracker should have been provided to you — run `\/setup-matt-pocock-skills` if `docs\/agents\/issue-tracker\.md` is missing\./,
      [
        `## ${MATT_CODE_REVIEW_PATCH_MARKER}`,
        '',
        'The bound user request and `planning/active/<task-id>/` trio are the primary Spec sources. A reviewed companion plan or explicit issue/PRD may be referenced, but no Matt tracker setup is required.',
        '',
        'Choose review dispatch mode from `prohibited`, `worker_discretion`, or `encouraged`. When child dispatch is used, declare model and thinking explicitly. When fan-out is unavailable or unauthorized, one main-agent pass still reports Standards and Spec separately.'
      ].join('\n'),
      MATT_CODE_REVIEW_PATCH_MARKER,
      filePath
    );
    const fanoutPattern = /### 4\. Spawn both sub-agents in parallel[\s\S]*?(?=### 5\. Aggregate)/;
    if (!fanoutPattern.test(next)) {
      throw new Error(`Unable to apply ${MATT_CODE_REVIEW_PATCH_MARKER} fan-out replacement to ${filePath}`);
    }
    next = next.replace(fanoutPattern, [
      '### 4. Run the authorized two-axis review',
      '',
      'Run Standards and Spec as isolated review axes. Use parallel child agents only when the declared dispatch mode and capacity allow it; otherwise run both axes in the main session without merging their findings.',
      '',
      'A child prompt receives the fixed-point diff, exact source references, bounded brief, explicit model, and explicit thinking value. It never receives the parent chat history.'
    ].join('\n') + '\n\n');
    return next;
  });
}

export async function applyMattDomainModelingHarnessPatch(targetDir) {
  await patchSkill(targetDir, (original, filePath) => replaceRequired(
    original,
    /Create files lazily — only when you have something to write\. If no `CONTEXT\.md` exists, create one when the first term is resolved\. If no `docs\/adr\/` exists, create it when the first ADR is needed\./,
    [
      `## ${MATT_DOMAIN_MODELING_PATCH_MARKER}`,
      '',
      'Reuse existing project domain artifacts when they are already authoritative. Do not create `CONTEXT.md`, an ADR tree, or another durable state surface merely because this skill is active.',
      '',
      'For tracked work, record resolved terminology and durable decisions in the authoritative trio first. Create or update a separate domain artifact only when the user or repository contract authorizes it, then reference it from the trio.'
    ].join('\n'),
    MATT_DOMAIN_MODELING_PATCH_MARKER,
    filePath
  ));
}

export async function applyMattDebugHarnessPatch(targetDir) {
  await patchSkill(targetDir, (original, filePath) => replaceRequired(
    original,
    /\*\*Show the ranked list to the user before testing\.\*\*[\s\S]*?Don't block on it — proceed with your ranking if the user is AFK\./,
    [
      `**${MATT_DEBUG_PATCH_MARKER}.**`,
      'Generate and record 3–5 ranked, falsifiable hypotheses before testing. Present them when domain knowledge or a material trade-off would improve human judgment; otherwise continue the authorized diagnosis without creating a new gate.'
    ].join('\n\n'),
    MATT_DEBUG_PATCH_MARKER,
    filePath
  ));
}

export async function applyMattCodebaseDesignHarnessPatch(targetDir) {
  await patchSkill(targetDir, (original, filePath) => replaceRequired(
    original,
    /- \*\*Exploring alternative interfaces\*\*[\s\S]*?seam placement\./,
    `- **${MATT_CODEBASE_DESIGN_PATCH_MARKER}.** When alternative interfaces materially improve the decision, use [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md) under the repository dispatch contract. Main-agent alternatives are valid when child dispatch is prohibited or unnecessary.`,
    MATT_CODEBASE_DESIGN_PATCH_MARKER,
    filePath
  ));
  await patchFile(targetDir, 'DESIGN-IT-TWICE.md', (original, filePath) => {
    if (original.includes(MATT_CODEBASE_DESIGN_SIBLING_MARKER)) return original;
    let next = replaceRequired(
      original,
      /When the user wants to explore alternative interfaces for a chosen deepening candidate, use this parallel sub-agent pattern\./,
      `## ${MATT_CODEBASE_DESIGN_SIBLING_MARKER}\n\nWhen the user wants alternative interfaces for a chosen deepening candidate, first select the declared dispatch mode: \`prohibited\`, \`worker_discretion\`, or \`encouraged\`. Use main-agent alternatives when dispatch is prohibited; child agents are optional and mechanically narrower than the parent authority.`,
      MATT_CODEBASE_DESIGN_SIBLING_MARKER,
      filePath
    );
    const alternativesPattern = /### 2\. Spawn sub-agents[\s\S]*?(?=### 3\. Present and compare)/;
    if (!alternativesPattern.test(next)) {
      throw new Error(`Unable to apply ${MATT_CODEBASE_DESIGN_SIBLING_MARKER} alternatives replacement to ${filePath}`);
    }
    next = next.replace(
      alternativesPattern,
      [
        '### 2. Produce distinct alternatives',
        '',
        'Produce at least two radically different interfaces. If child dispatch is authorized, every child receives a bounded brief plus explicit model and thinking values; otherwise generate the alternatives sequentially in the main session. Do not forward parent chat history.',
        '',
        'For each alternative, report the interface, usage, hidden implementation, dependency strategy, and trade-offs.'
      ].join('\n') + '\n\n'
    );
    return next;
  });
}

export async function applyMattImplementHarnessPatch(targetDir) {
  await patchSkill(targetDir, (original, filePath) => replaceRequired(
    original,
    /Implement the work described by the user in the spec or tickets\.[\s\S]*?Commit your work to the current branch\./,
    [
      `## ${MATT_IMPLEMENT_PATCH_MARKER}`,
      '',
      'Implement the authorized user request from the bound `planning/active/<task-id>/` trio and, when present, its approved companion plan. External specs or tickets are references, not a second authority.',
      '',
      'Use the adapted TDD contract at the selected seam. Run focused checks during work and the risk-matched final suite. Review under the Harness review dispatch mode. Commit only when the user or repository workflow authorizes it.'
    ].join('\n'),
    MATT_IMPLEMENT_PATCH_MARKER,
    filePath
  ));
}

export async function applyMattResearchHarnessPatch(targetDir) {
  await patchSkill(targetDir, (original, filePath) => replaceRequired(
    original,
    /Spin up a \*\*background agent\*\*[\s\S]*?put it somewhere sensible and say where\./,
    [
      `## ${MATT_RESEARCH_PATCH_MARKER}`,
      '',
      'Use primary sources. Child research is optional and must follow the declared dispatch mode with a bounded brief, explicit model, and explicit thinking value.',
      '',
      'For tracked work, record durable claims and citations in `findings.md` or in one explicitly referenced companion artifact. Do not create an unbound notes authority.'
    ].join('\n'),
    MATT_RESEARCH_PATCH_MARKER,
    filePath
  ));
}

export async function applyMattPrototypeHarnessPatch(targetDir) {
  await patchSkill(targetDir, (original, filePath) => replaceRequired(
    original,
    /The _answer_ is the only thing worth keeping from a prototype\.[\s\S]*?before deleting the prototype\./,
    [
      `## ${MATT_PROTOTYPE_PATCH_MARKER}`,
      '',
      'Keep the prototype isolated and visibly temporary. When it answers the question, delete it or absorb the validated slice; record the durable conclusion in the bound trio and reference any separately authorized design artifact.'
    ].join('\n'),
    MATT_PROTOTYPE_PATCH_MARKER,
    filePath
  ));
}

export async function applyMattArchitectureHarnessPatch(targetDir) {
  await patchSkill(targetDir, (original, filePath) => {
    if (original.includes(MATT_ARCHITECTURE_PATCH_MARKER)) return original;
    const reportPattern = /### 2\. Present candidates as an HTML report[\s\S]*?See \[HTML-REPORT\.md\]\(HTML-REPORT\.md\) for the full HTML scaffold, diagram patterns, and styling guidance\./;
    const grillingPattern = /Once the user picks a candidate, run the `\/grilling` skill/;
    if (!reportPattern.test(original) || !grillingPattern.test(original)) {
      throw new Error(`Unable to apply ${MATT_ARCHITECTURE_PATCH_MARKER} workflow replacements to ${filePath}`);
    }
    let next = replaceRequired(
      original,
      /Then use the Agent tool with `subagent_type=Explore` to walk the codebase\./,
      `## ${MATT_ARCHITECTURE_PATCH_MARKER}\n\nExplore in the main session or through an authorized, bounded child dispatch.`,
      MATT_ARCHITECTURE_PATCH_MARKER,
      filePath
    );
    next = next.replace(
      reportPattern,
      '### 2. Present candidates\n\nUse concise prose by default. Produce the optional HTML report only when a visualization materially improves comparison and the user or host can use it.'
    );
    next = next.replace(
      grillingPattern,
      'When the user explicitly asks to stress-test a selected candidate, use the projected `/grilling` skill'
    );
    next += '\n\nRecord durable architecture terminology and decisions in the bound trio first; create or update CONTEXT/ADR artifacts only under repository or user authority.\n';
    return next;
  });
}

export async function applyMattGrillWithDocsHarnessPatch(targetDir) {
  await patchSkill(targetDir, (original, filePath) => replaceRequired(
    original,
    /Run a `\/grilling` session, using the `\/domain-modeling` skill\./,
    `## ${MATT_GRILL_WITH_DOCS_PATCH_MARKER}\n\nOn explicit invocation, use the projected \`/grilling\` and \`/domain-modeling\` skills. Keep durable decisions in the bound trio; separate documentation is created only under repository or user authority.`,
    MATT_GRILL_WITH_DOCS_PATCH_MARKER,
    filePath
  ));
}

export async function applyMattGrillingHarnessPatch(targetDir) {
  await patchSkill(targetDir, (original, filePath) => replaceRequired(
    original,
    /Interview me relentlessly about every aspect of this plan until we reach a shared understanding\./,
    `## ${MATT_GRILLING_PATCH_MARKER}\n\nInterview the user only when this skill is explicitly invoked, bounded by the plan or design under review. Ask only questions whose answers can materially change scope, architecture, risk, or acceptance; stop when those branches are resolved. Sync durable conclusions to the bound trio.`,
    MATT_GRILLING_PATCH_MARKER,
    filePath
  ));
}

export async function applyMattWritingSkillsHarnessPatch(targetDir) {
  await patchSkill(targetDir, (original, filePath) => replaceRequired(
    original,
    /A skill exists to wrangle determinism out of a stochastic system\./,
    `## ${MATT_WRITING_SKILLS_PATCH_MARKER}\n\nApply this guidance only when skill authoring is explicitly requested or already authorized. Repository skill policy and the bound trio own durable decisions; this reference does not create a separate workflow or require child dispatch.\n\nA skill exists to wrangle determinism out of a stochastic system.`,
    MATT_WRITING_SKILLS_PATCH_MARKER,
    filePath
  ));
}
