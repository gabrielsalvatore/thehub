import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as store from './store.js';
import * as google from './connectors/google.js';
import * as microsoft from './connectors/microsoft.js';
import * as ai from './ai.js';
import { dashboard, briefingSnapshot, invalidate } from './aggregate.js';

const PORT = Number(process.env.PORT || 4321);
process.env.PUBLIC_URL ||= `http://localhost:${PORT}`;
const CLIENT_URL = process.env.CLIENT_URL || process.env.PUBLIC_URL;

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(here, '..', 'dist');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// This server holds your tokens and email, so only answer requests addressed to
// localhost (blocks DNS-rebinding tricks from other websites).
app.use((req, res, next) => {
  const host = (req.headers.host || '').split(':')[0];
  if (host === 'localhost' || host === '127.0.0.1') return next();
  res.status(403).send('Forbidden');
});
app.use(express.json({ limit: '2mb' }));

// ---------- Dashboard ----------

let lastDashboard = null;

app.get('/api/dashboard', async (req, res) => {
  lastDashboard = await dashboard({ force: req.query.refresh === '1' });
  res.json(lastDashboard);
});

app.get('/api/briefing', async (req, res) => {
  if (!ai.isEnabled()) return res.status(400).json({ error: 'Add ANTHROPIC_API_KEY to .env to enable the AI briefing.' });
  // Rebuild rather than reuse the last dashboard so tasks added since then count.
  // Remote sources are cached for 10 minutes and email triage is cached per email.
  const data = (lastDashboard = await dashboard());
  res.json(await ai.weeklyBriefing(briefingSnapshot(data), { force: req.query.force === '1' }));
});

// Check off any non-task item (Canvas assignment, syllabus item, app deadline).
app.post('/api/complete', (req, res) => {
  const { id, done } = req.body;
  store.update((db) => {
    if (done) db.completed[id] = true;
    else delete db.completed[id];
  });
  res.json({ ok: true });
});

// ---------- Day plan (top 3 + time blocks) ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const str = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');

app.get('/api/plan/:date', (req, res) => {
  if (!DATE_RE.test(req.params.date)) return res.status(400).json({ error: 'Bad date' });
  res.json(store.get().dayPlans[req.params.date] || { top: [], blocks: [] });
});

app.put('/api/plan/:date', (req, res) => {
  if (!DATE_RE.test(req.params.date)) return res.status(400).json({ error: 'Bad date' });
  const top = (req.body.top || []).slice(0, 3).map((t) => ({
    id: str(t.id, 64) || store.newId(),
    text: str(t.text),
    done: Boolean(t.done),
    itemId: str(t.itemId, 200) || null,
    notes: str(t.notes, 4000),
  }));
  const blocks = (req.body.blocks || []).slice(0, 40)
    .filter((b) => TIME_RE.test(b.start) && TIME_RE.test(b.end))
    .map((b) => ({ id: str(b.id, 64) || store.newId(), start: b.start, end: b.end, label: str(b.label), notes: str(b.notes, 4000) }));
  const plan = { top, blocks };
  store.update((db) => (db.dayPlans[req.params.date] = plan));
  res.json(plan);
});

// ---------- Tasks ----------

const TASK_FIELDS = ['title', 'category', 'due', 'priority', 'notes', 'done'];
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

app.post('/api/tasks', (req, res) => {
  if (!req.body.title?.trim()) return res.status(400).json({ error: 'Title is required' });
  const task = { id: store.newId(), done: false, createdAt: new Date().toISOString(), ...pick(req.body, TASK_FIELDS) };
  store.update((db) => db.tasks.push(task));
  res.json(task);
});

app.patch('/api/tasks/:id', (req, res) => {
  const task = store.update((db) => {
    const t = db.tasks.find((x) => x.id === req.params.id);
    if (t) Object.assign(t, pick(req.body, TASK_FIELDS));
    return t;
  });
  if (!task) return res.status(404).json({ error: 'Not found' });
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  store.update((db) => (db.tasks = db.tasks.filter((t) => t.id !== req.params.id)));
  res.json({ ok: true });
});

// ---------- Habits ----------

app.post('/api/habits/toggle', (req, res) => {
  const { date, habitId } = req.body;
  store.update((db) => {
    db.habitLog[date] ||= {};
    if (db.habitLog[date][habitId]) delete db.habitLog[date][habitId];
    else db.habitLog[date][habitId] = true;
  });
  res.json(store.get().habitLog);
});

app.post('/api/habits', (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const habit = { id: store.newId(), name: req.body.name.trim() };
  store.update((db) => db.habits.push(habit));
  res.json(habit);
});

