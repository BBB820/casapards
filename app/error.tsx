"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="shell login">
      <p className="eyebrow">Something went wrong</p>
      <h1>The calendar didn't load</h1>
      <p className="muted">
        Try again in a moment. If it keeps happening, open <a href="/api/health">/api/health</a> on this
        site: it lists what's misconfigured.
      </p>
      {error.digest && <p className="muted small">Error reference: {error.digest}</p>}
      <div className="row">
        <button className="primary" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
