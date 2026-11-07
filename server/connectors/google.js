// Google Calendar + Gmail through OAuth 2.0 (read-only scopes).
// Setup: create an OAuth "Web application" client in Google Cloud Console with
// redirect URI http://localhost:4321/auth/google/callback (see README).
import * as canvas from './canvas.js';
import * as store from '../store.js';
import { htmlToText, clip } from '../util/text.js';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
];

function redirectUri() {
  return `${process.env.PUBLIC_URL}/auth/google/callback`;
}

export function isConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// Tokens live in db.tokens.google.accounts: one entry per Google account,
// keyed by email address. Older installs stored a single token object
// directly in db.tokens.google; accounts() upgrades that in place.
function accounts() {
  const g = store.get().tokens.google;
  if (g?.refresh_token) {
    store.update((db) => (db.tokens.google = { accounts: [{ email: null, ...g }] }));
    return store.get().tokens.google.accounts;
  }
  return g?.accounts || [];
}

export function isConnected() {
  return accounts().some((a) => a.refresh_token);
}

export function connectedAccounts() {
  return accounts().map((a) => a.email || 'Google account');
}

export function authUrl(state) {
  const qs = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    // Always show the account picker so you can add a second account.
    prompt: 'consent select_account',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${qs}`;
}

async function tokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      ...params,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google token error: ${body.error_description || body.error}`);
  return body;
}

async function profileEmail(token) {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Google ${res.status}: could not read the account's email address`);
  return (await res.json()).emailAddress;
}

function saveAccount(match, fields) {
  store.update((db) => {
    const list = db.tokens.google.accounts;
    const i = list.findIndex(match);
    if (i >= 0) list[i] = { ...list[i], ...fields };
    else list.push(fields);
  });
}

// Connecting an account that is already connected refreshes its tokens.
export async function handleCallback(code) {
  const t = await tokenRequest({ code, redirect_uri: redirectUri(), grant_type: 'authorization_code' });
  const email = await profileEmail(t.access_token);
  // Label any account saved before multi-account support, so it can be matched.
  for (const acct of accounts()) if (!acct.email) await withEmail(acct).catch(() => {});
  const existing = accounts().find((acct) => acct.email === email);
  const refresh = t.refresh_token || existing?.refresh_token;
  if (!refresh) throw new Error('Google did not return a refresh token. Try connecting again.');
  store.update((db) => (db.tokens.google ??= { accounts: [] }));
  saveAccount((acct) => acct.email === email, {
    email,
    access_token: t.access_token,
    refresh_token: refresh,
    expires_at: Date.now() + t.expires_in * 1000,
  });
}

// With an email, disconnects that account; without one, all of them.
export function disconnect(email) {
  store.update((db) => {
    if (!email) return void delete db.tokens.google;
    const list = db.tokens.google?.accounts || [];
    db.tokens.google.accounts = list.filter((a) => (a.email || 'Google account') !== email);
  });
}

async function accessToken(acct) {
  if (acct.access_token && acct.expires_at > Date.now() + 60_000) return acct.access_token;
  try {
    const t = await tokenRequest({ refresh_token: acct.refresh_token, grant_type: 'refresh_token' });
    acct.access_token = t.access_token;
    acct.expires_at = Date.now() + t.expires_in * 1000;
    saveAccount((a) => a.refresh_token === acct.refresh_token, { ...acct });
    return t.access_token;
  } catch (err) {
    // Apps in Google's "Testing" mode get refresh tokens that expire after 7 days.
    throw new Error(`${acct.email || 'Google'}: ${err.message}. Reconnect it from the Sources tab.`);
  }
}

// Fill in the email address for an account saved before multi-account support.
async function withEmail(acct) {
  if (acct.email) return acct;
  const email = await profileEmail(await accessToken(acct));
  saveAccount((a) => a.refresh_token === acct.refresh_token, { email });
  return { ...acct, email };
}