app.delete('/api/habits/:id', (req, res) => {
  store.update((db) => (db.habits = db.habits.filter((h) => h.id !== req.params.id)));
  res.json({ ok: true });
});

// ---------- Applications (jobs + grad school) ----------

const APP_FIELDS = ['type', 'name', 'role', 'status', 'deadline', 'url', 'notes'];

app.post('/api/applications', (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const item = { id: store.newId(), type: 'job', status: 'to apply', createdAt: new Date().toISOString(), ...pick(req.body, APP_FIELDS) };
  store.update((db) => db.applications.push(item));
  res.json(item);
});

app.patch('/api/applications/:id', (req, res) => {
  const item = store.update((db) => {
    const a = db.applications.find((x) => x.id === req.params.id);
    if (a) Object.assign(a, pick(req.body, APP_FIELDS), { updatedAt: new Date().toISOString() });
    return a;
  });
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

app.delete('/api/applications/:id', (req, res) => {
  store.update((db) => (db.applications = db.applications.filter((a) => a.id !== req.params.id)));
  res.json({ ok: true });
});

// ---------- Syllabus ----------

app.get('/api/syllabus', (req, res) => res.json(store.get().syllabusItems));

// Step 1: extract (preview only, nothing saved).
app.post('/api/syllabus/extract', upload.single('file'), async (req, res) => {
  if (!ai.isEnabled()) return res.status(400).json({ error: 'Add ANTHROPIC_API_KEY to .env to read syllabi with AI.' });
  const file = req.file;
  if (!file && !req.body.text?.trim()) return res.status(400).json({ error: 'Upload a PDF or paste the syllabus text.' });
  const isPdf = file && (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf'));
  const result = await ai.extractSyllabus(
    isPdf ? { pdf: file.buffer, fileName: file.originalname } : { text: file ? file.buffer.toString('utf8') : req.body.text, fileName: file?.originalname },
  );
  res.json(result);
});

// Step 2: save the (possibly edited) items.
app.post('/api/syllabus/save', (req, res) => {
  const { course, items = [] } = req.body;
  const saved = items.map((it) => ({
    id: store.newId(),
    course,
    title: it.title,
    type: it.type,
    date: it.date,
    time: it.time || null,
    notes: it.notes || null,
  }));
  store.update((db) => db.syllabusItems.push(...saved));
  res.json(saved);
});

app.delete('/api/syllabus/:id', (req, res) => {
  store.update((db) => (db.syllabusItems = db.syllabusItems.filter((s) => s.id !== req.params.id)));
  res.json({ ok: true });
});

app.post('/api/syllabus/delete-course', (req, res) => {
  store.update((db) => (db.syllabusItems = db.syllabusItems.filter((s) => s.course !== req.body.course)));
  res.json({ ok: true });
});

// ---------- Email actions ----------

app.post('/api/emails/dismiss', (req, res) => {
  store.update((db) => (db.dismissedEmails[req.body.id] = Date.now()));
  res.json({ ok: true });
});

// ---------- OAuth ----------

const oauthStates = new Map(); // state -> provider
const providers = { google, microsoft };

app.get('/auth/:provider', (req, res) => {
  const provider = providers[req.params.provider];
  if (!provider) return res.status(404).send('Unknown provider');
  if (!provider.isConfigured()) return res.status(400).send(`Add the ${req.params.provider} client ID and secret to .env first (see README).`);
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, req.params.provider);
  res.redirect(provider.authUrl(state));
});

app.get('/auth/:provider/callback', async (req, res) => {
  const name = req.params.provider;
  if (!providers[name] || oauthStates.get(req.query.state) !== name) return res.status(400).send('Invalid OAuth state. Try connecting again.');
  oauthStates.delete(req.query.state);
  if (req.query.error) return res.redirect(`${CLIENT_URL}/?tab=sources&error=${encodeURIComponent(req.query.error_description || req.query.error)}`);
  try {
    await providers[name].handleCallback(req.query.code);
    invalidate();
    res.redirect(`${CLIENT_URL}/?tab=sources&connected=${name}`);
  } catch (err) {
    res.redirect(`${CLIENT_URL}/?tab=sources&error=${encodeURIComponent(err.message)}`);
  }
});

app.post('/api/disconnect/:provider', (req, res) => {
  providers[req.params.provider]?.disconnect(req.body?.account);
  invalidate();
  res.json({ ok: true });
});

// ---------- Static client ----------

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Something went wrong' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Hub running at ${process.env.PUBLIC_URL}`);
  if (process.argv.includes('--open')) exec(`open ${process.env.PUBLIC_URL}`);
});
