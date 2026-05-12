const comparisons = [
  {
    label: 'Only breadth',
    title: 'State, no sharper thinking.',
    detail: 'Files survive, but every call is still ad hoc.'
  },
  {
    label: 'Only depth',
    title: 'Sharper calls, no memory.',
    detail: 'The agent reasons well, then the context fades.'
  },
  {
    label: 'Both',
    title: 'Depth becomes state.',
    detail: 'Tracked tasks earn planning; complex ones earn superpowers.'
  }
];

const links = [
  { label: 'GitHub', href: 'https://github.com/ilderaj/superpowering-with-files' },
  { label: 'Docs', href: 'https://github.com/ilderaj/superpowering-with-files/blob/main/docs/workflows.md' }
];

export default function App() {
  return (
    <main className="page-shell">
      <header className="topbar" aria-label="Primary navigation">
        <a className="brand" href="/superpowering-with-files/" aria-label="Superpowering with Files home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>Superpowering with Files</span>
        </a>
        <a className="source-button" href="https://github.com/ilderaj/superpowering-with-files">View source</a>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-layout">
          <div className="hero-copy">
            <p className="kicker">Planning with Files × Superpowers</p>
            <h1 id="hero-title">Breadth and depth, in the same workflow.</h1>
            <p className="lede">
              Plans, findings, and progress live in files any agent can read. Hard calls slow down through Superpowers
              skills, only when the task earns it.
            </p>
          </div>

          <aside className="hero-proof" aria-label="Hybrid workflow preview">
            <div className="proof-card">
              <div className="proof-pair">
                <article className="proof-side">
                  <span className="proof-tag">Breadth</span>
                  <h2>planning files</h2>
                  <p>Durable memory across agents and sessions.</p>
                </article>
                <span className="proof-op" aria-hidden="true">+</span>
                <article className="proof-side">
                  <span className="proof-tag">Depth</span>
                  <h2>superpowers</h2>
                  <p>Hard judgment, only when earned.</p>
                </article>
              </div>
              <div className="proof-merge">
                <span className="proof-op proof-op--eq" aria-hidden="true">=</span>
                <div className="proof-merge-copy">
                  <span className="proof-tag proof-tag--accent">Hybrid</span>
                  <h2>One workflow, routed by complexity.</h2>
                </div>
              </div>
            </div>
          </aside>
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

      <section className="closing" aria-labelledby="closing-title">
        <h2 id="closing-title">Route by complexity. Keep the trail.</h2>
        <div className="link-row" aria-label="Project links">
          {links.map((link) => (
            <a key={link.label} href={link.href}>{link.label}</a>
          ))}
        </div>
      </section>
    </main>
  );
}
