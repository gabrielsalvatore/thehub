import { useState } from 'react';
import { api } from '../api.js';
import { dueLabel } from '../dates.js';

const STATUSES = ['to apply', 'in progress', 'applied', 'interview', 'offer', 'accepted', 'rejected'];
const EMPTY = { type: 'job', name: '', role: '', deadline: '', url: '' };

export default function Applications({ applications, reload }) {
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);

  const list = applications.filter((a) => filter === 'all' || a.type === filter);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, list.filter((a) => a.status === s).length]));

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/applications', { ...form, deadline: form.deadline || null });
      setForm({ ...EMPTY, type: form.type });
      setError(null);
      reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const update = async (a, patch) => {
    await api.patch(`/api/applications/${a.id}`, patch);
    reload();
  };

  const remove = async (a) => {
    if (!confirm(`Delete ${a.name}?`)) return;
    await api.del(`/api/applications/${a.id}`);
    reload();
  };

  const sorted = [...list].sort(
    (a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || String(a.deadline || '9').localeCompare(String(b.deadline || '9')),
  );

  return (
    <div className="page">
      <section className="card">
        <div className="card-head">
          <h2>Applications</h2>
          <div className="segmented">
            {[
              ['all', 'All'],
              ['job', 'Jobs'],
              ['grad', 'Grad school'],
            ].map(([key, label]) => (
              <button key={key} className={filter === key ? 'seg-active' : ''} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="pipeline">
          {STATUSES.map((s) => (
            <div key={s} className="pipeline-step">
              <div className="pipeline-num">{counts[s]}</div>
              <div className="pipeline-label">{s}</div>
            </div>
          ))}
        </div>
        <p className="hint">Deadlines for anything still "to apply" or "in progress" show up on your weekly view.</p>

        <form className="app-form" onSubmit={add}>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} aria-label="Type">
            <option value="job">Job</option>
            <option value="grad">Grad school</option>
          </select>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={form.type === 'grad' ? 'University' : 'Company'} aria-label="Name" />
          <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder={form.type === 'grad' ? 'Program' : 'Role'} aria-label="Role or program" />
          <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} aria-label="Deadline" />
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="Link (optional)" aria-label="Link" />
          <button className="btn btn-primary">Add</button>
        </form>
        {error && <p className="error-text">{error}</p>}

        {sorted.length === 0 ? (
          <p className="empty-small">No applications yet. Add the first one above.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role / program</th>
                  <th>Type</th>
                  <th>Deadline</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorted.map((a) => (
                  <tr key={a.id} className={a.status === 'rejected' ? 'row-muted' : ''}>
                    <td>
                      {a.url ? (
                        <a href={a.url} target="_blank" rel="noreferrer">
                          {a.name}
                        </a>
                      ) : (
                        a.name
                      )}
                    </td>
                    <td>{a.role}</td>
                    <td>{a.type === 'grad' ? 'Grad' : 'Job'}</td>
                    <td>
                      <input type="date" value={a.deadline || ''} onChange={(e) => update(a, { deadline: e.target.value || null })} aria-label={`Deadline for ${a.name}`} />
                      {a.deadline && <span className="muted"> {dueLabel({ when: a.deadline, allDay: true })}</span>}
                    </td>
                    <td>
                      <select value={a.status} onChange={(e) => update(a, { status: e.target.value })} aria-label={`Status for ${a.name}`}>
                        {STATUSES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button className="icon-btn" onClick={() => remove(a)} aria-label={`Delete ${a.name}`}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
