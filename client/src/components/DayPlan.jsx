// "How I plan my day": Step 1 pick the top 3 things that must happen today,
// Step 2 time-block them, Step 3 do it. One plan per date, saved locally.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { isDone } from '../categories.js';
import { localDate, parseWhen, dueTime, addDays, dueLabel, fmtTime } from '../dates.js';

// The planning day starts at 4 AM, so working past midnight still counts as today.
const DAY_START_HOUR = 4;

function planDateFor(now = new Date()) {
  return localDate(new Date(+now - DAY_START_HOUR * 3_600_000));
}

// Minutes since the start of the planning day, so 00:30 sorts after 23:00.
function dayMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return ((h - DAY_START_HOUR + 24) % 24) * 60 + m;
}

function toHHMM(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtHHMM(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return fmtTime(new Date(2000, 0, 1, h, m));
}

function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m + mins);
  return toHHMM(d);
}

function dateObj(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const newId = () => crypto.randomUUID();

export default function DayPlan({ data, reload }) {
  const [date, setDate] = useState(planDateFor);
  const [plan, setPlan] = useState(null);
  const [now, setNow] = useState(new Date());
  const [openId, setOpenId] = useState(null); // block or event shown in the details pop-up
  const saveTimer = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setPlan(null);
    api.get(`/api/plan/${date}`).then(setPlan);
  }, [date]);

  const change = (next) => {
    setPlan(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => api.put(`/api/plan/${date}`, next), 400);
  };

  const isToday = date === planDateFor(now);
  const day = dateObj(date);

  // Suggestions: open tasks and assignments that are overdue or due within 2 days.
  const suggestions = useMemo(() => {
    const horizon = addDays(day, 3);
    const chosen = new Set((plan?.top || []).map((t) => t.itemId));
    return data.items
      .filter((it) => it.kind !== 'event' && !isDone(it) && !chosen.has(it.id))
      .filter((it) => {
        const due = dueTime(it);
        return due ? due < horizon : it.priority === 'high';
      })
      .sort((a, b) => (a.priority === 'high' ? -1 : 0) - (b.priority === 'high' ? -1 : 0) || String(a.when).localeCompare(String(b.when)))
      .slice(0, 8);
  }, [data.items, plan, date]);

  // Calendar events on this planning day, shown in the schedule for context.
  const events = useMemo(() => {
    const start = new Date(+day + DAY_START_HOUR * 3_600_000);
    const end = new Date(+start + 86_400_000);
    return data.items
      .filter((it) => it.kind === 'event' && !it.allDay)
      .filter((it) => {
        const s = parseWhen(it.when);
        return s >= start && s < end;
      })
      .map((it) => ({ id: it.id, start: toHHMM(parseWhen(it.when)), end: it.end ? toHHMM(new Date(it.end)) : null, label: it.title, event: true, item: it }));
  }, [data.items, date]);

  if (!plan) return <div className="empty">Loading your plan…</div>;

  const top = plan.top;
  const allDone = top.length > 0 && top.every((t) => t.done && t.text.trim());

  // ----- Step 1 -----
  const setTop = (i, fields) => change({ ...plan, top: top.map((t, j) => (j === i ? { ...t, ...fields } : t)) });
  const addTop = (fields = {}) => top.length < 3 && change({ ...plan, top: [...top, { id: newId(), text: '', done: false, itemId: null, ...fields }] });
  const removeTop = (i) => change({ ...plan, top: top.filter((_, j) => j !== i) });

  const toggleTop = async (i) => {
    const t = top[i];
    const done = !t.done;
    setTop(i, { done });
    // Keep the linked task or assignment in sync with the rest of Hub.
    const item = t.itemId && data.items.find((it) => it.id === t.itemId);
    if (!item) return;
    if (item.taskId) await api.patch(`/api/tasks/${item.taskId}`, { done });
    else await api.post('/api/complete', { id: item.id, done });
    reload();
  };

  // ----- Step 2 -----
  const blocks = [...plan.blocks].sort((a, b) => dayMinutes(a.start) - dayMinutes(b.start));
  const setBlock = (id, fields) => change({ ...plan, blocks: plan.blocks.map((b) => (b.id === id ? { ...b, ...fields } : b)) });
  const removeBlock = (id) => change({ ...plan, blocks: plan.blocks.filter((b) => b.id !== id) });
  const addBlock = () => {
    const last = blocks[blocks.length - 1];
    const start = last ? last.end : toHHMM(new Date(Math.ceil(+now / 900_000) * 900_000));
    const id = newId();
    change({ ...plan, blocks: [...plan.blocks, { id, start, end: addMinutes(start, 60), label: '', notes: '' }] });
    setOpenId(id);
  };

  const nowMin = dayMinutes(toHHMM(now));
  const inBlock = (b) => isToday && b.end && dayMinutes(b.start) <= nowMin && nowMin < (dayMinutes(b.end) || 24 * 60);
  const current = blocks.find(inBlock);
  const next = isToday ? blocks.find((b) => dayMinutes(b.start) > nowMin) : null;
  // Hide a calendar event that is just this plan's block mirrored to Google Calendar.
  const mirrored = (e) => blocks.some((b) => b.start === e.start && e.label.includes(b.label));
  const schedule = [...blocks, ...events.filter((e) => !mirrored(e))].sort((a, b) => dayMinutes(a.start) - dayMinutes(b.start));
  const topLabels = top.map((t) => t.text).filter(Boolean);

  return (
    <div className="page dayplan">
      <div className="dayplan-head">
        <button className="icon-btn" onClick={() => setDate(localDate(addDays(day, -1)))} aria-label="Previous day">
          ‹
        </button>
        <h2>
          {date} → <span className="dayplan-weekday">{day.toLocaleDateString([], { weekday: 'long' })}</span>
        </h2>
        <button className="icon-btn" onClick={() => setDate(localDate(addDays(day, 1)))} aria-label="Next day">
          ›
        </button>
        {!isToday && (
          <button className="btn btn-small" onClick={() => setDate(planDateFor())}>
            Today
          </button>
        )}
      </div>

      {isToday && (current || next) && !allDone && (
        <div className="card dayplan-now">
          <span className="step-tag">Step 3 · Do it</span>
          {current ? (
            <div>
              <b>Now:</b> {current.label || 'Untitled block'} <span className="muted">until {fmtHHMM(current.end)}</span>
            </div>
          ) : (
            <div className="muted">No block right now.</div>
          )}
          {next && (
            <div>
              <b>Next:</b> {next.label || 'Untitled block'} <span className="muted">at {fmtHHMM(next.start)}</span>
            </div>
          )}
        </div>
      )}

      {allDone && <div className="banner banner-ok">All 3 done. Today is done. ✓</div>}

      <div className="row row-main">
        <section className="card card-accent">
          <div className="card-head">
            <h2>
              <span className="step-tag">Step 1</span> What needs to happen today?
            </h2>
            <span className="count">{top.filter((t) => t.done).length}/{Math.max(top.length, 3)}</span>
          </div>
          <p className="hint">Your top 3, the things that can't slip. Today is done when these are done.</p>
          <div className="top3">
            {top.map((t, i) => (
              <div key={t.id} className={`top3-row ${t.done ? 'top3-done' : ''}`}>
                <input type="checkbox" checked={t.done} onChange={() => toggleTop(i)} aria-label={`Mark #${i + 1} done`} />
                <span className="top3-num">{i + 1}</span>
                <input
                  className="top3-text"
                  value={t.text}
                  placeholder="Something that must happen today"
                  onChange={(e) => setTop(i, { text: e.target.value })}
                />
                <button className="icon-btn" onClick={() => removeTop(i)} aria-label={`Remove #${i + 1}`} title="Remove">
                  ×
                </button>
              </div>
            ))}
            {top.length < 3 && (
              <button className="btn btn-ghost top3-add" onClick={() => addTop()}>
                + Add #{top.length + 1}
              </button>
            )}
          </div>
          {top.length < 3 && suggestions.length > 0 && (
            <div className="suggestions">
              <div className="muted">Due soon. Click to pick:</div>
              {suggestions.map((it) => (
                <button key={it.id} className="chip" onClick={() => addTop({ text: it.title, itemId: it.id })} title={it.course || ''}>
                  {it.title}
                  <span className="muted"> · {it.when ? dueLabel(it) : 'no date'}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>
              <span className="step-tag">Step 2</span> The schedule
            </h2>
          </div>
          <p className="hint">Decide now when each thing happens, and guard that time. Calendar events show in grey.</p>
          <datalist id="top3-labels">
            {topLabels.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          <div className="blocks">
            {schedule.length === 0 && <p className="empty-small">No blocks yet.</p>}
            {schedule.map((b) =>
              b.event ? (
                <div key={b.id} className="block block-event">
                  <span className="block-time">
                    {fmtHHMM(b.start)}
                    {b.end && `–${fmtHHMM(b.end)}`}
                  </span>
                  <button className="block-open block-label" onClick={() => setOpenId(b.id)}>
                    {b.label}
                  </button>
                </div>
              ) : (
                <div key={b.id} className={`block ${inBlock(b) ? 'block-now' : ''} ${topLabels.includes(b.label) ? 'block-top' : ''}`}>
                  <input type="time" value={b.start} onChange={(e) => e.target.value && setBlock(b.id, { start: e.target.value })} aria-label="Start" />
                  <span className="muted">–</span>
                  <input type="time" value={b.end} onChange={(e) => e.target.value && setBlock(b.id, { end: e.target.value })} aria-label="End" />
                  <button className="block-open block-input" onClick={() => setOpenId(b.id)}>
                    <span>{b.label || <span className="muted">Untitled block</span>}</span>
                    {b.notes && <span className="block-has-notes" aria-label="Has notes">📝</span>}
                  </button>
                  <button className="icon-btn" onClick={() => removeBlock(b.id)} aria-label="Remove block" title="Remove">
                    ×
                  </button>
                </div>
              ),
            )}
          </div>
          <button className="btn btn-ghost" onClick={addBlock}>
            + Add block
          </button>
        </section>
      </div>

      {openId && (
        <BlockDetails
          entry={schedule.find((b) => b.id === openId)}
          top={top}
          items={data.items}
          isNow={inBlock(schedule.find((b) => b.id === openId) || {})}
          onToggleTop={toggleTop}
          onChange={(fields) => setBlock(openId, fields)}
          onDelete={() => {
            removeBlock(openId);
            setOpenId(null);
          }}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

const SOURCE_NAMES = { canvas: 'Canvas', manual: 'Task', syllabus: 'Syllabus', applications: 'Applications', google: 'Google Calendar', outlook: 'Outlook', ics: 'Calendar feed' };

// Pop-up with everything about one block (or a calendar event): times, the
// top-3 item it works on, that item's details and link, and your own notes.
function BlockDetails({ entry, top, items, isNow, onToggleTop, onChange, onDelete, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  if (!entry) return null;

  const topIndex = entry.event ? -1 : top.findIndex((t) => t.text && t.text === entry.label);
  const topItem = top[topIndex];
  const linked = entry.event ? entry.item : topItem?.itemId && items.find((it) => it.id === topItem.itemId);
  const minutes = entry.end ? (dayMinutes(entry.end) - dayMinutes(entry.start) + 24 * 60) % (24 * 60) : null;

  return (
    <dialog ref={ref} className="details" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current.close()}>
      <div className="details-body">
        <div className="details-head">
          <span className="muted details-time">
            {fmtHHMM(entry.start)}
            {entry.end && ` – ${fmtHHMM(entry.end)}`}
            {minutes ? ` · ${minutes >= 60 ? `${Math.floor(minutes / 60)} h ` : ''}${minutes % 60 ? `${minutes % 60} min` : ''}` : ''}
          </span>
          {isNow && <span className="step-tag">Now</span>}
          {topIndex >= 0 && <span className="step-tag">Top 3 · #{topIndex + 1}</span>}
          {entry.event && <span className="badge">Calendar event</span>}
          <button className="icon-btn details-close" onClick={() => ref.current.close()} aria-label="Close">
            ×
          </button>
        </div>

        {entry.event ? (
          <h2 className="details-title">{entry.label}</h2>
        ) : (
          <input className="details-title details-title-input" value={entry.label} placeholder="What you'll do" list="top3-labels" onChange={(e) => onChange({ label: e.target.value })} aria-label="Block title" />
        )}

        {!entry.event && (
          <div className="details-times">
            <label>
              Start <input type="time" value={entry.start} onChange={(e) => e.target.value && onChange({ start: e.target.value })} />
            </label>
            <label>
              End <input type="time" value={entry.end} onChange={(e) => e.target.value && onChange({ end: e.target.value })} />
            </label>
          </div>
        )}

        {topItem && (
          <label className="details-done">
            <input type="checkbox" checked={topItem.done} onChange={() => onToggleTop(topIndex)} />
            {topItem.done ? 'Done ✓' : 'Mark this top-3 item done'}
          </label>
        )}

        {linked && (
          <div className="details-linked">
            <dl>
              {!entry.event && linked.when && (
                <>
                  <dt>Due</dt>
                  <dd>{dueLabel(linked)}</dd>
                </>
              )}
              {linked.course && (
                <>
                  <dt>Course</dt>
                  <dd>{linked.course}</dd>
                </>
              )}
              {linked.calendar && (
                <>
                  <dt>Calendar</dt>
                  <dd>{linked.calendar}</dd>
                </>
              )}
              {linked.location && (
                <>
                  <dt>Where</dt>
                  <dd>{linked.location}</dd>
                </>
              )}
              {linked.priority && linked.priority !== 'normal' && (
                <>
                  <dt>Priority</dt>
                  <dd>{linked.priority}</dd>
                </>
              )}
              <dt>From</dt>
              <dd>{SOURCE_NAMES[linked.source] || linked.source}</dd>
            </dl>
            {(linked.notes || linked.description) && <p className="details-text">{linked.notes || linked.description}</p>}
            <div className="actions">
              {linked.joinUrl && (
                <a className="btn btn-primary btn-small" href={linked.joinUrl} target="_blank" rel="noreferrer">
                  Join meeting
                </a>
              )}
              {linked.url && (
                <a className="btn btn-small" href={linked.url} target="_blank" rel="noreferrer">
                  Open in {SOURCE_NAMES[linked.source] || 'source'} ↗
                </a>
              )}
            </div>
          </div>
        )}

        {!entry.event && !topItem && top.some((t) => t.text) && (
          <div className="details-link-to">
            <span className="muted">Work on a top-3 item in this block:</span>
            {top.filter((t) => t.text).map((t, i) => (
              <button key={t.id} className="chip" onClick={() => onChange({ label: t.text })}>
                #{i + 1} {t.text}
              </button>
            ))}
          </div>
        )}

        {!entry.event && (
          <label className="details-notes">
            <span>Notes for this block</span>
            <textarea rows={6} value={entry.notes || ''} placeholder="Steps, links, what done looks like…" onChange={(e) => onChange({ notes: e.target.value })} />
          </label>
        )}

        {!entry.event && (
          <div className="details-foot">
            <button className="btn btn-ghost btn-danger-text" onClick={onDelete}>
              Delete block
            </button>
            <button className="btn btn-primary" onClick={() => ref.current.close()}>
              Done
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
