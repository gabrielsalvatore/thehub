import { useState } from 'react';
import { CATEGORIES, isDone } from '../categories.js';
import { addDays, fmtDay, parseWhen, sameDay, startOfWeek } from '../dates.js';
import ItemRow from './ItemRow.jsx';

export default function WeekGrid({ items, onToggle, range }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek());
  const [hidden, setHidden] = useState(() => new Set());
  const [showDone, setShowDone] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const canPrev = addDays(weekStart, -7) >= startOfWeek(new Date(range.start));
  const canNext = addDays(weekStart, 7) < new Date(range.end);
  const isThisWeek = sameDay(weekStart, startOfWeek());

  const visible = items.filter((it) => it.when && !hidden.has(it.category) && (showDone || it.kind === 'event' || !isDone(it)));
  const present = new Set(items.map((it) => it.category));

  const toggleCat = (c) =>
    setHidden((h) => {
      const next = new Set(h);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });

  return (
    <section className="card">
      <div className="card-head week-head">
        <div className="week-nav">
          <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, -7))} disabled={!canPrev} aria-label="Previous week">
            ‹
          </button>
          <h2>{isThisWeek ? 'This week' : `Week of ${fmtDay(weekStart, { month: 'short', day: 'numeric' })}`}</h2>
          <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} disabled={!canNext} aria-label="Next week">
            ›
          </button>
          {!isThisWeek && (
            <button className="btn btn-small btn-ghost" onClick={() => setWeekStart(startOfWeek())}>
              Today
            </button>
          )}
        </div>
        <div className="filters">
          {Object.entries(CATEGORIES)
            .filter(([key]) => present.has(key))
            .map(([key, cat]) => (
              <button
                key={key}
                className={`chip ${hidden.has(key) ? 'chip-off' : ''}`}
                style={{ '--cat': cat.color }}
                onClick={() => toggleCat(key)}
                aria-pressed={!hidden.has(key)}
              >
                {cat.label}
              </button>
            ))}
          <label className="toggle">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show done
          </label>
        </div>
      </div>
      <div className="week">
        {days.map((day) => {
          const dayItems = visible.filter((it) => sameDay(parseWhen(it.when), day));
          const events = dayItems.filter((it) => it.kind === 'event');
          const work = dayItems.filter((it) => it.kind !== 'event');
          const isToday = sameDay(day, new Date());
          return (
            <div key={day.toISOString()} className={`day ${isToday ? 'day-today' : ''}`}>
              <div className="day-head">
                <span className="day-name">{fmtDay(day, { weekday: 'short' })}</span>
                <span className="day-num">{day.getDate()}</span>
                {work.length > 0 && <span className="day-load" title={`${work.length} due`}>{work.length} due</span>}
              </div>
              {work.map((it) => (
                <ItemRow key={it.id} item={it} onToggle={onToggle} compact showDate={false} />
              ))}
              {events.map((it) => (
                <ItemRow key={it.id} item={it} compact />
              ))}
              {dayItems.length === 0 && <div className="day-empty">Free</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
