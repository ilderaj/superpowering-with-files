export const homepageSectionOrder = ['hero', 'problem', 'system', 'workflow', 'start'];

const githubUrl = 'https://github.com/ilderaj/superpowering-with-files';
const workflowUrl = `${githubUrl}/blob/main/docs/workflows.md`;
const readmeUrl = `${githubUrl}/blob/main/README.md`;

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
    eyebrow: 'Trio v2 for Codex',
    headline: 'Plan in one session. Execute with proof.',
    lede:
      'Codex is the managed native host. Other hosts use a generic/manual fallback; the Trio keeps three durable task files and selects one pack for each task.',
    actions: [
      { label: 'View source', href: githubUrl, variant: 'primary', external: true },
      { label: 'Read workflow', href: workflowUrl, variant: 'secondary', external: true }
    ],
    proofPoints: [
      { value: '1', label: 'managed native host: Codex' },
      { value: '3', label: 'only durable task files' },
      { value: '3', label: 'selected packs: dev, office, safety' },
      { value: '0', label: 'second runners' }
    ],
    terminal: {
      title: './scripts/harness',
      lines: [
        { tone: 'cmd', prefix: '$', text: './scripts/harness trio' },
        { tone: 'dim', text: 'Host owns lifecycle, permissions, and continuation.' },
        { tone: 'hot', text: 'task_plan.md · findings.md · progress.md' },
        { tone: 'hot', text: 'one selected pack: dev / office / safety' },
        { tone: 'break' },
        { tone: 'cmd', prefix: '$', text: './scripts/harness verify' },
        { tone: 'dim', text: 'Requested model and effort are intent; actual is unknown without Host evidence.' }
      ]
    },
    route: {
      title: 'Routed by task',
      badge: 'deep is current-round',
      steps: [
        {
          number: '1',
          title: 'Choose the route',
          body: 'Quick and tracked classify durable work. Deep is a current-round reasoning choice, not a task type.'
        },
        {
          number: '2',
          title: 'Select one pack',
          body: 'Each task selects one pack: dev, office, or safety.'
        },
        {
          number: '3',
          title: 'Keep Host control',
          body: 'Worker results are candidates until the main session or Chief accepts them.'
        }
      ]
    }
  },
  problem: {
    id: 'problem',
    kicker: 'Why Trio v2',
    title: 'Avoid a second control plane.',
    body:
      'Durable task state and long-task runtime should stay small, visible, and native to the Host.',
    quoteTitle: 'The durable state is only three files.',
    quoteBody:
      'The Trio keeps task_plan.md, findings.md, and progress.md together while the Host keeps its own controls.',
    pains: [
      {
        icon: '01',
        title: 'Host boundaries blur',
        body: 'Codex stays managed and native; every other host is an honest generic/manual fallback.'
      },
      {
        icon: '02',
        title: 'State spreads',
        body: 'Tracked work needs one small authority, not task facts scattered across chats and side systems.'
      },
      {
        icon: '03',
        title: 'Reasoning becomes a label',
        body: 'Quick and tracked route the work; deep is a current-round decision when uncertainty earns it.'
      },
      {
        icon: '04',
        title: 'Worker status overclaims',
        body: 'A worker result is evidence for acceptance, never automatic completion.'
      }
    ]
  },
  system: {
    id: 'system',
    kicker: 'How Trio v2 works',
    title: 'Keep the authority small and the runtime native.',
    body:
      'The Trio is the durable authority. Native Goal and continuation run long work with no second runner.',
    modules: [
      {
        label: 'Host',
        title: 'Codex stays native',
        body: 'The Host owns lifecycle, permissions, continuation, and authenticated actual model evidence.'
      },
      {
        label: 'Trio',
        title: 'Three files, one authority',
        body: 'Tracked work lives only in task_plan.md, findings.md, and progress.md.'
      },
      {
        label: 'Packs',
        title: 'Choose one capability',
        body: 'Each task selects exactly one pack: dev, office, or safety.'
      },
      {
        label: 'Runtime',
        title: 'Continue natively',
        body: 'Native Goal and continuation recover long work without adding a second runner.'
      }
    ],
    lanes: ['quick', 'tracked', 'deep']
  },
  workflow: {
    id: 'workflow',
    kicker: 'Public boundaries',
    title: 'Inspect the Trio and Host boundaries.',
    tracks: [
      {
        title: 'What stays durable.',
        body:
          'Only the Trio remains on disk as task authority; its contents are readable, reviewable, and ready to resume.',
        rows: [
          [
            { title: 'Core state', body: 'Only task_plan.md, findings.md, and progress.md live under planning/active/<task-id>/.' },
            { title: 'Selected pack', body: 'Each task uses one selected pack: dev, office, or safety.' }
          ],
          [
            { title: 'Route', body: 'Quick and tracked are routes; deep is a current-round reasoning choice.' },
            { title: 'Acceptance', body: 'Worker results remain candidates until the main session or Chief accepts them.' }
          ]
        ]
      },
      {
        title: 'What stays native.',
        body:
          'The Host keeps control of lifecycle, permissions, continuation, and authenticated evidence instead of handing those roles to another runtime.',
        rows: [
          [
            { title: 'Model evidence', body: 'Requested model and effort are intent; actual is unknown without Host evidence.' },
            { title: 'Long tasks', body: 'Native Goal and continuation run long work with no second runner.' }
          ],
          [
            { title: 'Managed native host', body: 'Codex is the managed native host; other hosts remain generic/manual fallback.' },
            { title: 'Proof path', body: 'Source and workflow docs stay visible before anyone chooses an installation command.' }
          ]
        ]
      }
    ]
  },
  start: {
    id: 'start',
    kicker: 'Start here',
    title: 'Start with Codex and the Trio.',
    body:
      'Read the source and workflow docs first, then use the small public command surface when it fits your task.',
    quickStartTitle: 'Public commands',
    quickStartBody: 'The command names stay explicit so each step remains easy to inspect before use.',
    commands: [
      './scripts/harness install',
      './scripts/harness sync',
      './scripts/harness doctor',
      './scripts/harness trio',
      './scripts/harness verify',
      './scripts/harness checkpoint',
      './scripts/harness token-audit'
    ],
    cta: {
      title: 'Read the README once the repo proof is enough.',
      body: 'Read the source, inspect the workflow, then use the Trio without adding a hidden control plane above the Host.',
      action: { label: 'Read the README', href: readmeUrl, external: true },
      secondaryAction: { label: 'Open GitHub and star the repo', href: githubUrl, external: true }
    }
  },
  footer: {
    left: 'Trio v2 workflow for Codex.',
    right: 'Native Host control · repo-native proof',
    github: {
      label: 'View source',
      href: githubUrl
    }
  }
};
