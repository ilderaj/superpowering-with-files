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
      'Hard tasks need better reasoning. Decisions need a visible trail. This workflow keeps both in the repo.',
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
      detail: 'Plans and progress stay visible across sessions.'
    },
    depth: {
      label: 'Depth',
      title: 'Superpowers sharpen hard calls.',
      detail: 'Deeper reasoning appears only when the task earns it.'
    },
    hybrid: {
      label: 'Hybrid',
      title: 'One workflow. Routed by complexity.',
      detail: 'Escalate for hard work, then write the result back.'
    }
  },
  comparison: [
    {
      label: 'Only breadth',
      title: 'State survives, judgment stays flat.',
      detail: ''
    },
    {
      label: 'Only depth',
      title: 'Reasoning sharpens, memory fades.',
      detail: ''
    },
    {
      label: 'Both',
      title: 'Better judgment lands in files.',
      detail: ''
    }
  ],
  routing: {
    headingId: 'routing-title',
    eyebrow: 'How routing works',
    title: 'Keep the fast lane fast.',
    body:
      'Cheap work stays lightweight. Complex work escalates, then writes back into repo-native state.',
    bullets: [
      'Start local.',
      'Escalate only for hard work.',
      'Write the result back.'
    ]
  },
  repoProof: {
    headingId: 'repo-proof-title',
    eyebrow: 'What lives in files',
    title: 'The trail is part of the product.',
    body:
      'Plans, findings, and execution stay inspectable in the repo.',
    items: [
      {
        label: 'Plans',
        detail: 'Route before execution starts.'
      },
      {
        label: 'Findings',
        detail: 'Research and constraints stay durable.'
      },
      {
        label: 'Progress',
        detail: 'Execution stays resumable across sessions.'
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
