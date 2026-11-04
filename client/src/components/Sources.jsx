import { api } from '../api.js';

const STATUS_TEXT = {
  ok: 'Connected',
  warning: 'Connected (with warnings)',
  error: 'Error',
  not_connected: 'Ready to connect',
  not_configured: 'Not set up',
};

const SOURCES = [
  {
    key: 'canvas',
    name: 'Canvas',
    what: 'Assignments, quizzes and due dates from all your courses, including what is missing or submitted.',
    setup: (
      <>
        In Canvas: <b>Account → Settings → + New Access Token</b>. Put your school's Canvas URL and the token in <code>.env</code> as{' '}
        <code>CANVAS_BASE_URL</code> and <code>CANVAS_TOKEN</code>, then restart Hub.
      </>
    ),
  },
  {
    key: 'google',
    name: 'Google Calendar + Gmail',
    oauth: 'google',
    what: 'Your calendar events (with Meet/Zoom join links) and unread Gmail.',
    setup: (
      <>
        Create an OAuth client in Google Cloud Console and add <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code> to{' '}
        <code>.env</code>. The README has exact steps.
      </>
    ),
  },
  {
    key: 'outlook',
    name: 'Outlook.com',
    oauth: 'microsoft',
    what: 'Your Outlook calendar and unread Focused inbox.',
    setup: (
      <>
        Register an app in the Microsoft Entra admin center and add <code>MICROSOFT_CLIENT_ID</code> / <code>MICROSOFT_CLIENT_SECRET</code> to{' '}
        <code>.env</code>. No Azure access? Publish your Outlook calendar as an ICS link and use Calendar feeds below.
      </>
    ),
  },
  {
    key: 'ics',
    name: 'Calendar feeds (.ics)',
    what: 'Any calendar link: Outlook published calendars, Canvas calendar feed, clubs, sports.',
    setup: (
      <>
        Add <code>ICS_FEEDS="Name|https://…ics,Other|https://…ics"</code> to <code>.env</code>.
      </>
    ),
  },
  {
    key: 'ai',
    name: 'Claude AI',
    what: 'Daily briefing, inbox triage (which emails need you), and syllabus reading.',
    setup: (
      <>
        Create an API key at <b>platform.claude.com</b> and add <code>ANTHROPIC_API_KEY</code> to <code>.env</code>.
      </>
    ),
  },
];

export default function Sources({ sources, reload }) {
  const params = new URLSearchParams(location.search);
  const connected = params.get('connected');
  const oauthError = params.get('error');

  const disconnect = async (provider) => {
    await api.post(`/api/disconnect/${provider}`);
    reload(true);
  };

  return (
    <div className="page">
      {connected && <div className="banner banner-ok">Connected {connected === 'microsoft' ? 'Outlook' : 'Google'}. Your data will appear on the weekly view.</div>}
      {oauthError && <div className="banner banner-danger">Connection failed: {oauthError}</div>}
      <section className="card">
        <h2>Sources</h2>
        <p className="hint">
          Everything stays on this computer: tokens and your data are stored in <code>data/db.json</code>, and the server only listens on localhost.
        </p>
        <div className="sources">
          {SOURCES.map((s) => {
            const st = sources[s.key] || { status: 'not_configured' };
            return (
              <div key={s.key} className="source">
                <div className="source-head">
                  <span className={`status-dot status-${st.status}`} aria-hidden />
                  <h3>{s.name}</h3>
                  <span className="muted">{STATUS_TEXT[st.status]}</span>
                </div>
                <p>{s.what}</p>
                {s.key === 'ics' && sources.ics?.feeds?.length > 0 && <p className="muted">Feeds: {sources.ics.feeds.join(', ')}</p>}
                {st.message && <p className="error-text">{st.message}</p>}
                {st.status === 'not_configured' && <p className="hint">{s.setup}</p>}
                {s.oauth && st.status === 'not_connected' && (
                  <a className="btn btn-primary" href={`/auth/${s.oauth}`}>
                    Connect
                  </a>
                )}
                {s.oauth && ['ok', 'warning', 'error'].includes(st.status) && (
                  <div className="actions">
                    {st.status === 'error' && (
                      <a className="btn btn-primary" href={`/auth/${s.oauth}`}>
                        Reconnect
                      </a>
                    )}
                    <button className="btn btn-ghost" onClick={() => disconnect(s.oauth)}>
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