async function gget(acct, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken(acct)}` } });
  if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Runs fn for every account. One account failing becomes a warning instead of
// hiding the others; it's only an error when every account fails.
async function perAccount(fn) {
  const results = await Promise.allSettled(accounts().map(async (a) => fn(await withEmail(a))));
  const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const warnings = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
  if (!ok.length && warnings.length) throw new Error(warnings.join('; '));
  return { values: ok, warnings };
}

function meetingLink(ev) {
  if (ev.hangoutLink) return ev.hangoutLink;
  const entry = ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video');
  if (entry) return entry.uri;
  const m = `${ev.location || ''} ${ev.description || ''}`.match(/https:\/\/[^\s"<>]*(zoom\.us|teams\.microsoft|meet\.google)[^\s"<>]*/);
  return m ? m[0] : null;
}

// Guess a category from the calendar and title so classes and the capstone
// don't all land under "Meetings".
function categoryFor(cal, title) {
  if (cal.id.includes('#holiday@')) return 'personal';
  if (/\b(sr\.? project|senior project|capstone)\b/i.test(title)) return 'capstone';
  if (/^[A-Z]{3,5}\*?\d{3}\b/.test(title)) return 'school'; // course codes like CMPSC*403
  return 'meeting';
}

// Canvas's own calendar feed, when subscribed in Google Calendar, duplicates
// what the Canvas connector already shows (with less detail).
function isCanvasFeed(cal) {
  return /\(Canvas\)\s*$/.test(cal.summary || '');
}

export async function fetchEvents(range) {
  const { values, warnings } = await perAccount((acct) => accountEvents(acct, range));
  // The same meeting can show up in both accounts (e.g. you invited yourself).
  const seen = new Set();
  const items = values.flat().filter((ev) => {
    const key = `${ev.uid}|${ev.when}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { items: items.map(({ uid, ...ev }) => ev), warnings };
}

async function accountEvents(acct, { start, end }) {
  const { items: calendars = [] } = await gget(acct, 'https://www.googleapis.com/calendar/v3/users/me/calendarList');
  const visible = calendars
    .filter((c) => c.selected !== false && !c.hidden)
    .filter((c) => !(canvas.isConfigured() && isCanvasFeed(c)));
  const qs = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const perCalendar = await Promise.all(
    visible.map(async (cal) => {
      const { items = [] } = await gget(
        acct,
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${qs}`,
      );
      return items
        .filter((ev) => ev.status !== 'cancelled')
        .filter((ev) => !ev.attendees?.some((a) => a.self && a.responseStatus === 'declined'))
        .map((ev) => ({
          id: `google:${cal.id}:${ev.id}`,
          uid: ev.iCalUID || ev.id,
          source: 'google',
          kind: 'event',
          category: categoryFor(cal, ev.summary || ''),
          title: ev.summary || '(no title)',
          calendar: cal.primary ? null : cal.summaryOverride || cal.summary, // primary is just your email address
          when: ev.start.dateTime || ev.start.date,
          end: ev.end?.dateTime || ev.end?.date || null,
          allDay: !ev.start.dateTime,
          location: ev.location || null,
          url: ev.htmlLink,
          joinUrl: meetingLink(ev),
        }));
    }),
  );
  return perCalendar.flat();
}

// Prefer the text/plain part; fall back to stripped HTML.
function gmailBody(payload) {
  const parts = [];
  const walk = (p) => {
    if (p.body?.data) parts.push(p);
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  const decode = (p) => Buffer.from(p.body.data, 'base64url').toString('utf8');
  const plain = parts.find((p) => p.mimeType === 'text/plain');
  if (plain) return decode(plain);
  const html = parts.find((p) => p.mimeType === 'text/html');
  return html ? htmlToText(decode(html)) : '';
}

export async function fetchEmails(opts) {
  const { values, warnings } = await perAccount((acct) => accountEmails(acct, opts));
  return { emails: values.flat(), warnings };
}

async function accountEmails(acct, { days = 7, max = 30 } = {}) {
  const q = `in:inbox is:unread newer_than:${days}d -category:promotions -category:social -category:forums`;
  const list = await gget(
    acct,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q, maxResults: String(max) })}`,
  );
  const ids = (list.messages || []).map((m) => m.id);
  const messages = await Promise.all(
    ids.map((id) => gget(acct, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`)),
  );
  return messages.map((m) => {
    const header = (name) => m.payload.headers.find((h) => h.name.toLowerCase() === name)?.value || '';
    return {
      id: `gmail:${m.id}`,
      source: 'gmail',
      account: acct.email,
      from: header('from'),
      subject: header('subject') || '(no subject)',
      receivedAt: new Date(Number(m.internalDate)).toISOString(),
      snippet: m.snippet,
      body: clip(gmailBody(m.payload), 3000),
      url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(acct.email)}#inbox/${m.threadId}`,
    };
  });
}
