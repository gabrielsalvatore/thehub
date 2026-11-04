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

export function isConnected() {
  return Boolean(store.get().tokens.google?.refresh_token);
}

export function authUrl(state) {
  const qs = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
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

export async function handleCallback(code) {
  const t = await tokenRequest({ code, redirect_uri: redirectUri(), grant_type: 'authorization_code' });
  store.update((db) => {
    db.tokens.google = {
      access_token: t.access_token,
      refresh_token: t.refresh_token || db.tokens.google?.refresh_token,
      expires_at: Date.now() + t.expires_in * 1000,
    };
  });
}

export function disconnect() {
  store.update((db) => delete db.tokens.google);
}

async function accessToken() {
  const tok = store.get().tokens.google;
  if (!tok?.refresh_token) throw new Error('Google is not connected');
  if (tok.access_token && tok.expires_at > Date.now() + 60_000) return tok.access_token;
  try {
    const t = await tokenRequest({ refresh_token: tok.refresh_token, grant_type: 'refresh_token' });
    store.update((db) => {
      db.tokens.google.access_token = t.access_token;
      db.tokens.google.expires_at = Date.now() + t.expires_in * 1000;
    });
    return t.access_token;
  } catch (err) {
    // Apps in Google's "Testing" mode get refresh tokens that expire after 7 days.
    throw new Error(`${err.message}. Reconnect Google from the Sources tab.`);
  }
}

async function gget(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
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

export async function fetchEvents({ start, end }) {
  const { items: calendars = [] } = await gget('https://www.googleapis.com/calendar/v3/users/me/calendarList');
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
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${qs}`,
      );
      return items
        .filter((ev) => ev.status !== 'cancelled')
        .filter((ev) => !ev.attendees?.some((a) => a.self && a.responseStatus === 'declined'))
        .map((ev) => ({
          id: `google:${cal.id}:${ev.id}`,
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

export async function fetchEmails({ days = 7, max = 30 } = {}) {
  const q = `in:inbox is:unread newer_than:${days}d -category:promotions -category:social -category:forums`;
  const list = await gget(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q, maxResults: String(max) })}`,
  );
  const ids = (list.messages || []).map((m) => m.id);
  const messages = await Promise.all(
    ids.map((id) => gget(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`)),
  );
  return messages.map((m) => {
    const header = (name) => m.payload.headers.find((h) => h.name.toLowerCase() === name)?.value || '';
    return {
      id: `gmail:${m.id}`,
      source: 'gmail',
      from: header('from'),
      subject: header('subject') || '(no subject)',
      receivedAt: new Date(Number(m.internalDate)).toISOString(),
      snippet: m.snippet,
      body: clip(gmailBody(m.payload), 3000),
      url: `https://mail.google.com/mail/u/0/#inbox/${m.threadId}`,
    };
  });
}
