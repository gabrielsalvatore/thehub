// Pulls every source into one normalized list. Remote sources are cached for a
// few minutes so reloading the page doesn't hammer Canvas/Google/Microsoft.
import * as store from './store.js';
import * as canvas from './connectors/canvas.js';
import * as google from './connectors/google.js';
import * as microsoft from './connectors/microsoft.js';
import * as ics from './connectors/ics.js';
import * as ai from './ai.js';

const TTL_MS = 10 * 60_000;
const cache = new Map(); // name -> { at, value }

const DAY = 86_400_000;
export function fetchWindow() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return { start: new Date(start - 21 * DAY), end: new Date(+start + 42 * DAY) };
}

async function cached(name, force, fn) {
  const hit = cache.get(name);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await fn();
  cache.set(name, { at: Date.now(), value });
  return value;
}

export function invalidate() {
  cache.clear();
}

// Each source returns { status, message?, items?, emails? }.
async function runSource(name, configured, connected, fn, force) {
  if (!configured) return { status: 'not_configured' };
  if (!connected) return { status: 'not_connected' };
  try {
    const value = await cached(name, force, fn);
    return { status: value.warnings?.length ? 'warning' : 'ok', message: value.warnings?.join('; '), ...value };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

function localItems(db) {
  const tasks = db.tasks.map((t) => ({
    id: `task:${t.id}`,
    source: 'manual',
    kind: 'task',
    category: t.category || 'personal',
    title: t.title,
    when: t.due || null,
    allDay: !t.due?.includes('T'),
    status: t.done ? 'done' : 'todo',
    priority: t.priority || 'normal',
    notes: t.notes || null,
    taskId: t.id,
  }));
  const syllabus = db.syllabusItems.map((s) => ({
    id: `syllabus:${s.id}`,
    source: 'syllabus',
    kind: 'assignment',
    category: /\b(capstone|thesis|senior|comp|600|610)\b/i.test(s.course) ? 'capstone' : 'school',
    title: s.title,
    course: s.course,
    when: s.time ? `${s.date}T${s.time}` : s.date,
    allDay: !s.time,
    status: 'todo',
    notes: [s.type, s.notes].filter(Boolean).join(' · '),
    syllabusId: s.id,
  }));
  const appDeadlines = db.applications
    .filter((a) => a.deadline && ['to apply', 'in progress'].includes(a.status))
    .map((a) => ({
      id: `app:${a.id}`,
      source: 'applications',
      kind: 'deadline',
      category: a.type === 'grad' ? 'grad' : 'jobs',
      title: `${a.type === 'grad' ? 'Grad app' : 'Apply'}: ${a.name}${a.role ? ` – ${a.role}` : ''}`,
      when: a.deadline,
      allDay: true,
      status: 'todo',
      url: a.url || null,
      applicationId: a.id,
    }));
  return [...tasks, ...syllabus, ...appDeadlines];
}

export async function dashboard({ force = false } = {}) {
  const range = fetchWindow();
  const db = store.get();

  const [canvasRes, googleCal, outlookCal, icsRes, gmail, outlookMail] = await Promise.all([
    runSource('canvas', canvas.isConfigured(), true, async () => ({ items: await canvas.fetchItems(range) }), force),
    runSource('google-cal', google.isConfigured(), google.isConnected(), () => google.fetchEvents(range), force),
    runSource('outlook-cal', microsoft.isConfigured(), microsoft.isConnected(), async () => ({ items: await microsoft.fetchEvents(range) }), force),
    runSource('ics', ics.isConfigured(), true, () => ics.fetchEvents(range), force),
    runSource('gmail', google.isConfigured(), google.isConnected(), () => google.fetchEmails(), force),
    runSource('outlook-mail', microsoft.isConfigured(), microsoft.isConnected(), async () => ({ emails: await microsoft.fetchEmails() }), force),
  ]);

  const items = [canvasRes, googleCal, outlookCal, icsRes]
    .flatMap((r) => r.items || [])
    .concat(localItems(db))
    .map((it) => (db.completed[it.id] && it.kind !== 'event' ? { ...it, status: 'done' } : it))
    .sort((a, b) => String(a.when).localeCompare(String(b.when)));

  let emails = [...(gmail.emails || []), ...(outlookMail.emails || [])]
    .filter((e) => !db.dismissedEmails[e.id])
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  let aiStatus = ai.isEnabled() ? { status: 'ok' } : { status: 'not_configured' };
  if (ai.isEnabled() && emails.length) {
    try {
      emails = await ai.triageEmails(emails);
    } catch (err) {
      aiStatus = { status: 'error', message: `Email triage failed: ${err.message}` };
    }
  }
  // The client doesn't need full bodies.
  emails = emails.map(({ body, ...rest }) => rest);

  const strip = ({ items: _i, emails: _e, ...rest }) => rest;
  return {
    generatedAt: new Date().toISOString(),
    range: { start: range.start.toISOString(), end: range.end.toISOString() },
    items,
    emails,
    habits: db.habits,
    habitLog: db.habitLog,
    applications: db.applications,
    grad: db.grad,
    sources: {
      canvas: strip(canvasRes),
      google: { ...mergeStatus(googleCal, gmail), accounts: google.isConnected() ? google.connectedAccounts() : [] },
      outlook: mergeStatus(outlookCal, outlookMail),
      ics: { ...strip(icsRes), feeds: ics.feeds().map((f) => f.name) },
      ai: aiStatus,
    },
  };
}

function mergeStatus(a, b) {
  const order = ['error', 'warning', 'not_connected', 'not_configured', 'ok'];
  const worst = [a, b].sort((x, y) => order.indexOf(x.status) - order.indexOf(y.status))[0];
  return { status: worst.status, message: [a.message, b.message].filter(Boolean).join('; ') || undefined };
}

export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Date-only values ("2026-11-05") mean the end of that local day.
function dueTime(when) {
  return when.length === 10 ? new Date(`${when}T23:59:59`) : new Date(when);
}

// Compact view of the next 7 days for the AI briefing (keeps tokens low).
export function briefingSnapshot(data) {
  const now = new Date();
  const weekOut = new Date(+now + 7 * DAY);
  const slim = (it) => ({
    title: it.title,
    kind: it.kind,
    category: it.category,
    course: it.course || undefined,
    when: it.when,
    status: it.status || undefined,
    priority: it.priority === 'high' ? 'high' : undefined,
    notes: it.kind === 'task' && it.notes ? it.notes.slice(0, 200) : undefined,
  });
  const openWork = data.items.filter((it) => it.kind !== 'event' && it.when && ['todo', 'missing'].includes(it.status));
  const events = data.items.filter((it) => it.kind === 'event');
  const inWeek = (it) => dueTime(it.when) >= now && dueTime(it.when) <= weekOut;
  const today = localDate(now);
  return {
    overdue: openWork.filter((it) => it.status === 'missing' || dueTime(it.when) < now).map(slim),
    due_this_week: openWork.filter(inWeek).map(slim),
    events_this_week: events.filter(inWeek).map(slim),
    action_emails: data.emails
      .filter((e) => e.triage?.needs_action)
      .map((e) => ({ subject: e.subject, from: e.from, summary: e.triage.summary, deadline: e.triage.deadline })),
    habits_done_today: data.habits.filter((h) => data.habitLog[today]?.[h.id]).map((h) => h.name),
    open_applications: data.applications.filter((a) => !['rejected', 'offer', 'accepted'].includes(a.status)).length,
  };
}
