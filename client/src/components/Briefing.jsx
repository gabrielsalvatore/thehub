import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Briefing({ aiStatus, generatedAt, goTo }) {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const enabled = aiStatus.status !== 'not_configured';

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      setBriefing(await api.get(`/api/briefing${force ? '?force=1' : ''}`));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-check whenever the dashboard reloads (cheap: the server caches per day).
  useEffect(() => {
    if (enabled) load();
  }, [enabled, generatedAt, load]);

  if (!enabled) {
    return (
      <section className="card card-accent">
        <h2>Your week, summarized</h2>
        <p className="hint">
          Add an <code>ANTHROPIC_API_KEY</code> to <code>.env</code> and Hub will write you a short daily plan, flag emails that need action,
          and read your syllabi for due dates.
        </p>
        <button className="btn" onClick={() => goTo('sources')}>
          See setup
        </button>
      </section>
    );
  }

  return (
    <section className="card card-accent">
      <div className="card-head">
        <h2>Your week, summarized</h2>
        <button className="btn btn-small btn-ghost" onClick={() => load(true)} disabled={loading}>
          {loading ? 'Thinking…' : briefing?.stale ? 'Update (things changed)' : 'Regenerate'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {!briefing && loading && <p className="empty-small">Reading everything on your plate…</p>}
      {briefing && (
        <div className="briefing">
          <p className="briefing-headline">{briefing.headline}</p>
          {briefing.today?.length > 0 && (
            <>
              <h3>Focus today</h3>
              <ol className="briefing-list">
                {briefing.today.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
            </>
          )}
          {briefing.watch_out?.length > 0 && (
            <>
              <h3>Watch out</h3>
              <ul className="briefing-list briefing-warn">
                {briefing.watch_out.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </>
          )}
          {briefing.plan?.length > 0 && (
            <>
              <h3>Rest of the week</h3>
              <dl className="briefing-plan">
                {briefing.plan.map((p, i) => (
                  <div key={i}>
                    <dt>{p.day}</dt>
                    <dd>{p.focus}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {briefing.encouragement && <p className="briefing-note">{briefing.encouragement}</p>}
        </div>
      )}
    </section>
  );
}
