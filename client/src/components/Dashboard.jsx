import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { isDone } from '../categories.js';
import { dueTime, parseWhen, sameDay, addDays, startOfDay, fmtTime, relative } from '../dates.js';
import ItemRow from './ItemRow.jsx';
import Briefing from './Briefing.jsx';
import WeekGrid from './WeekGrid.jsx';
import Inbox from './Inbox.jsx';
import Habits from './Habits.jsx';
import QuickAdd from './QuickAdd.jsx';

export default function Dashboard({ data, reload, goTo }) {
  // Optimistic check-offs so the UI responds instantly while the server saves.
  const [overrides, setOverrides] = useState({});
  const items = useMemo(
    () => data.items.map((it) => (it.id in overrides ? { ...it, status: overrides[it.id] } : it)),
    [data.items, overrides],
  );

  const toggle = async (item, done) => {
    setOverrides((o) => ({ ...o, [item.id]: done ? 'done' : 'todo' }));
    if (item.taskId) await api.patch(`/api/tasks/${item.taskId}`, { done });
    else await api.post('/api/complete', { id: item.id, done });
    await reload();
    setOverrides({});
  };

  const deleteTask = async (item) => {
    await api.del(`/api/tasks/${item.taskId}`);
    reload();
  };

  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);

  const open = items.filter((it) => it.kind !== 'event' && it.when && !isDone(it));
  const overdue = open.filter((it) => it.status === 'missing' || dueTime(it) < now);
  const events = items.filter((it) => it.kind === 'event');
  const todayEvents = events.filter((it) => sameDay(parseWhen(it.when), now));
  const dueToday = open.filter((it) => !overdue.includes(it) && sameDay(parseWhen(it.when), now));
  const dueTomorrow = open.filter((it) => sameDay(parseWhen(it.when), tomorrow));
  const undated = items.filter((it) => it.kind === 'task' && !it.when && !isDone(it));

  const nextUp = events
    .filter((it) => !it.allDay)
    .find((it) => {
      const start = new Date(it.when);
      const end = it.end ? new Date(it.end) : new Date(+start + 3_600_000);
      return end > now && +start - +now < 3 * 3_600_000;
    });

  return (
    <div className="dashboard">
      {nextUp && <NextUp event={nextUp} now={now} />}

      {overdue.length > 0 && (
        <section className="card card-danger">
          <h2>
            Overdue <span className="count">{overdue.length}</span>
          </h2>
          <p className="hint">Check these off if they're handled, or open them and get them in today.</p>
          <div className="list">
            {overdue.map((it) => (
              <ItemRow key={it.id} item={it} onToggle={toggle} />
            ))}
          </div>
        </section>
      )}

      <div className="row row-main">
        <Briefing aiStatus={data.sources.ai} generatedAt={data.generatedAt} goTo={goTo} />
        <section className="card">
          <h2>Today</h2>
          {todayEvents.length === 0 && dueToday.length === 0 && <p className="empty-small">Nothing scheduled or due today.</p>}
          {todayEvents.length > 0 && (
            <>
              <h3>Schedule</h3>
              <div className="list">
                {todayEvents.map((it) => (
                  <ItemRow key={it.id} item={it} />
                ))}
              </div>
            </>
          )}
          {dueToday.length > 0 && (
            <>
              <h3>Due today</h3>
              <div className="list">
                {dueToday.map((it) => (
                  <ItemRow key={it.id} item={it} onToggle={toggle} />
                ))}
              </div>
            </>
          )}
          {dueTomorrow.length > 0 && (
            <>
              <h3>Due tomorrow</h3>
              <div className="list">
                {dueTomorrow.map((it) => (
                  <ItemRow key={it.id} item={it} onToggle={toggle} />
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <WeekGrid items={items} onToggle={toggle} range={data.range} />

      <div className="row row-three">
        <Inbox emails={data.emails} sources={data.sources} reload={reload} goTo={goTo} />
        <Habits habits={data.habits} habitLog={data.habitLog} reload={reload} />
        <section className="card">
          <h2>Add a task</h2>
          <QuickAdd onAdded={reload} />
          {undated.length > 0 && (
            <>
              <h3>No date yet</h3>
              <div className="list">
                {undated.map((it) => (
                  <ItemRow key={it.id} item={it} onToggle={toggle} onDelete={deleteTask} showDate={false} />
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function NextUp({ event, now }) {
  const start = new Date(event.when);
  const live = start <= now;
  return (
    <div className={`nextup ${live ? 'nextup-live' : ''}`}>
      <div>
        <div className="nextup-label">{live ? 'Happening now' : `Next up · ${relative(start, now)}`}</div>
        <div className="nextup-title">{event.title}</div>
        <div className="nextup-meta">
          {fmtTime(start)}
          {event.end && `–${fmtTime(new Date(event.end))}`}
          {event.location && event.location !== event.joinUrl && ` · ${event.location}`}
        </div>
      </div>
      {event.joinUrl ? (
        <a className="btn btn-primary" href={event.joinUrl} target="_blank" rel="noreferrer">
          Join meeting
        </a>
      ) : (
        event.url && (
          <a className="btn" href={event.url} target="_blank" rel="noreferrer">
            Open
          </a>
        )
      )}
    </div>
  );
}
