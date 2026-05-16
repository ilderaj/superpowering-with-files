import { homepageContent } from './homepage-content.mjs';

export default function App() {
  return (
    <main className="page-shell">
      <header className="topbar" aria-label="Primary navigation">
        <a className="brand" href={homepageContent.topbar.brandHref} aria-label="Superpowering with Files home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>{homepageContent.topbar.brandLabel}</span>
        </a>

        <nav className="topbar-links" aria-label="Topbar links">
          {homepageContent.topbar.links.map((link) => (
            <a key={link.label} href={link.href}>{link.label}</a>
          ))}
        </nav>
      </header>

      <section className="hero" aria-labelledby={homepageContent.hero.headingId}>
        <div className="hero-layout">
          <div className="hero-copy">
            <p className="kicker">{homepageContent.hero.kicker}</p>
            <h1 id={homepageContent.hero.headingId}>{homepageContent.hero.headline}</h1>
            <p className="lede">{homepageContent.hero.lede}</p>

            <div className="hero-actions" aria-label="Primary actions">
              {homepageContent.hero.actions.map((action, index) => (
                <a
                  key={action.label}
                  className={index === 0 ? 'hero-button hero-button--primary' : 'hero-button'}
                  href={action.href}
                >
                  {action.label}
                </a>
              ))}
            </div>
          </div>

          <aside className="hero-proof" aria-label="Hybrid workflow proof">
            <div className="hero-equation">
              <article className="equation-card">
                <span className="equation-label">{homepageContent.proof.breadth.label}</span>
                <h2>{homepageContent.proof.breadth.title}</h2>
                <p>{homepageContent.proof.breadth.detail}</p>
              </article>

              <span className="equation-operator" aria-hidden="true">+</span>

              <article className="equation-card">
                <span className="equation-label">{homepageContent.proof.depth.label}</span>
                <h2>{homepageContent.proof.depth.title}</h2>
                <p>{homepageContent.proof.depth.detail}</p>
              </article>
            </div>

            <article className="equation-result">
              <span className="equation-label equation-label--accent">{homepageContent.proof.hybrid.label}</span>
              <h2>{homepageContent.proof.hybrid.title}</h2>
              <p>{homepageContent.proof.hybrid.detail}</p>
            </article>
          </aside>
        </div>
      </section>

      <section className="comparison" aria-labelledby="comparison-title">
        <div className="section-shell">
          <h2 id="comparison-title" className="sr-only">Hybrid comparison</h2>
          <div className="comparison-strip">
            {homepageContent.comparison.map((item) => (
              <article className="comparison-item" key={item.label}>
                <span>{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="routing" aria-labelledby={homepageContent.routing.headingId}>
        <div className="section-shell routing-grid">
          <div className="section-heading">
            <p className="section-eyebrow">{homepageContent.routing.eyebrow}</p>
            <h2 id={homepageContent.routing.headingId}>{homepageContent.routing.title}</h2>
            <p className="section-body">{homepageContent.routing.body}</p>
          </div>

          <ul className="routing-list">
            {homepageContent.routing.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="repo-proof" aria-labelledby={homepageContent.repoProof.headingId}>
        <div className="section-shell repo-proof-grid">
          <div className="section-heading">
            <p className="section-eyebrow">{homepageContent.repoProof.eyebrow}</p>
            <h2 id={homepageContent.repoProof.headingId}>{homepageContent.repoProof.title}</h2>
            <p className="section-body">{homepageContent.repoProof.body}</p>
          </div>

          <div className="repo-proof-list">
            {homepageContent.repoProof.items.map((item) => (
              <article className="repo-proof-item" key={item.label}>
                <span>{item.label}</span>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="closing" aria-labelledby={homepageContent.closing.headingId}>
        <div className="section-shell closing-layout">
          <h2 id={homepageContent.closing.headingId}>{homepageContent.closing.title}</h2>
          <div className="link-row" aria-label="Project links">
            {homepageContent.closing.links.map((link) => (
              <a key={link.label} href={link.href}>{link.label}</a>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
