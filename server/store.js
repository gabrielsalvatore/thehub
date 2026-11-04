// Tiny JSON-file store. Everything personal (tokens, tasks, AI cache) lives in
// data/db.json, which is gitignored. Writes are atomic (tmp file + rename).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.HUB_DATA_DIR || path.join(here, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const DEFAULTS = {
  tasks: [],
  applications: [],
  syllabusItems: [],
  habits: [
    { id: 'gym', name: 'Gym' },
    { id: 'diet', name: 'Diet on track' },
    { id: 'leetcode', name: 'LeetCode problem' },
  ],
  habitLog: {}, // { "YYYY-MM-DD": { habitId: true } }
  completed: {}, // { itemId: true } – local check-offs for Canvas/calendar/syllabus items
  dismissedEmails: {}, // { emailId: true }
  tokens: {}, // { google: {...}, microsoft: {...} }
  aiCache: { emails: {}, briefing: null },
};

let db = load();

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) return structuredClone(DEFAULTS);
  const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  return { ...structuredClone(DEFAULTS), ...parsed };
}

function save() {
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

export function get() {
  return db;
}

// Mutate the db inside fn, then persist.
export function update(fn) {
  const result = fn(db);
  save();
  return result;
}

export function newId() {
  return crypto.randomUUID();
}
