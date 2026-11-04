import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { dueLabel } from '../dates.js';

const TYPES = ['assignment', 'exam', 'quiz', 'project', 'reading', 'presentation', 'other'];

export default function Syllabus({ reload }) {
  const [saved, setSaved] = useState([]);
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const loadSaved = async () => setSaved(await api.get('/api/syllabus'));
  useEffect(() => {
    loadSaved();
  }, []);

  const extract = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      if (file) form.append('file', file);
      else form.append('text', text);
      const result = await api.post('/api/syllabus/extract', form);
      setPreview({ ...result, items: result.items.map((it) => ({ ...it, keep: true })) });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    await api.post('/api/syllabus/save', { course: preview.course, items: preview.items.filter((it) => it.keep) });
    setPreview(null);
    setFile(null);
    setText('');
    await loadSaved();
    reload();
  };

  const editItem = (i, patch) => setPreview((p) => ({ ...p, items: p.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));

  const removeCourse = async (course) => {
    if (!confirm(`Remove all syllabus dates for ${course}?`)) return;
    await api.post('/api/syllabus/delete-course', { course });
    await loadSaved();
    reload();
  };

  const removeItem = async (id) => {
    await api.del(`/api/syllabus/${id}`);
    await loadSaved();
    reload();
  };

  const byCourse = saved.reduce((acc, s) => ((acc[s.course] ||= []).push(s), acc), {});

  return (
    <div className="page">
      <section className="card">
        <h2>Add a syllabus</h2>
        <p className="hint">
          Upload a syllabus PDF (or paste its text). Claude finds every dated assignment, exam and milestone. You review the list before anything is saved.
          Tip: skip this for courses where Canvas already lists every assignment.
        </p>
        <form onSubmit={extract} className="syllabus-form">
          <input type="file" accept=".pdf,.txt,.md" onChange={(e) => setFile(e.target.files[0] || null)} aria-label="Syllabus file" />
          {!file && <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste syllabus text here" rows={5} />}
          <button className="btn btn-primary" disabled={busy || (!file && !text.trim())}>
            {busy ? 'Reading syllabus… (up to a minute)' : 'Find due dates'}
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </section>

      {preview && (
        <section className="card card-accent">
          <div className="card-head">
            <h2>Review: </h2>
            <input className="course-input" value={preview.course} onChange={(e) => setPreview({ ...preview, course: e.target.value })} aria-label="Course name" />
          </div>
          <p className="hint">
            Found {preview.items.length} dated items. Untick anything you don't want and fix any wrong dates, then save.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Keep</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {preview.items.map((it, i) => (
                  <tr key={i} className={it.keep ? '' : 'row-muted'}>
                    <td>
                      <input type="checkbox" checked={it.keep} onChange={(e) => editItem(i, { keep: e.target.checked })} aria-label={`Keep ${it.title}`} />
                    </td>
                    <td>
                      <input value={it.title} onChange={(e) => editItem(i, { title: e.target.value })} aria-label="Title" />
                    </td>
                    <td>
                      <select value={it.type} onChange={(e) => editItem(i, { type: e.target.value })} aria-label="Type">
                        {TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input type="date" value={it.date} onChange={(e) => editItem(i, { date: e.target.value })} aria-label="Date" />
                    </td>
                    <td>
                      <input type="time" value={it.time || ''} onChange={(e) => editItem(i, { time: e.target.value || null })} aria-label="Time" />
                    </td>
                    <td className="muted">{it.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions">
            <button className="btn btn-primary" onClick={save}>
              Save {preview.items.filter((it) => it.keep).length} items
            </button>
            <button className="btn btn-ghost" onClick={() => setPreview(null)}>
              Discard
            </button>
          </div>
        </section>
      )}

      {Object.entries(byCourse).map(([course, list]) => (
        <section key={course} className="card">
          <div className="card-head">
            <h2>{course}</h2>
            <button className="btn btn-small btn-ghost" onClick={() => removeCourse(course)}>
              Remove course
            </button>
          </div>
          <div className="list">
            {[...list]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((s) => (
                <div key={s.id} className="item">
                  <div className="item-body">
                    <div className="item-title">{s.title}</div>
                    <div className="item-meta">
                      <span>{dueLabel({ when: s.time ? `${s.date}T${s.time}` : s.date, allDay: !s.time })}</span>
                      <span>{s.type}</span>
                      {s.notes && <span className="muted">{s.notes}</span>}
                    </div>
                  </div>
                  <button className="icon-btn" onClick={() => removeItem(s.id)} aria-label={`Delete ${s.title}`}>
                    ×
                  </button>
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
