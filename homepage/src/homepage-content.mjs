const canonicalLinks = {
  github: 'https://github.com/ilderaj/superpowering-with-files',
  docs: 'https://github.com/ilderaj/superpowering-with-files/blob/main/docs/workflows.md'
};

export const homepageSectionOrder = [
  'hero',
  'comparison',
  'routing',
  'repoProof',
  'closing'
];

export const homepageContent = {
  topbar: {
    brandLabel: 'Superpowering with Files',
    brandHref: '/superpowering-with-files/',
    links: [
      {
        label: 'Workflow',
        href: canonicalLinks.docs
      },
      {
        label: 'GitHub',
        href: canonicalLinks.github
      }
    ]
  },
  hero: {
    kicker: 'Claude Code workflow kit',
    headingId: 'hero-title',
    headline: 'Give agents a memory they can open.',
    lede:
      'Superpowering with Files turns deep reasoning into planning files, so local coding agents can pause, resume, and hand off without losing the trail.',
    actions: [
      {
        label: 'Star the repo',
        href: canonicalLinks.github
      },
      {
        label: 'Read the workflow',
        href: canonicalLinks.docs
      }
    ]
  },
  proof: {
    breadth: {
      label: 'Files',
      title: 'State stays visible.',
      detail: 'Plans, findings, and progress live beside the code.'
    },
    depth: {
      label: 'Superpowers',
      title: 'Depth appears on demand.',
      detail: 'Heavy reasoning is reserved for tasks that need it.'
    },
    hybrid: {
      label: 'Hybrid',
      title: 'Depth becomes durable state.',
      detail: 'Reason carefully, record the judgment, then resume from the repo.'
    }
  },
  comparison: [
    {
      label: 'Reason',
      title: 'Use Superpowers when the task earns depth.',
      detail: ''
    },
    {
      label: 'Record',
      title: 'Write decisions into files the repo can carry.',
      detail: ''
    },
    {
      label: 'Resume',
      title: 'Let any local agent pick up the thread.',
      detail: ''
    }
  ],
  routing: {
    headingId: 'routing-title',
    eyebrow: 'Routing model',
    title: 'Keep simple work simple.',
    body:
      'Most changes should stay fast. The workflow only escalates when uncertainty, architecture, or recovery risk makes deeper reasoning worth it.',
    bullets: [
      'Start with the local task.',
      'Escalate only when complexity earns it.',
      'Write the result back into planning files.'
    ]
  },
  repoProof: {
    headingId: 'repo-proof-title',
    eyebrow: 'Repo-native proof',
    title: 'The system is inspectable.',
    body:
      'No hidden service owns the memory. The trail stays in files your editor, agents, reviews, and future sessions can open.',
    items: [
      {
        label: 'Task plan',
        detail: 'Scope, phase, and verification stay explicit.'
      },
      {
        label: 'Findings',
        detail: 'Research and decisions survive context loss.'
      },
      {
        label: 'Progress',
        detail: 'Execution can stop, resume, or hand off cleanly.'
      }
    ]
  },
  closing: {
    headingId: 'closing-title',
    title: 'If your agents lose context, give them files.',
    links: [
      {
        label: 'Star on GitHub',
        href: canonicalLinks.github
      },
      {
        label: 'Study the workflow',
        href: canonicalLinks.docs
      }
    ]
  }
};
