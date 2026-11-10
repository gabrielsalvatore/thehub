import { useState } from 'react';
import { api } from '../api.js';
import { dueLabel } from '../dates.js';
import ItemRow from './ItemRow.jsx';

const STATUSES = ['researching', 'to apply', 'in progress', 'applied', 'interview', 'offer', 'accepted', 'rejected', 'not a fit'];

// Everything about grad school in one place: questions for you, what's coming
// up, one card per school (contacts, links, tasks, notes) and funding.
export default function GradSchool({ data, reload }) {
  const grad = data.grad || { resources: [], events: [], questions: [] };
  const schools = data.applications.filter((a) => a.type === 'grad');
  const tasks = data.items.filter((i) => i.category === 'grad' && i.taskId && i.status !== 'done');
  const [hideFit, setHideFit] = useState(true);

  const today = new Date().toISOString().slice(0, 10);
  const events = [...grad.events].filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const open = grad.questions.filter((q) => !q.done);

  const order = (s) => (s.status === 'researching' ? 99 : STATUSES.indexOf(s.status ?? 'researching'));
  const shown = [...schools].filter((s) => !hideFit || !['not a fit', 'rejected'].includes(s.status)).sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
  const hidden = schools.length - shown.length;

  // A task belongs to a school when its title names the school (or one of its keywords).
  const matches = (s, t) => [s.name, ...(s.keywords || [])].some((k) => k && t.title.toLowerCase().includes(k.toLowerCase()));
  const claimed = new Set();
  const tasksFor = (s) => tasks.filter((t) => matches(s, t) && claimed.add(t.id));
  const perSchool = Object.fromEntries(shown.map((s) => [s.id, tasksFor(s)]));
  const otherTasks = tasks.filter((t) => !claimed.has(t.id));

  const toggleTask = async (item, done) => {
    await api.patch(`/api/tasks/${item.taskId}`, { done });
    reload();
  };
  const updateSchool = async (s, patch) => {
    await api.patch(`/api/applications/${s.id}`, patch);
    reload();
  };

  return (
    <div className="page grad-page">
      {open.length > 0 && (
        <section className="card card-accent">
          <div className="card-head">
            <h2>Need your input</h2>
            <span className="count">{open.length}</span>
          </div>
          <p className="hint">Things from your photos and notes that weren't clear. Answer here and they'll be saved.</p>
          <div className="grad-questions">
            {open.map((q) => (
              <Question key={q.id} q={q} reload={reload} />
            ))}
          </div>
        </section>
      )}

      <div className="row row-main">
        <section className="card">
          <div className="card-head">
            <h2>Coming up</h2>
          </div>
          {events.length === 0 ? (
            <p className="empty-small">Nothing scheduled.</p>
          ) : (
            <ul className="grad-events">
              {events.map((e) => (
                <li key={e.id}>
                  <div className="grad-event-when">{dueLabel({ when: e.date, allDay: true })}{e.time ? ` · ${e.time}` : ''}</div>
                  <div className="grad-event-title">{e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.title}</a> : e.title}</div>
                  {e.notes && <Notes text={e.notes} />}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Other grad tasks</h2>
            <span className="count">{otherTasks.length}</span>
          </div>
          {otherTasks.length === 0 ? <p className="empty-small">All caught up.</p> : otherTasks.map((t) => <ItemRow key={t.id} item={t} onToggle={toggleTask} />)}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Schools</h2>
          {hidden > 0 || !hideFit ? (
            <button className="btn btn-small" onClick={() => setHideFit(!hideFit)}>
              {hideFit ? `Show ${hidden} not a fit` : 'Hide not a fit'}
            </button>
          ) : null}
        </div>
        <div className="grad-schools">
          {shown.map((s) => (
            <School key={s.id} s={s} tasks={perSchool[s.id]} onToggle={toggleTask} onUpdate={(p) => updateSchool(s, p)} />
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Funding and resources</h2>
        </div>
        <div className="grad-resources">
          {grad.resources.map((r) => (
            <div key={r.id} className="grad-resource">
              <div className="grad-resource-title">{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a> : r.title}</div>
              {r.notes && <Notes text={r.notes} />}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function School({ s, tasks, onToggle, onUpdate }) {
  const [notes, setNotes] = useState(s.notes || '');
  return (
    <article className="grad-school">
      <header className="grad-school-head">
        <div>
          <h3>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> : s.name}</h3>
          {s.role && <div className="muted">{s.role}</div>}
        </div>
        <select value={s.status || 'researching'} onChange={(e) => onUpdate({ status: e.target.value })} aria-label={`Status for ${s.name}`}>
          {STATUSES.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </header>

      {s.nextStep && (
        <p className="grad-next">
          <strong>Next:</strong> {s.nextStep}
        </p>
      )}

      <label className="grad-deadline">
        Deadline
        <input type="date" value={s.deadline || ''} onChange={(e) => onUpdate({ deadline: e.target.value || null })} />
        {s.deadline && <span className="muted">{dueLabel({ when: s.deadline, allDay: true })}</span>}
      </label>

      {s.contacts?.length > 0 && (
        <div className="grad-block">
          <div className="grad-label">Contacts</div>
          {s.contacts.map((c, i) => (
            <div key={i} className="grad-contact">
              <strong>{c.name}</strong>
              {c.role && <span className="muted"> · {c.role}</span>}
              <div className="grad-contact-links">
                {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
                {c.phone && <span>{c.phone}</span>}
                {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}
              </div>
              {c.note && <div className="muted small">{c.note}</div>}
            </div>
          ))}
        </div>
      )}

      {s.links?.length > 0 && (
        <div className="grad-block">
          <div className="grad-label">Links</div>
          <ul className="grad-links">
            {s.links.map((l, i) => (
              <li key={i}>
                <a href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="grad-block">
          <div className="grad-label">Tasks</div>
          {tasks.map((t) => (
            <ItemRow key={t.id} item={t} onToggle={onToggle} compact />
          ))}
        </div>
      )}

      <div className="grad-block">
        <div className="grad-label">Notes</div>
        <textarea
          className="grad-notes"
          value={notes}
          rows={Math.min(8, Math.max(2, notes.split('\n').length))}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (s.notes || '') && onUpdate({ notes })}
          placeholder="Anything to remember about this school"
        />
      </div>
    </article>
  );
}

function Question({ q, reload }) {
  const [answer, setAnswer] = useState(q.answer || '');
  const save = async (patch) => {
    await api.patch(`/api/grad/questions/${q.id}`, patch);
    reload();
  };
  return (
    <div className="grad-question">
      <div className="grad-question-text">{q.text}</div>
      {q.context && <div className="muted small">{q.context}</div>}
      <div className="grad-question-row">
        <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" aria-label={`Answer: ${q.text}`} />
        <button className="btn btn-small btn-primary" disabled={!answer.trim()} onClick={() => save({ answer: answer.trim(), done: true })}>
          Save
        </button>
        <button className="btn btn-small" onClick={() => save({ done: true })}>
          Skip
        </button>
      </div>
    </div>
  );
}

function Notes({ text }) {
  return <div className="grad-notes-text">{text}</div>;
}
