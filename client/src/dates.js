const DAY = 86_400_000;

export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Parse an item's `when`: date-only strings are local dates, not UTC midnight.
export function parseWhen(when) {
  if (!when) return null;
  if (when.length === 10) {
    const [y, m, d] = when.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(when);
}

// When something is actually due: date-only means end of that day.
export function dueTime(item) {
  const d = parseWhen(item.when);
  if (!d) return null;
  if (item.when.length === 10) d.setHours(23, 59, 59);
  return d;
}

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const offset = (x.getDay() + 6) % 7; // Monday = 0
  return new Date(+x - offset * DAY);
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function sameDay(a, b) {
  return a && b && localDate(a) === localDate(b);
}

export function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function fmtDay(d, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return d.toLocaleDateString([], opts);
}

// "in 25 min", "in 3 h", "2 days ago"
export function relative(d, now = new Date()) {
  const diff = +d - +now;
  const abs = Math.abs(diff);
  const fmt = new Intl.RelativeTimeFormat([], { numeric: 'auto' });
  if (abs < 3_600_000) return fmt.format(Math.round(diff / 60_000), 'minute');
  if (abs < DAY) return fmt.format(Math.round(diff / 3_600_000), 'hour');
  return fmt.format(Math.round(diff / DAY), 'day');
}

// Label for a due date relative to today: "Today 11:59 PM", "Tomorrow", "Thu".
export function dueLabel(item, now = new Date()) {
  const d = parseWhen(item.when);
  if (!d) return 'No date';
  const days = Math.round((+startOfDay(d) - +startOfDay(now)) / DAY);
  const time = item.when.length === 10 || item.allDay ? '' : ` ${fmtTime(d)}`;
  if (days === 0) return `Today${time}`;
  if (days === 1) return `Tomorrow${time}`;
  if (days === -1) return `Yesterday${time}`;
  if (days > 1 && days < 7) return `${fmtDay(d, { weekday: 'short' })}${time}`;
  return `${fmtDay(d, { month: 'short', day: 'numeric' })}${time}`;
}
