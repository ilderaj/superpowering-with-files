const navItems = ['Depth', 'Memory', 'Handoff'];

const searchSegments = [
  { label: 'Think', value: 'Superpowers' },
  { label: 'Record', value: 'planning files' },
  { label: 'Resume', value: 'any local agent' }
];

const taskFiles = [
  {
    name: 'Think',
    note: 'skills, critique, harder calls',
    status: 'temporary'
  },
  {
    name: 'Record',
    note: 'plan, findings, progress',
    status: 'durable'
  },
  {
    name: 'Resume',
    note: 'native rules for each agent',
    status: 'portable'
  }
];

const categories = [
  { label: 'Deep tasks', glyph: 'D' },
  { label: 'Skill routing', glyph: 'S' },
  { label: 'Files', glyph: 'F' },
  { label: 'Sync-back', glyph: 'R' },
  { label: 'Verification', glyph: 'V' },
  { label: 'Handoff', glyph: 'H' }
];

const comparisons = [
  {
    label: 'One service',
    title: 'State is hidden.',
    detail: 'Good for a session. Harder to audit, resume, or move.'
  },
  {
    label: 'Superpowers alone',
    title: 'Depth is temporary.',
    detail: 'The agent thinks better, then the context can still fade.'
  },
  {
    label: 'Together',
    title: 'Depth becomes state.',
    detail: 'Hard decisions land in files any agent or human can read.'
  }
];

const cards = [
  {
    title: 'Better calls',
    location: 'Superpowers',
    description: 'Skills slow down hard phases: architecture, debugging, review, design.',
    meta: 'reason',
    tone: 'rose'
  },
  {
    title: 'Durable memory',
    location: 'planning files',
    description: 'Plans, findings, and progress survive context loss and model switches.',
    meta: 'record',
    tone: 'sand'
  },
  {
    title: 'Clean handoff',
    location: 'sync-back',
    description: 'The next agent starts from decisions, not a vague transcript.',
    meta: 'resume',
    tone: 'mint'
  },
  {
    title: 'Tool freedom',
    location: 'repo-native',
    description: 'Visible state works across Copilot, Codex, Cursor, and Claude Code.',
    meta: 'portable',
    tone: 'blue'
  }
];

const links = [
  { label: 'GitHub', href: 'https://github.com/ilderaj/superpowering-with-files' },
  { label: 'README', href: 'https://github.com/ilderaj/superpowering-with-files/blob/main/README.md' },
  { label: 'Workflows', href: 'https://github.com/ilderaj/superpowering-with-files/blob/main/docs/workflows.md' },
  { label: 'Install', href: 'https://github.com/ilderaj/superpowering-with-files/blob/main/docs/install/copilot.md' }
];

export default function App() {
  return (
    <main className="page-shell">
      <header className="topbar" aria-label="Primary navigation">
        <a className="brand" href="/superpowering-with-files/" aria-label="Superpowering with Files home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>Superpowering with Files</span>
        </a>
        <nav className="nav-tabs" aria-label="Homepage sections">
          {navItems.map((item) => (
            <a key={item} href="https://github.com/ilderaj/superpowering-with-files/blob/main/README.md">{item}</a>
          ))}
        </nav>
        <a className="source-button" href="https://github.com/ilderaj/superpowering-with-files">View source</a>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-layout">
          <div className="hero-copy">
            <p className="kicker">Superpowers + Planning with Files</p>
            <h1 id="hero-title">Make deep agent work resumable.</h1>
            <p className="lede">
              Use Superpowers for hard judgment. Save the useful decisions in planning files, so humans and agents can
              pick up the work later.
            </p>
          </div>

          <aside className="hero-proof" aria-label="Hybrid workflow preview">
            <p className="proof-kicker">Hybrid workflow</p>
            <div className="proof-card">
              <div className="proof-header">
                <span>deep task lifecycle</span>
                <strong>think → record → resume</strong>
              </div>
              <div className="proof-files">
                {taskFiles.map((file) => (
                  <article className="proof-file" key={file.name}>
                    <div>
                      <h2>{file.name}</h2>
                      <p>{file.note}</p>
                    </div>
                    <span>{file.status}</span>
                  </article>
                ))}
              </div>
              <div className="proof-footer">
                <span>Copilot</span>
                <span>Codex</span>
                <span>Cursor</span>
                <span>Claude Code</span>
              </div>
            </div>
          </aside>
        </div>

        <div className="search-pill" aria-label="Project entry points">
          {searchSegments.map((segment) => (
            <a className="search-segment" key={segment.label} href="https://github.com/ilderaj/superpowering-with-files/blob/main/docs/workflows.md">
              <span>{segment.label}</span>
              <strong>{segment.value}</strong>
            </a>
          ))}
          <a className="search-action" href="https://github.com/ilderaj/superpowering-with-files" aria-label="Open repository">→</a>
        </div>

        <div className="comparison-strip" aria-label="Hybrid workflow comparison">
          {comparisons.map((item) => (
            <article className="comparison-item" key={item.label}>
              <span>{item.label}</span>
              <h2>{item.title}</h2>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="category-strip" aria-label="Core project areas">
        {categories.map((category) => (
          <a key={category.label} href="https://github.com/ilderaj/superpowering-with-files/blob/main/README.md">
            <span aria-hidden="true">{category.glyph}</span>
            {category.label}
          </a>
        ))}
      </section>

      <section className="card-section" aria-labelledby="card-title">
        <div className="section-heading">
          <h2 id="card-title">Built for deep tasks</h2>
          <a href="https://github.com/ilderaj/superpowering-with-files/blob/main/docs/workflows.md">Browse docs</a>
        </div>
        <div className="card-grid">
          {cards.map((card) => (
            <article className="workflow-card" key={card.title}>
              <div className={`card-art ${card.tone}`} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="card-copy">
                <div className="card-title-row">
                  <h3>{card.title}</h3>
                  <span>{card.meta}</span>
                </div>
                <p className="card-location">{card.location}</p>
                <p>{card.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="closing" aria-labelledby="closing-title">
        <div>
          <p className="kicker">Local prototype</p>
          <h2 id="closing-title">Reason deeply. Leave a readable trail.</h2>
        </div>
        <div className="link-row" aria-label="Project links">
          {links.map((link) => (
            <a key={link.label} href={link.href}>{link.label}</a>
          ))}
        </div>
      </section>
    </main>
  );
}
