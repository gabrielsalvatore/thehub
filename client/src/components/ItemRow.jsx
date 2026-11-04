import { CATEGORIES, SOURCE_LABELS, isDone } from '../categories.js';
import { dueLabel, parseWhen, fmtTime } from '../dates.js';

const STATUS_BADGE = {
  missing: { text: 'Missing', cls: 'badge-danger' },
  submitted: { text: 'Submitted', cls: 'badge-ok' },
  graded: { text: 'Graded', cls: 'badge-ok' },
};

export default function ItemRow({ item, onToggle, onDelete, compact = false, showDate = true }) {
  const cat = CATEGORIES[item.category] || CATEGORIES.personal;
  const done = isDone(item);
  const isEvent = item.kind === 'event';
  const start = parseWhen(item.when);
  const badge = STATUS_BADGE[item.status];

  let when = '';
  if (isEvent) when = item.allDay ? 'All day' : `${fmtTime(start)}${item.end ? `–${fmtTime(new Date(item.end))}` : ''}`;
  else if (showDate) when = dueLabel(item);

  return (
    <div className={`item ${done ? 'item-done' : ''} ${compact ? 'item-compact' : ''}`} style={{ '--cat': cat.color }}>
      {isEvent ? (
        <span className="item-dot" aria-hidden />
      ) : (
        <input
          type="checkbox"
          className="item-check"
          checked={done}
          onChange={() => onToggle?.(item, !done)}
          aria-label={done ? `Mark ${item.title} not done` : `Mark ${item.title} done`}
        />
      )}
      <div className="item-body">
        <div className="item-title">
          {item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer">
              {item.title}
            </a>
          ) : (
            item.title
          )}
          {badge && <span className={`badge ${badge.cls}`}>{badge.text}</span>}
        </div>
        {!compact && (
          <div className="item-meta">
            {when && <span>{when}</span>}
            {item.course && item.course !== item.title && <span>{item.course}</span>}
            {!item.course && item.calendar && <span>{item.calendar}</span>}
            {item.location && !item.joinUrl && <span>{item.location}</span>}
            <span className="muted">{SOURCE_LABELS[item.source] || item.source}</span>
          </div>
        )}
        {compact && when && <div className="item-meta">{when}</div>}
      </div>
      {item.joinUrl && !compact && (
        <a className="btn btn-small btn-primary" href={item.joinUrl} target="_blank" rel="noreferrer">
          Join
        </a>
      )}
      {onDelete && (
        <button className="icon-btn" onClick={() => onDelete(item)} aria-label={`Delete ${item.title}`} title="Delete">
          ×
        </button>
      )}
    </div>
  );
}
