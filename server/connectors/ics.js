// Any iCalendar feed URL: Outlook "Publish calendar" links, Canvas calendar
// feeds, club/team calendars, etc. Configure in .env as
//   ICS_FEEDS="Work|https://...ics,Club|https://...ics"
import ical from 'node-ical';

export function feeds() {
  return (process.env.ICS_FEEDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry, i) => {
      const [name, ...rest] = entry.split('|');
      return rest.length ? { name: name.trim(), url: rest.join('|').trim() } : { name: `Feed ${i + 1}`, url: name };
    });
}

export function isConfigured() {
  return feeds().length > 0;
}

function toItem(feed, ev, start, end) {
  const allDay = ev.datetype === 'date' || Boolean(start.dateOnly);
  const day = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  const join = `${ev.location || ''} ${ev.description || ''}`.match(
    /https:\/\/[^\s"<>]*(zoom\.us|teams\.microsoft|meet\.google)[^\s"<>]*/,
  );
  // A Canvas calendar feed (fallback when a school blocks API tokens) lists
  // assignments as events; treat them as school work so they can be checked off.
  const isCanvasAssignment = /\/feeds\/calendars\//.test(feed.url) && /assignment/i.test(ev.uid || '');
  return {
    id: `ics:${feed.name}:${ev.uid}:${new Date(start).getTime()}`,
    source: 'ics',
    kind: isCanvasAssignment ? 'assignment' : 'event',
    category: isCanvasAssignment ? 'school' : 'meeting',
    status: isCanvasAssignment ? 'todo' : null,
    title: ev.summary?.val || ev.summary || '(no title)',
    calendar: feed.name,
    when: allDay ? day(start) : new Date(start).toISOString(),
    end: end ? (allDay ? day(end) : new Date(end).toISOString()) : null,
    allDay,
    location: ev.location?.val || ev.location || null,
    url: typeof ev.url === 'string' ? ev.url : ev.url?.val || null,
    joinUrl: join ? join[0] : null,
  };
}

async function fetchFeed(feed, { start, end }) {
  const url = feed.url.replace(/^webcal:/, 'https:');
  const data = await ical.async.fromURL(url);
  const items = [];
  for (const ev of Object.values(data)) {
    if (ev.type !== 'VEVENT' || ev.status === 'CANCELLED') continue;
    if (ev.rrule) {
      for (const inst of ical.expandRecurringEvent(ev, { from: start, to: end })) {
        items.push(toItem(feed, inst.event || ev, inst.start, inst.end));
      }
    } else if (ev.start && new Date(ev.start) <= end && new Date(ev.end || ev.start) >= start) {
      items.push(toItem(feed, ev, ev.start, ev.end));
    }
  }
  return items;
}

export async function fetchEvents(range) {
  const results = await Promise.allSettled(feeds().map((f) => fetchFeed(f, range)));
  const errors = results
    .map((r, i) => (r.status === 'rejected' ? `${feeds()[i].name}: ${r.reason.message}` : null))
    .filter(Boolean);
  const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (errors.length && !items.length) throw new Error(errors.join('; '));
  return { items, warnings: errors };
}
