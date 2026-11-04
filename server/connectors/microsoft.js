// Outlook.com mail + calendar via Microsoft Graph (personal accounts).
// Setup: register an app in the Microsoft Entra admin center with redirect URI
// http://localhost:4321/auth/microsoft/callback (see README).
import * as store from '../store.js';
import { htmlToText, clip } from '../util/text.js';

const AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const SCOPES = 'offline_access User.Read Mail.Read Calendars.Read';
const GRAPH = 'https://graph.microsoft.com/v1.0';

function redirectUri() {
  return `${process.env.PUBLIC_URL}/auth/microsoft/callback`;
}

export function isConfigured() {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

export function isConnected() {
  return Boolean(store.get().tokens.microsoft?.refresh_token);
}

export function authUrl(state) {
  const qs = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'query',
    scope: SCOPES,
    state,
  });
  return `${AUTHORITY}/authorize?${qs}`;
}

async function tokenRequest(params) {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      scope: SCOPES,
      ...params,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Microsoft token error: ${body.error_description || body.error}`);
  return body;
}

function saveTokens(t) {
  store.update((db) => {
    db.tokens.microsoft = {
      access_token: t.access_token,
      // Microsoft rotates refresh tokens; always keep the newest one.
      refresh_token: t.refresh_token || db.tokens.microsoft?.refresh_token,
      expires_at: Date.now() + t.expires_in * 1000,
    };
  });
}

export async function handleCallback(code) {
  saveTokens(await tokenRequest({ code, redirect_uri: redirectUri(), grant_type: 'authorization_code' }));
}

export function disconnect() {
  store.update((db) => delete db.tokens.microsoft);
}

async function accessToken() {
  const tok = store.get().tokens.microsoft;
  if (!tok?.refresh_token) throw new Error('Outlook is not connected');
  if (tok.access_token && tok.expires_at > Date.now() + 60_000) return tok.access_token;
  saveTokens(await tokenRequest({ refresh_token: tok.refresh_token, grant_type: 'refresh_token' }));
  return store.get().tokens.microsoft.access_token;
}

async function graph(pathAndQuery, extraHeaders = {}) {
  const res = await fetch(`${GRAPH}${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${await accessToken()}`, ...extraHeaders },
  });
  if (!res.ok) throw new Error(`Outlook ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export async function fetchEvents({ start, end }) {
  const qs = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $top: '250',
    $select: 'id,subject,start,end,isAllDay,isCancelled,location,webLink,onlineMeeting,responseStatus',
  });
  const { value = [] } = await graph(`/me/calendarView?${qs}`, { Prefer: 'outlook.timezone="UTC"' });
  // With the UTC preference Graph returns "2026-11-03T15:00:00.0000000" (no offset).
  const utc = (dt) => (dt.endsWith('Z') ? dt : `${dt}Z`);
  return value
    .filter((ev) => !ev.isCancelled && ev.responseStatus?.response !== 'declined')
    .map((ev) => ({
      id: `outlook:${ev.id}`,
      source: 'outlook',
      kind: 'event',
      category: 'meeting',
      title: ev.subject || '(no title)',
      when: ev.isAllDay ? ev.start.dateTime.slice(0, 10) : utc(ev.start.dateTime),
      end: ev.isAllDay ? ev.end.dateTime.slice(0, 10) : utc(ev.end.dateTime),
      allDay: ev.isAllDay,
      location: ev.location?.displayName || null,
      url: ev.webLink,
      joinUrl: ev.onlineMeeting?.joinUrl || null,
    }));
}

export async function fetchEmails({ days = 7, max = 30 } = {}) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const qs = new URLSearchParams({
    $filter: `isRead eq false and receivedDateTime ge ${since}`,
    $top: String(max),
    $select: 'id,subject,from,receivedDateTime,bodyPreview,body,webLink,inferenceClassification',
  });
  const { value = [] } = await graph(`/me/mailFolders/inbox/messages?${qs}`, {
    Prefer: 'outlook.body-content-type="text"',
  });
  return value
    .filter((m) => m.inferenceClassification !== 'other') // keep "Focused" inbox only
    .map((m) => ({
      id: `outlook:${m.id}`,
      source: 'outlook',
      from: m.from?.emailAddress ? `${m.from.emailAddress.name} <${m.from.emailAddress.address}>` : '',
      subject: m.subject || '(no subject)',
      receivedAt: m.receivedDateTime,
      snippet: m.bodyPreview,
      body: clip(m.body?.contentType === 'html' ? htmlToText(m.body.content) : m.body?.content, 3000),
      url: m.webLink,
    }));
}
