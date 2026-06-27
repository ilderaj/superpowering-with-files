import { homepageContent, homepageSectionOrder } from './homepage-content.mjs';

export default function App() {
  const sectionContent = {
    hero: (
      <header key="hero" className="hero shell" aria-labelledby={homepageContent.hero.headingId}>
        <div className="hero-grid">
          <div>
            <div className="eyebrow">
              <span className="pulse" aria-hidden="true"></span>
              {homepageContent.hero.eyebrow}
            </div>
            <h1 id={homepageContent.hero.headingId}>{homepageContent.hero.headline}</h1>
            <p className="hero-copy">{homepageContent.hero.lede}</p>
            <div className="hero-actions" aria-label="Primary actions">
              {homepageContent.hero.actions.map((action) => (
                <a
                  key={action.label}
                  className={`button ${action.variant === 'primary' ? 'primary' : 'secondary'}`}
                  href={action.href}
                  target={action.external ? '_blank' : undefined}
                  rel={action.external ? 'noreferrer' : undefined}
                >
                  {action.label}
                </a>
              ))}
            </div>
          </div>

          <aside className="product-card" aria-label="Harness proof surface">
            <div className="proof-row" aria-label="Homepage proof points">
              {homepageContent.hero.proofPoints.map((point) => (
                <div className="proof" key={point.label}>
                  <strong>{point.value}</strong>
                  <span>{point.label}</span>
                </div>
              ))}
            </div>

            <div className="terminal">
              <div className="terminal-top">
                <div className="dots" aria-hidden="true">
                  <i></i>
                  <i></i>
                  <i></i>
                </div>
                <span>{homepageContent.hero.terminal.title}</span>
              </div>
              <div className="terminal-body">
                {homepageContent.hero.terminal.lines.map((line, index) => {
                  if (line.tone === 'break') {
                    return <br key={`break-${index}`} />;
                  }

                  return (
                    <div key={`${line.text}-${index}`} className={line.tone}>
                      {line.prefix ? <span className="cmd">{line.prefix}</span> : null}
                      {line.prefix ? ' ' : null}
                      {line.text}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="route-card">
              <div className="route-title">
                {homepageContent.hero.route.title}
                <span className="pill">{homepageContent.hero.route.badge}</span>
              </div>
              <div className="flow">
                {homepageContent.hero.route.steps.map((step) => (
                  <div className="flow-step" key={step.number}>
                    <span className="num">{step.number}</span>
                    <span>
                      <strong>{step.title}</strong>
                      {step.body}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </header>
    ),
    problem: (
      <section key="problem" id={homepageContent.problem.id} className="shell" aria-labelledby="problem-title">
        <div className="section-head">
          <span className="kicker">{homepageContent.problem.kicker}</span>
          <h2 id="problem-title">{homepageContent.problem.title}</h2>
          <p>{homepageContent.problem.body}</p>
        </div>
        <div className="problem-grid">
          <div className="quote-card">
            <h3>{homepageContent.problem.quoteTitle}</h3>
            <p>{homepageContent.problem.quoteBody}</p>
          </div>
          <div className="pain-list">
            {homepageContent.problem.pains.map((pain) => (
              <article className="pain" key={pain.title}>
                <div className="icon">{pain.icon}</div>
                <h3>{pain.title}</h3>
                <p>{pain.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    ),
    system: (
      <section key="system" id={homepageContent.system.id} className="shell" aria-labelledby="system-title">
        <div className="section-head">
          <span className="kicker">{homepageContent.system.kicker}</span>
          <h2 id="system-title">{homepageContent.system.title}</h2>
          <p>{homepageContent.system.body}</p>
        </div>
        <div className="system">
          <div className="system-grid">
            {homepageContent.system.modules.map((module) => (
              <article className="module" key={module.title}>
                <small>{module.label}</small>
                <h3>{module.title}</h3>
                <p>{module.body}</p>
              </article>
            ))}
          </div>
          <div className="lanes" aria-label="Routing lanes">
            {homepageContent.system.lanes.map((lane) => (
              <div className="lane" key={lane}>
                {lane}
              </div>
            ))}
          </div>
        </div>
      </section>
    ),
    workflow: (
      <section key="workflow" id={homepageContent.workflow.id} className="shell" aria-labelledby="workflow-title">
        <div className="section-head">
          <span className="kicker">{homepageContent.workflow.kicker}</span>
          <h2 id="workflow-title">{homepageContent.workflow.title}</h2>
        </div>
        <div className="split">
          {homepageContent.workflow.tracks.map((track) => (
            <article className="feature-card" key={track.title}>
              <h3>{track.title}</h3>
              <p>{track.body}</p>
              <div className="matrix">
                {track.rows.map((row, rowIndex) => (
                  <div className="matrix-row" key={`${track.title}-${rowIndex}`}>
                    {row.map((cell) => (
                      <div className="matrix-cell" key={cell.title}>
                        <strong>{cell.title}</strong>
                        {cell.body}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    ),
    start: (
      <section key="start" id={homepageContent.start.id} className="shell" aria-labelledby="start-title">
        <div className="split">
          <div className="section-head">
            <span className="kicker">{homepageContent.start.kicker}</span>
            <h2 id="start-title">{homepageContent.start.title}</h2>
            <p>{homepageContent.start.body}</p>
          </div>
          <div className="install-card">
            <h3>{homepageContent.start.quickStartTitle}</h3>
            <p>{homepageContent.start.quickStartBody}</p>
            <div className="code-block" id="cli-proof">
              {homepageContent.start.commands.map((command) => (
                <div key={command}>{command}</div>
              ))}
            </div>
          </div>
        </div>
        <div className="cta">
          <div>
            <h2>{homepageContent.start.cta.title}</h2>
            <p>{homepageContent.start.cta.body}</p>
          </div>
          <div className="cta-actions">
            <a
              className="button primary"
              href={homepageContent.start.cta.action.href}
              target={homepageContent.start.cta.action.external ? '_blank' : undefined}
              rel={homepageContent.start.cta.action.external ? 'noreferrer' : undefined}
            >
              {homepageContent.start.cta.action.label}
            </a>
            <a
              className="button secondary"
              href={homepageContent.start.cta.secondaryAction.href}
              target={homepageContent.start.cta.secondaryAction.external ? '_blank' : undefined}
              rel={homepageContent.start.cta.secondaryAction.external ? 'noreferrer' : undefined}
            >
              {homepageContent.start.cta.secondaryAction.label}
            </a>
          </div>
        </div>
      </section>
    )
  };

  return (
    <>
      <nav className="nav shell" aria-label="Main navigation">
        <a className="brand" href={homepageContent.topbar.brandHref} aria-label="Superpowering With Files home">
          <span className="mark">SWF</span>
          <span>{homepageContent.topbar.brandLabel}</span>
        </a>
        <div className="nav-links">
          {homepageContent.topbar.links.map((link) => (
            <a key={link.label} href={link.href}>
              {link.label}
            </a>
          ))}
          <a href={homepageContent.topbar.github.href} target="_blank" rel="noreferrer">
            {homepageContent.topbar.github.label}
          </a>
        </div>
        <a
          className="button primary"
          href={homepageContent.topbar.cta.href}
          target={homepageContent.topbar.cta.external ? '_blank' : undefined}
          rel={homepageContent.topbar.cta.external ? 'noreferrer' : undefined}
        >
          {homepageContent.topbar.cta.label}
        </a>
      </nav>

      <main id="top">
        {homepageSectionOrder.map((sectionKey) => sectionContent[sectionKey as keyof typeof sectionContent])}
      </main>

      <footer className="shell">
        <div className="footer-row">
          <span>{homepageContent.footer.left}</span>
          <div className="footer-links">
            <span>{homepageContent.footer.right}</span>
            <a href={homepageContent.footer.github.href} target="_blank" rel="noreferrer">
              {homepageContent.footer.github.label}
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
