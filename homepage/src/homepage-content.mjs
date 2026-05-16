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
        label: 'Docs',
        href: canonicalLinks.docs
      },
      {
        label: 'GitHub',
        href: canonicalLinks.github
      }
    ]
  },
  hero: {
    kicker: 'Planning with Files × Superpowers',
    headingId: 'hero-title',
    headline: 'Stop losing good judgment.',
    lede:
      'Hard work deserves stronger reasoning. Important decisions deserve a visible trail. This workflow does both, in the same repo-native system.',
    actions: [
      {
        label: 'View source',
        href: canonicalLinks.github
      },
      {
        label: 'Read workflow',
        href: canonicalLinks.docs
      }
    ]
  },
  proof: {
    breadth: {
      label: 'Breadth',
      title: 'Files keep state.',
      detail: 'Plans, findings, and progress stay visible across agents and sessions.'
    },
    depth: {
      label: 'Depth',
      title: 'Superpowers sharpen hard calls.',
      detail: 'Deeper reasoning appears only when the task actually earns it.'
    },
    hybrid: {
      label: 'Hybrid',
      title: 'One workflow. Routed by complexity.',
      detail: 'Think → record → resume. Better calls without losing the trail.'
    }
  },
  comparison: [
    {
      label: 'Only breadth',
      title: 'State, no sharper thinking.',
      detail: 'The files survive, but every difficult decision still happens in the same flat lane.'
    },
    {
      label: 'Only depth',
      title: 'Sharper calls, no durable memory.',
      detail: 'The reasoning gets better for a moment, then fades and becomes hard to resume.'
    },
    {
      label: 'Both',
      title: 'Judgment lands as state.',
      detail: 'The hard part gets deeper thinking, then the result returns to visible planning files.'
    }
  ],
  routing: {
    headingId: 'routing-title',
    eyebrow: 'How routing works',
    title: 'The fast lane stays fast.',
    body:
      'Simple work stays lightweight. Difficult work earns deeper handling, then syncs back into files that any local agent surface can continue from.',
    bullets: [
      'Start in the normal lane for cheap, visible work.',
      'Escalate only when the task is complex enough to earn it.',
      'Write the outcome back into repo-native task state.'
    ]
  },
  repoProof: {
    headingId: 'repo-proof-title',
    eyebrow: 'What lives in files',
    title: 'The trail is part of the product.',
    body:
      'This system proves itself with visible artifacts in the repo, not with abstract claims.',
    items: [
      {
        label: 'Plans',
        detail: 'Task plans define the route before execution starts.'
      },
      {
        label: 'Findings',
        detail: 'Research, decisions, and constraints stay durable.'
      },
      {
        label: 'Progress',
        detail: 'Execution state stays resumable across sessions and tools.'
      }
    ]
  },
  closing: {
    headingId: 'closing-title',
    title: 'Route by complexity. Keep the trail.',
    links: [
      {
        label: 'GitHub',
        href: canonicalLinks.github
      },
      {
        label: 'Docs',
        href: canonicalLinks.docs
      }
    ]
  }
};
