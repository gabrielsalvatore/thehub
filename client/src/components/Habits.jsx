import { useState } from 'react';
import { api } from '../api.js';
import { addDays, localDate, startOfWeek, fmtDay } from '../dates.js';

function streak(habitId, log) {
  let count = 0;
  let day = new Date();
  // Today not done yet doesn't break the streak.
  if (!log[localDate(day)]?.[habitId]) day = addDays(day, -1);
  while (log[localDate(day)]?.[habitId]) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}

export default function Habits({ habits, habitLog, reload }) {
  const [log, setLog] = useState(habitLog);
  const [adding, setAdding] = useState('');
  const [editing, setEditing] = useState(false);
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(), i));
  const today = localDate();

  const toggle = async (date, habitId) => {
    setLog((l) => ({ ...l, [date]: { ...l[date], [habitId]: !l[date]?.[habitId] } }));
    setLog(await api.post('/api/habits/toggle', { date, habitId }));
  };

  const add = async (e) => {
    e.preventDefault();
    if (!adding.trim()) return;
    await api.post('/api/habits', { name: adding });
    setAdding('');
    reload();
  };

  const remove = async (h) => {
    if (!confirm(`Remove habit "${h.name}"?`)) return;
    await api.del(`/api/habits/${h.id}`);
    reload();
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>Habits</h2>
        <button className="btn btn-small btn-ghost" onClick={() => setEditing(!editing)}>
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>
      <table className="habits">
        <thead>
          <tr>
            <th />
            {days.map((d) => (
              <th key={d.toISOString()} className={localDate(d) === today ? 'habit-today' : ''}>
                {fmtDay(d, { weekday: 'narrow' })}
              </th>
            ))}
            <th title="Current streak">🔥</th>
          </tr>
        </thead>
        <tbody>
          {habits.map((h) => (
            <tr key={h.id}>
              <td className="habit-name">
                {editing && (
                  <button className="icon-btn" onClick={() => remove(h)} aria-label={`Remove ${h.name}`}>
                    ×
                  </button>
                )}
                {h.name}
              </td>
              {days.map((d) => {
                const date = localDate(d);
                const future = date > today;
                return (
                  <td key={date}>
                    <button
                      className={`habit-cell ${log[date]?.[h.id] ? 'habit-on' : ''}`}
                      disabled={future}
                      onClick={() => toggle(date, h.id)}
                      aria-label={`${h.name} on ${fmtDay(d)}`}
                      aria-pressed={Boolean(log[date]?.[h.id])}
                    />
                  </td>
                );
              })}
              <td className="habit-streak">{streak(h.id, log) || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <form className="inline-form" onSubmit={add}>
          <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="New habit, e.g. Read 20 min" />
          <button className="btn btn-small">Add</button>
        </form>
      )}
    </section>
  );
}
