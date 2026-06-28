export const homepageSectionOrder = ['hero', 'problem', 'system', 'workflow', 'start'];

const githubUrl = 'https://github.com/ilderaj/superpowering-with-files';
const workflowUrl = `${githubUrl}/blob/main/docs/workflows.md`;
const quickStartUrl = `${githubUrl}/blob/main/README.md#quick-start`;

export const homepageContent = {
  topbar: {
    brandLabel: 'Superpowering With Files',
    brandHref: '#top',
    links: [
      { label: 'Why', href: '#problem' },
      { label: 'System', href: '#system' },
      { label: 'Proof', href: '#workflow' },
      { label: 'Start', href: '#start' }
    ],
    cta: {
      label: 'View source',
      href: githubUrl,
      external: true
    },
    github: {
      label: 'Read workflow',
      href: workflowUrl
    }
  },
  hero: {
    headingId: 'hero-title',
    eyebrow: 'Governance harness for coding-agent workflows',
    headline: 'Keep every coding agent on the same rails.',
    lede:
      'One shared workflow policy becomes native entry files, projected skills, durable task state, and optional deeper reasoning across Codex, GitHub Copilot, Cursor, and Claude Code.',
    actions: [
      { label: 'View source', href: githubUrl, variant: 'primary', external: true },
      { label: 'Read workflow', href: workflowUrl, variant: 'secondary', external: true }
    ],
    proofPoints: [
      { value: '4', label: 'agent surfaces share one workflow contract' },
      { value: '3', label: 'task files keep tracked work durable' },
      { value: '1', label: 'shared policy renders native entry files' },
      { value: '0', label: 'always-on superpowers by default' }
    ],
    terminal: {
      title: './scripts/harness',
      lines: [
        { tone: 'cmd', prefix: '$', text: './scripts/harness install --scope=workspace --targets=all --projection=link' },
        { tone: 'dim', text: 'rendering native entry files from one policy...' },
        { tone: 'hot', text: 'AGENTS.md for Codex' },
        { tone: 'hot', text: 'copilot-instructions.md for GitHub Copilot' },
        { tone: 'hot', text: '.cursor/rules/harness.mdc for Cursor' },
        { tone: 'hot', text: 'CLAUDE.md for Claude Code' },
        { tone: 'break' },
        { tone: 'cmd', prefix: '$', text: './scripts/harness doctor --check-only' },
        { tone: 'dim', text: 'policy synced · planning durable · deep reasoning optional' }
      ]
    },
    route: {
      title: 'Routed by complexity',
      badge: 'not always-on',
      steps: [
        {
          number: '1',
          title: 'Render one policy',
          body: 'Every supported agent gets the native files it expects without hand-maintained drift.'
        },
        {
          number: '2',
          title: 'Keep tracked work on disk',
          body: 'Task state lives in planning files that survive interruptions, review loops, and handoff.'
        },
        {
          number: '3',
          title: 'Escalate only when earned',
          body: 'Quick work stays light. Deep reasoning appears only when the task really needs it.'
        }
      ]
    }
  },
  problem: {
    id: 'problem',
    kicker: 'Why governance',
    title: 'Strong agents still drift when each tool carries its own memory.',
    body:
      'Without one control layer, rules fork, task state disappears, and finish quality drifts with the toolchain.',
    quoteTitle: 'The failure mode is invisible state.',
    quoteBody:
      'Policies fork across tools, tracked work falls back into chat, and expensive reasoning gets used where a lighter path would have been enough.',
    pains: [
      {
        icon: '01',
        title: 'Policy forks',
        body: 'Codex, Copilot, Cursor, and Claude Code drift unless one source renders their native entry files.'
      },
      {
        icon: '02',
        title: 'Plans disappear',
        body: 'Multi-step work needs durable task files, not a fragile trail spread across chat history.'
      },
      {
        icon: '03',
        title: 'Reasoning gets overused',
        body: 'If complexity is not routed deliberately, quick work pays for depth it did not need.'
      },
      {
        icon: '04',
        title: 'Finishes get risky',
        body: 'Verification, reconcile, and release state can drift apart unless the workflow makes them inspectable.'
      }
    ]
  },
  system: {
    id: 'system',
    kicker: 'How it works',
    title: 'Shared policy stays in files. Deeper reasoning stays optional.',
    body:
      'The harness keeps policy always-on, planning durable, and deeper reasoning conditional, so simple work stays simple and complex work stays legible.',
    modules: [
      {
        label: 'Policy',
        title: 'One source of truth',
        body: 'Shared rules, templates, and platform overrides render into the native files each agent already expects.'
      },
      {
        label: 'Planning',
        title: 'Durable task state',
        body: 'Tracked work stays in task_plan.md, findings.md, and progress.md instead of fading with the conversation.'
      },
      {
        label: 'Reasoning',
        title: 'Optional depth',
        body: 'Superpowers only step in for deep-reasoning rounds, then sync decisions back to the task files.'
      },
      {
        label: 'Finish',
        title: 'Visible closeout',
        body: 'Verify, reconcile, and archive happen as explicit workflow steps rather than hidden last-mile rituals.'
      }
    ],
    lanes: ['quick', 'tracked', 'deep-reasoning', 'reconcile']
  },
  workflow: {
    id: 'workflow',
    kicker: 'Repo proof',
    title: 'Inspect the workflow from intake to finish.',
    tracks: [
      {
        title: 'What remains on disk.',
        body:
          'Tracked work leaves readable artifacts that can be reopened, reviewed, and reconciled instead of disappearing into ephemeral chat state.',
        rows: [
          [
            { title: 'Core state', body: 'task_plan.md, findings.md, and progress.md under planning/active/<task-id>/' },
            { title: 'Lifecycle proof', body: 'reconciliation.md appears when the task needs explicit lifecycle evidence' }
          ],
          [
            { title: 'Resume path', body: 'Companion plans point back to active planning files instead of becoming a second memory system' },
            { title: 'Review surface', body: 'Intent, diffs, tests, and follow-up ownership can be inspected together before finish' }
          ]
        ]
      },
      {
        title: 'What teams can verify.',
        body:
          'The repo exposes commands and workflow lanes that make adoption, verification, and governance claims checkable.',
        rows: [
          [
            { title: 'Workflow lanes', body: 'plan, review, verify, reconcile, finish, release, and archive remain explicit' },
            { title: 'Supported targets', body: 'Codex, GitHub Copilot, Cursor, and Claude Code share the same governance model' }
          ],
          [
            { title: 'Checks', body: './scripts/harness doctor --check-only, sync --dry-run, and npm run verify:all' },
            { title: 'Proof path', body: 'Source, workflow docs, and CLI steps stay visible before anyone commits to installation' }
          ]
        ]
      }
    ]
  },
  start: {
    id: 'start',
    kicker: 'Start here',
    title: 'Read the repo first. Use the CLI when the workflow fits.',
    body:
      'Source and workflow docs should make the promise clear before any install step. When it fits, the CLI path below is the shortest safe start.',
    quickStartTitle: 'CLI path',
    quickStartBody: 'These commands mirror the documented quick start and keep the workflow observable from install to verification.',
    commands: [
      './scripts/harness install --scope=workspace --targets=all --projection=link',
      './scripts/harness sync',
      './scripts/harness doctor',
      'npm run verify:all'
    ],
    cta: {
      title: 'Use the CLI once the repo proof is enough.',
      body: 'Read the source, inspect the workflow, then adopt the harness without adding a hidden control plane on top of your editor.',
      action: { label: 'Start with the CLI', href: quickStartUrl, external: true },
      secondaryAction: { label: 'Open GitHub and star the repo', href: githubUrl, external: true }
    }
  },
  footer: {
    left: 'Governed workflow harness for local coding agents.',
    right: 'Warm editorial homepage · repo-native proof',
    github: {
      label: 'View source',
      href: githubUrl
    }
  }
};
