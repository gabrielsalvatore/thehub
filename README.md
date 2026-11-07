# Hub

One page that shows everything on your plate this week: Canvas assignments, syllabus deadlines, Google and Outlook meetings, emails that need a reply, job and grad-school application deadlines, and daily habits (gym, diet, LeetCode). It runs on your Mac, starts when you log in, and keeps all your data local.

```
┌ Next up · in 12 min: Capstone advisor meeting                   [Join meeting] ┐
├ Overdue (2) ───────────────────────────────────────────────────────────────────┤
├ Your week, summarized (AI) ─────────────┬ Today ───────────────────────────────┤
│ Focus today / Watch out / Rest of week  │ Schedule · Due today · Due tomorrow  │
├ This week  Mon  Tue  Wed  Thu  Fri  Sat  Sun   (filter by School/Jobs/Grad/…) ─┤
├ Inbox: emails that need you ────┬ Habits (streaks) ────┬ Add a task ───────────┤
```

## Quick start

```bash
cp .env.example .env     # then fill in what you have (all sources are optional)
npm install
npm start                # builds the UI and serves http://localhost:4321
```

For development with hot reload, run `npm run dev` and open http://localhost:5173.

### Double-click to open

```bash
npm run app:install     # remove with: npm run app:uninstall
```

This creates `~/Applications/Hub.app` and a Hub shortcut on your Desktop. When you double-click it, it starts the server if it isn't already running, rebuilding the UI if the source changed, and then opens Hub in your browser. Drag it to the Dock to keep it there. The first launch asks for permission to access the Desktop folder, because this project lives there. If you move the project folder, run `npm run app:install` again.

### Start at login

To make Hub start and open automatically every time you log in:

```bash
npm run autostart:install     # remove with: npm run autostart:uninstall
```

> **Heads-up:** macOS privacy protection can stop background apps from reading `~/Desktop`. If Hub doesn't open after you log in, check `data/hub.log`. The easy fix is to move this folder to something like `~/Developer/hub` and run `npm run autostart:install` again.

Tip: in Chrome, open http://localhost:4321, then use **⋮ → Cast, save and share → Install page as app**. In Safari, use **File → Add to Dock**. Either way Hub gets its own window and Dock icon.

## Connecting your accounts

Each source is optional. The **Sources** tab shows what's connected. Restart Hub after editing `.env`.

### Canvas

1. In Canvas, go to **Account → Settings → Approved Integrations → + New Access Token**.
2. In `.env`, set `CANVAS_BASE_URL` (for example `https://yourschool.instructure.com`) and `CANVAS_TOKEN`.

Hub uses the Planner API, so it sees **missing**, **submitted** and **graded** status across all courses.

*If your school disables tokens:* open Canvas **Calendar → Calendar Feed**, copy the link, and add it to `ICS_FEEDS` as `Canvas|https://…`. You'll get due dates but not submission status.

### Google Calendar + Gmail

1. Go to https://console.cloud.google.com and create a project (for example "Hub").
2. Under **APIs & Services → Library**, enable **Gmail API** and **Google Calendar API**.
3. Under **Google Auth Platform → Branding**, set an app name and your email. Then under **Audience**, choose **External** and add your Gmail address as a **Test user**.
4. Under **Clients → Create client**, choose type **Web application** and add the authorized redirect URI `http://localhost:4321/auth/google/callback`.
5. Put the client ID and secret into `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Then click **Connect** in the Sources tab.

To add more accounts (for example a school account and a personal Gmail), click **+ Add another Google account** in the Sources tab. Their inboxes and calendars are merged, and each email shows which account it came from. A Google Cloud project with an **Internal** audience only lets accounts from that Workspace sign in. To add a personal Gmail, switch the audience to **External** and add the Gmail address as a test user.

Access is read-only (`calendar.readonly`, `gmail.readonly`). While the app is in **Testing** mode, Google expires the login after 7 days, and Hub will ask you to reconnect. To stop that, click **Publish app** on the Audience page. Google will show an "unverified app" warning when you sign in, which is fine for your own account.

### Outlook.com (mail + calendar)

1. Go to https://entra.microsoft.com, open **App registrations → New registration**, and sign in with your Outlook account.
   - Supported account types: **Personal Microsoft accounts only**.
   - Redirect URI: platform **Web**, `http://localhost:4321/auth/microsoft/callback`.
2. Under **Certificates & secrets → New client secret**, copy the secret's **Value**.
3. Put the Application (client) ID and the secret into `.env` as `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`. Then click **Connect** in the Sources tab.

*If Microsoft won't let you register an app* (personal accounts sometimes need a free Azure sign-up first), use these workarounds:
- **Calendar:** in Outlook.com go to **Settings → Calendar → Shared calendars → Publish a calendar**, copy the ICS link, and add it to `ICS_FEEDS`.
- **Email:** in Outlook.com go to **Settings → Mail → Forwarding**, and forward to your Gmail. It then shows up in Hub's Gmail inbox.

### Other calendars

`ICS_FEEDS` takes comma-separated `Name|URL` pairs. Any `.ics` or `webcal://` link works, including clubs, sports schedules and shared calendars.

### AI (Claude)

Create an API key at https://platform.claude.com and set `ANTHROPIC_API_KEY` in `.env`. This turns on three features:

- **Daily briefing:** a short plan for today, warnings about tight deadlines, and a focus for each remaining day of the week. It's generated once a day, and you can regenerate it at any time.
- **Inbox triage:** each unread email gets a one-line summary, a priority, and a "needs action?" flag. Any deadline in the email is pulled out, and you can turn it into a task with one click. Each email is only analyzed once.
- **Syllabus reader:** upload a syllabus PDF and Claude extracts every dated deliverable. You review and edit the list before saving.

The default model is `claude-opus-5-5`. Expect a few dollars a month for normal use. For a much cheaper option, set `ANTHROPIC_MODEL=claude-haiku-5-5`.

## Meeting reminders

Click **🔔 Enable reminders** in the top bar. Hub then sends a desktop notification 10 minutes before each meeting and again when it starts. If the meeting has a Zoom, Teams or Meet link, clicking the notification opens it. Reminders work while the Hub tab or window is open.

## Where things live

```
server/
  index.js            Express API + OAuth routes (listens on 127.0.0.1 only)
  aggregate.js        Merges all sources into one list, 10-min cache
  ai.js               Claude: syllabus extraction, email triage, briefing
  store.js            JSON storage in data/db.json
  connectors/         canvas.js, google.js, microsoft.js, ics.js
client/src/
  App.jsx             Tabs, auto-refresh, reminders
  components/         Dashboard, WeekGrid, Briefing, Inbox, Habits, Applications, Syllabus, Sources
scripts/autostart.js  macOS LaunchAgent installer
data/                 db.json (tasks, tokens, cache) and hub.log. Gitignored.
```

Tokens and personal data never leave your machine, except API calls to Canvas, Google, Microsoft, and (if enabled) Anthropic. `data/` and `.env` are gitignored.
