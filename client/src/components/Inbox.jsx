import { useState } from 'react';
import { api } from '../api.js';
import { relative } from '../dates.js';

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

function senderName(from) {
  const m = from.match(/^"?([^"<]+?)"?\s*</);
  return m ? m[1] : from;
}

export default function Inbox({ emails, sources, reload, goTo }) {
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(null);
  const connected = ['ok', 'warning'].includes(sources.google.status) || ['ok', 'warning'].includes(sources.outlook.status);
  const triaged = emails.some((e) => e.triage);

  const action = emails
    .filter((e) => e.triage?.needs_action)
    .sort((a, b) => PRIORITY_ORDER[a.triage.priority] - PRIORITY_ORDER[b.triage.priority]);
  const shown = triaged && !showAll ? action : emails;

  const dismiss = async (email) => {
    setBusy(email.id);
    await api.post('/api/emails/dismiss', { id: email.id });
    await reload();
    setBusy(null);
  };

  const toTask = async (email) => {
    setBusy(email.id);
    await api.post('/api/tasks', {
      title: email.triage?.suggested_task || `Reply: ${email.subject}`,
      category: 'personal',
      due: email.triage?.deadline || null,
      notes: `From email: ${email.subject}`,
    });
    await api.post('/api/emails/dismiss', { id: email.id });
    await reload();
    setBusy(null);
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>
          Inbox {triaged && <span className="count">{action.length} need you</span>}
        </h2>
        {triaged && emails.length > action.length && (
          <button className="btn btn-small btn-ghost" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Action only' : `All unread (${emails.length})`}
          </button>
        )}
      </div>
      {!connected && (
        <p className="hint">
          Connect Gmail and Outlook to see unread mail here.{' '}
          <button className="link" onClick={() => goTo('sources')}>
            Set up sources
          </button>
        </p>
      )}
      {connected && shown.length === 0 && <p className="empty-small">{triaged ? 'Nothing needs a reply right now.' : 'Inbox zero. Nice.'}</p>}
      <div className="list">
        {shown.slice(0, 15).map((e) => (
          <div key={e.id} className={`email ${e.triage?.priority === 'high' ? 'email-high' : ''}`}>
            <div className="email-top">
              <span className="email-from">{senderName(e.from)}</span>
              <span className="muted">
                {e.source === 'gmail' ? 'Gmail' : 'Outlook'} · {relative(new Date(e.receivedAt))}
              </span>
            </div>
            <a className="email-subject" href={e.url} target="_blank" rel="noreferrer">
              {e.subject}
            </a>
            <div className="email-summary">{e.triage?.summary || e.snippet}</div>
            {e.triage?.deadline && <div className="badge badge-warn">Deadline: {e.triage.deadline}</div>}
            <div className="email-actions">
              {e.triage?.needs_action && (
                <button className="btn btn-small" onClick={() => toTask(e)} disabled={busy === e.id}>
                  + Add as task
                </button>
              )}
              <button className="btn btn-small btn-ghost" onClick={() => dismiss(e)} disabled={busy === e.id}>
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
