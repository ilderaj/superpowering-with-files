const lanes = [
  { label: 'PLAN', value: 'tracked tasks', detail: 'Durable state in planning/active with findings and progress.' },
  { label: 'PROJECT', value: '4 IDEs', detail: 'Copilot, Codex, Cursor, and Claude Code get native instructions.' },
  { label: 'VERIFY', value: 'one gate', detail: 'Node tests, harness verify, doctor, and sync dry-runs stay visible.' },
  { label: 'RELEASE', value: 'main ready', detail: 'Human-reviewed promotion keeps cloud work out of local checkouts.' }
];

const features = [
  ['Planning with Files', 'A task-scoped memory layer that survives context resets and keeps decisions reviewable.'],
  ['Superpowers, Temporarily', 'Use deep workflow skills when they add value, then sync durable decisions back to files.'],
  ['Adapter Projection', 'Render one policy into each agent surface without letting the surfaces drift apart.'],
  ['Safety Overlay', 'Optional worktree-first guardrails for bypass, autopilot, and long-running sessions.']
];

const workflow = ['plan', 'review', 'verify', 'finish', 'release', 'archive'];

export default function App() {
  return (
    <main className="page-shell">
      <header className="topbar" aria-label="Primary navigation">
        <a className="brand" href="/superpowering-with-files/" aria-label="Superpowering with Files home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>SWF</span>
        </a>
        <nav className="nav-links" aria-label="Documentation links">
          <a href="https://github.com/ilderaj/superpowering-with-files">GitHub</a>
          <a href="https://github.com/ilderaj/superpowering-with-files/blob/main/README.md">README</a>
          <a href="https://github.com/ilderaj/superpowering-with-files/tree/main/docs">Docs</a>
        </nav>
      </header>

      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Agent workflow governance harness</p>
          <h1 id="hero-title">SUPERPOWERING WITH FILES</h1>
          <p className="hero-lede">
            A file-backed control plane for local and cloud coding agents: persistent plans,
            projected skills, optional safety, and verifiable release lanes.
          </p>
          <div className="hero-actions" aria-label="Primary actions">
            <a className="button button-primary" href="https://github.com/ilderaj/superpowering-with-files">
              View repository
            </a>
            <a className="button button-secondary" href="https://github.com/ilderaj/superpowering-with-files/blob/main/docs/workflows.md">
              Read workflows
            </a>
          </div>
        </div>
        <figure className="hero-visual">
          <img src="/superpowering-with-files/harness-console.svg" alt="Dark harness projection console" />
          <figcaption>Policy, planning, projection, and verification in one operator surface.</figcaption>
        </figure>
      </section>

      <section className="metrics-grid" aria-label="Harness lanes">
        {lanes.map((lane) => (
          <article className="metric-cell" key={lane.label}>
            <p>{lane.label}</p>
            <strong>{lane.value}</strong>
            <span>{lane.detail}</span>
          </article>
        ))}
      </section>

      <section className="split-section" aria-labelledby="system-title">
        <div>
          <p className="eyebrow">One policy, native surfaces</p>
          <h2 id="system-title">BUILT FOR AGENTIC WORK THAT HAS TO BE RESUMABLE</h2>
        </div>
        <div className="feature-grid">
          {features.map(([title, detail]) => (
            <article className="feature-card" key={title}>
              <h3>{title}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="workflow-band" aria-labelledby="workflow-title">
        <p className="eyebrow">Operator workflow</p>
        <h2 id="workflow-title">FROM REQUEST TO VERIFIED RELEASE</h2>
        <ol>
          {workflow.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="cta-band" aria-labelledby="cta-title">
        <div className="m-stripe" aria-hidden="true"><span /><span /><span /></div>
        <h2 id="cta-title">KEEP THE WORK REVIEWABLE</h2>
        <p>
          Harness keeps task memory, projection rules, and verification evidence close to the code.
        </p>
        <a className="text-link" href="https://github.com/ilderaj/superpowering-with-files/blob/main/docs/architecture.md">
          Explore architecture
        </a>
      </section>
    </main>
  );
}
