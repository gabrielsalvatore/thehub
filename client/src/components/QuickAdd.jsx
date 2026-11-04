import { useState } from 'react';
import { api } from '../api.js';
import { CATEGORIES } from '../categories.js';

const TASK_CATEGORIES = Object.entries(CATEGORIES).filter(([key]) => key !== 'meeting');

export default function QuickAdd({ onAdded }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('school');
  const [due, setDue] = useState('');
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await api.post('/api/tasks', { title: title.trim(), category, due: due || null });
      setTitle('');
      setDue('');
      setError(null);
      onAdded();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="quickadd" onSubmit={submit}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Draft capstone lit review" aria-label="Task title" />
      <div className="quickadd-row">
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          {TASK_CATEGORIES.map(([key, c]) => (
            <option key={key} value={key}>
              {c.label}
            </option>
          ))}
        </select>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
        <button className="btn btn-primary">Add</button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
