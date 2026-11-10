// One view per role you're interviewing for: what's due today and the full
// prep plan. It only reads from your day plans and tasks, so everything you
// change on Today or This week shows up here too.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { localDate, fmtTime } from '../dates.js';
import ItemRow from './ItemRow.jsx';

const DAY_START_HOUR = 4;
const planDate = (now = new Date()) => localDate(new Date(+now - DAY_START_HOUR * 3_600_000));
const dayMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return ((h - DAY_START_HOUR + 24) % 24) * 60 + m;
};
const fmtHHMM = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return fmtTime(new Date(2000, 0, 1, h, m));
};
const fmtDate = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

export default function InterviewPrep({ data, reload }) {
  const [plans, setPlans] = useState(null);
  const loadPlans = () => api.get('/api/plans').then(setPlans);
  useEffect(() => {
    loadPlans();
  }, [data]);

  const roles = data.applications.filter((a) => a.status === 'interview');
  if (!plans) return <p className="empty-small">Loading…</p>;
  if (roles.length === 0) {
    return (
      <div className="page">
        <section className="card">
          <h2>Interview prep</h2>
          <p className="empty-small">No roles at the interview stage. Set an application's status to "interview" and it shows up here.</p>
        </section>
      </div>
    );
  }
  return (
    <div className="page">
      {roles.map((r) => (
        <Role key={r.id} role={r} plans={plans} items={data.items} reload={reload} onPlansChange={loadPlans} />
      ))}
    </div>
  );
}

function Role({ role, plans, items, reload, onPlansChange }) {
  const [showPast, setShowPast] = useState(false);
  const today = planDate();
  const keys = [role.name, ...(role.keywords || [])].map((k) => k.toLowerCase());
  const about = (text) => keys.some((k) => (text || '').toLowerCase().includes(k));

  // Prep blocks from every day plan, grouped by day.
  const days = Object.entries(plans)
    .map(([date, p]) => [date, (p.blocks || []).filter((b) => about(b.label) || about(b.notes)).sort((a, b) => dayMinutes(a.start) - dayMinutes(b.start))])
    .filter(([, blocks]) => blocks.length)
    .sort(([a], [b]) => a.localeCompare(b));
  const upcoming = days.filter(([d]) => d > today);
  const past = days.filter(([d]) => d < today);
  const todayBlocks = days.find(([d]) => d === today)?.[1] || [];

  const tasks = items.filter((i) => i.taskId && i.status !== 'done' && (about(i.title) || about(i.description)));
  const dueToday = tasks.filter((t) => t.when && t.when.slice(0, 10) <= today);
  const later = tasks.filter((t) => !dueToday.includes(t));

  const toggleTask = async (item, done) => {
    await api.patch(`/api/tasks/${item.taskId}`, { done });
    reload();
  };
  const toggleCheck = async (date, block, checkId) => {
    const plan = plans[date];
    const next = {
      ...plan,
      blocks: plan.blocks.map((b) => (b.id === block.id ? { ...b, checklist: b.checklist.map((c) => (c.id === checkId ? { ...c, done: !c.done } : c)) } : b)),
    };
    await api.put(`/api/plan/${date}`, next);
    onPlansChange();
  };

  const totalLeft = upcoming.reduce((n, [, b]) => n + b.length, 0);

  return (
    <>
      <section className="card card-accent">
        <div className="card-head">
          <div>
            <h2>{role.name}</h2>
            {role.role && <div className="muted">{role.role}</div>}
          </div>
          <span className="count">{role.status}</span>
        </div>
        {role.notes && <div className="prep-notes">{role.notes}</div>}
      </section>

      <div className="row row-main">
        <section className="card">
          <div className="card-head">
            <h2>Due today</h2>
            <span className="muted">{fmtDate(today)}</span>
          </div>
          {todayBlocks.length === 0 && dueToday.length === 0 && <p className="empty-small">Nothing for {role.name} today.</p>}
          {todayBlocks.map((b) => (
            <PrepBlock key={b.id} b={b} onCheck={(id) => toggleCheck(today, b, id)} />
          ))}
          {dueToday.map((t) => (
            <ItemRow key={t.id} item={t} onToggle={toggleTask} />
          ))}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Other {role.name} tasks</h2>
            <span className="count">{later.length}</span>
          </div>
          {later.length === 0 ? <p className="empty-small">None.</p> : later.map((t) => <ItemRow key={t.id} item={t} onToggle={toggleTask} />)}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Prep plan</h2>
          <span className="muted">{totalLeft} sessions left</span>
          {past.length > 0 && (
            <button className="btn btn-small" onClick={() => setShowPast(!showPast)}>
              {showPast ? 'Hide past days' : `Show ${past.length} past day${past.length > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
        <p className="hint">Blocks come from your Today page. Edit or move them there and this updates.</p>
        <div className="prep-days">
          {(showPast ? past : []).map(([date, blocks]) => (
            <PrepDay key={date} date={date} blocks={blocks} past onCheck={toggleCheck} />
          ))}
          {upcoming.map(([date, blocks]) => (
            <PrepDay key={date} date={date} blocks={blocks} onCheck={toggleCheck} />
          ))}
          {upcoming.length === 0 && <p className="empty-small">No future prep blocks yet.</p>}
        </div>
      </section>
    </>
  );
}

function PrepDay({ date, blocks, past = false, onCheck }) {
  return (
    <div className={`prep-day ${past ? 'prep-day-past' : ''}`}>
      <div className="prep-day-date">{fmtDate(date)}</div>
      {blocks.map((b) => (
        <PrepBlock key={b.id} b={b} onCheck={(id) => onCheck(date, b, id)} />
      ))}
    </div>
  );
}

function PrepBlock({ b, onCheck }) {
  return (
    <div className="prep-block">
      <div className="prep-block-head">
        <span className="prep-time">
          {fmtHHMM(b.start)}–{fmtHHMM(b.end)}
        </span>
        <strong>{b.label}</strong>
      </div>
      {b.notes && <div className="prep-block-notes">{b.notes}</div>}
      {b.checklist?.map((c) => (
        <label key={c.id} className={`check-row ${c.done ? 'check-row-done' : ''}`}>
          <input type="checkbox" checked={c.done} onChange={() => onCheck(c.id)} />
          <span className="check-text">{c.text}</span>
        </label>
      ))}
    </div>
  );
}
