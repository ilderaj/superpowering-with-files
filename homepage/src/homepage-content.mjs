export const homepageSectionOrder = ['hero', 'problem', 'system', 'workflow', 'start'];

const githubUrl = 'https://github.com/ilderaj/superpowering-with-files';

export const homepageContent = {
  topbar: {
    brandLabel: 'Superpowering With Files',
    brandHref: '#top',
    links: [
      { label: 'Problem', href: '#problem' },
      { label: 'System', href: '#system' },
      { label: 'Workflow', href: '#workflow' },
      { label: 'Start', href: '#start' }
    ],
    cta: {
      label: 'Install harness',
      href: '#start'
    },
    github: {
      label: 'GitHub',
      href: githubUrl
    }
  },
  hero: {
    headingId: 'hero-title',
    eyebrow: 'Governance harness for local coding agents',
    headline: 'One control layer for every coding agent you actually use.',
    lede:
      'Superpowering With Files turns a shared workflow policy into native instructions, projected skills, optional hooks, and durable task state across Codex, GitHub Copilot, Cursor, and Claude Code.',
    actions: [
      { label: 'Start with the CLI', href: '#start', variant: 'primary' },
      { label: 'See how it works', href: '#system', variant: 'secondary' },
      { label: 'Star on GitHub', href: githubUrl, variant: 'secondary', external: true }
    ],
    proofPoints: [
      { value: '4', label: 'agent surfaces governed from one policy' },
      { value: '3', label: 'task files preserve durable state' },
      { value: '0', label: 'always-on superpowers by default' },
      { value: '1', label: 'reconcile gate before finish' }
    ],
    terminal: {
      title: './scripts/harness',
      lines: [
        { tone: 'cmd', prefix: '$', text: './scripts/harness install --targets=all' },
        { tone: 'dim', text: 'rendering shared policy...' },
        { tone: 'hot', text: '✓ AGENTS.md for Codex' },
        { tone: 'hot', text: '✓ copilot-instructions.md for GitHub Copilot' },
        { tone: 'hot', text: '✓ .cursor/rules/harness.mdc for Cursor' },
        { tone: 'hot', text: '✓ CLAUDE.md for Claude Code' },
        { tone: 'break' },
        { tone: 'cmd', prefix: '$', text: './scripts/harness doctor --check-only' },
        {
          tone: 'mix',
          segments: [
            { tone: 'blue', text: 'policy' },
            { tone: 'dim', text: ' synced · ' },
            { tone: 'blue', text: 'skills' },
            { tone: 'dim', text: ' projected · ' },
            { tone: 'blue', text: 'hooks' },
            { tone: 'dim', text: ' opt-in' }
          ]
        }
      ]
    },
    route: {
      title: 'Tracked task route',
      badge: 'durable by default',
      steps: [
        {
          number: '1',
          title: 'Classify the task',
          body: 'Quick tasks stay light; tracked tasks get file-backed state.'
        },
        {
          number: '2',
          title: 'Write the active plan',
          body: 'State lives in task_plan.md, findings.md, and progress.md.'
        },
        {
          number: '3',
          title: 'Verify and reconcile',
          body: 'Intent, diff, checks, and follow-ups align before finish.'
        }
      ]
    }
  },
  problem: {
    id: 'problem',
    kicker: 'Why it exists',
    title: 'Agent workflows break when every tool invents its own memory.',
    body:
      'Local coding agents are powerful, but their instructions, hooks, skills, and planning habits drift across platforms. The harness makes the workflow explicit, portable, and auditable.',
    quoteTitle: 'The problem is not lack of capability. It is lack of governance.',
    quoteBody:
      'When plans live in chat, policies are copied by hand, and deep reasoning is always-on, teams pay in context bloat, hidden state, inconsistent behavior, and risky automation.',
    pains: [
      {
        icon: '01',
        title: 'Policy drift',
        body: 'Codex, Copilot, Cursor, and Claude Code can each read different instructions unless there is one canonical source.'
      },
      {
        icon: '02',
        title: 'Lost task state',
        body: 'Long-running work needs durable files that survive interruptions, compaction, and session handoff.'
      },
      {
        icon: '03',
        title: 'Overloaded reasoning',
        body: 'Superpowers are useful, but only when a task really needs deep structured thinking.'
      },
      {
        icon: '04',
        title: 'Unsafe finish',
        body: 'Implementation, verification, docs, and release state need a reconcile step before the task is closed.'
      }
    ]
  },
  system: {
    id: 'system',
    kicker: 'What it provides',
    title: 'A small operating system for agentic coding work.',
    body:
      'Harness separates the always-on policy core from optional execution lanes, runtime services, and safety controls.',
    modules: [
      {
        label: 'Core',
        title: 'Shared policy',
        body: 'Platform-neutral rules, templates, schemas, and skill metadata remain the source of truth.'
      },
      {
        label: 'Adapters',
        title: 'Native projections',
        body: 'Each target gets its expected files, roots, and configuration shape without manual copy-paste.'
      },
      {
        label: 'Runtime',
        title: 'Typed services',
        body: 'Status, doctor, summaries, dry-runs, approvals, receipts, and registry checks share one business layer.'
      },
      {
        label: 'MCP',
        title: 'Audited facade',
        body: 'External agents can access governed tools and resources without bypassing the harness model.'
      }
    ],
    lanes: ['plan', 'review', 'verify', 'reconcile', 'finish', 'release', 'archive']
  },
  workflow: {
    id: 'workflow',
    kicker: 'How it feels',
    title: 'Light when work is simple. Durable when work gets real.',
    tracks: [
      {
        title: 'Quick tasks stay quick.',
        body:
          'If the task is single-stage, clear, and low-risk, the harness keeps execution direct. No heavyweight routing, no unnecessary planning ceremony, no default superpowers.',
        rows: [
          [
            { title: 'Best for', body: 'Small edits, formatting, simple fixes' },
            { title: 'State', body: 'Conversation and normal verification' }
          ],
          [
            { title: 'Reasoning', body: 'Standard execution path' },
            { title: 'Finish', body: 'Report result after checks' }
          ]
        ]
      },
      {
        title: 'Tracked tasks become recoverable.',
        body:
          'Multi-phase work, research, subagents, worktree isolation, and durable decisions get a task-scoped file system: plan, findings, progress, verification, and reconciliation.',
        rows: [
          [
            { title: 'Best for', body: 'Long tasks, architecture, comparisons' },
            { title: 'State', body: 'planning/active/<task-id>/' }
          ],
          [
            { title: 'Reasoning', body: 'Superpowers only when justified' },
            { title: 'Finish', body: 'Reconcile before archive' }
          ]
        ]
      }
    ]
  },
  start: {
    id: 'start',
    kicker: 'Start here',
    title: 'Install once. Keep every local agent on the same rails.',
    body:
      'Use the harness CLI to render native entry files, sync skill projections, run doctor checks, and verify changes before pushing workflow updates.',
    quickStartTitle: 'Quick start',
    quickStartBody: 'These commands mirror the project’s documented flow and are positioned as the primary homepage CTA.',
    commands: [
      './scripts/harness install --scope=workspace --targets=all --projection=link',
      './scripts/harness sync',
      './scripts/harness doctor',
      'npm run verify'
    ],
    cta: {
      title: 'Bring governance to the agents already in your editor.',
      body: 'Shared policy, native files, durable planning, optional hooks, and a safer path from intent to verified finish.',
      action: { label: 'Review the draft', href: '#top' },
      secondaryAction: { label: 'Open GitHub and star the repo', href: githubUrl }
    }
  },
  footer: {
    left: 'Homepage concept evolved into the live homepage.',
    right: 'Modern product page · governed workflow harness',
    github: {
      label: 'Star on GitHub',
      href: githubUrl
    }
  }
};
