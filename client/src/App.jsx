import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Dashboard from './components/Dashboard.jsx';
import DayPlan from './components/DayPlan.jsx';
import Applications from './components/Applications.jsx';
import GradSchool from './components/GradSchool.jsx';
import InterviewPrep from './components/InterviewPrep.jsx';
import Syllabus from './components/Syllabus.jsx';
import Sources from './components/Sources.jsx';
import { useMeetingReminders } from './reminders.js';
import { fmtDay } from './dates.js';

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'applications', label: 'Applications' },
  { id: 'grad', label: 'Grad school' },
  { id: 'prep', label: 'Interview prep' },
  { id: 'syllabus', label: 'Syllabi' },
  { id: 'sources', label: 'Sources' },
];

const AUTO_REFRESH_MS = 10 * 60_000;

function initialTab() {
  const tab = new URLSearchParams(location.search).get('tab');
  return TABS.some((t) => t.id === tab) ? tab : 'week';
}

export default function App() {
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const loadedAt = useRef(0);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      setData(await api.get(`/api/dashboard${refresh ? '?refresh=1' : ''}`));
      setError(null);
      loadedAt.current = Date.now();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(), AUTO_REFRESH_MS);
    const onFocus = () => Date.now() - loadedAt.current > 5 * 60_000 && load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const switchTab = (id) => {
    setTab(id);
    history.replaceState(null, '', id === 'week' ? '/' : `/?tab=${id}`);
  };

  const reminders = useMeetingReminders(data?.items || []);
  const problems = data ? Object.values(data.sources).filter((s) => s.status === 'error').length : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ✓
          </span>
          <div>
            <div className="brand-name">Hub</div>
            <div className="brand-date">{fmtDay(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          </div>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'tab-active' : ''}`} onClick={() => switchTab(t.id)}>
              {t.label}
              {t.id === 'sources' && problems > 0 && <span className="tab-alert">{problems}</span>}
            </button>
          ))}
        </nav>
        <div className="topbar-actions">
          {reminders.supported && !reminders.enabled && (
            <button className="btn btn-ghost" onClick={reminders.enable} title="Get a desktop notification 10 minutes before each meeting">
              🔔 Enable reminders
            </button>
          )}
          <button className="btn" onClick={() => load(true)} disabled={loading}>
            {loading ? 'Syncing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && <div className="banner banner-danger">Couldn't load your dashboard: {error}</div>}

      <main>
        {!data && !error && <div className="empty">Loading your week…</div>}
        {data && tab === 'today' && <DayPlan data={data} reload={load} />}
        {data && tab === 'week' && <Dashboard data={data} reload={load} goTo={switchTab} />}
        {data && tab === 'applications' && <Applications applications={data.applications} reload={load} />}
        {data && tab === 'prep' && <InterviewPrep data={data} reload={load} />}
        {data && tab === 'grad' && <GradSchool data={data} reload={load} />}
        {tab === 'syllabus' && <Syllabus reload={load} />}
        {data && tab === 'sources' && <Sources sources={data.sources} reload={load} />}
      </main>
    </div>
  );
}
