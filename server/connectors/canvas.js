// Canvas LMS via a personal access token (Canvas → Account → Settings →
// "+ New Access Token"). Uses the Planner API, which returns assignments,
// quizzes and discussions across all courses with submission status.

const KIND_BY_TYPE = {
  assignment: 'assignment',
  quiz: 'assignment',
  discussion_topic: 'assignment',
  wiki_page: 'assignment',
  calendar_event: 'event',
  planner_note: 'task',
};

// "International Business (26/FA, 01)" -> "International Business"
function courseName(name) {
  return name ? name.replace(/\s*\([^)]*\/[^)]*\)\s*$/, '') : null;
}

export function isConfigured() {
  return Boolean(process.env.CANVAS_BASE_URL && process.env.CANVAS_TOKEN);
}

async function canvasGetAll(pathAndQuery) {
  const base = process.env.CANVAS_BASE_URL.replace(/\/$/, '');
  let url = `${base}${pathAndQuery}`;
  const out = [];
  // Canvas paginates with Link headers; cap pages so a bad response can't loop forever.
  for (let page = 0; url && page < 20; page++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.CANVAS_TOKEN}` } });
    if (!res.ok) throw new Error(`Canvas ${res.status}: ${(await res.text()).slice(0, 200)}`);
    out.push(...(await res.json()));
    const next = (res.headers.get('link') || '').split(',').find((part) => part.includes('rel="next"'));
    url = next ? next.match(/<([^>]+)>/)[1] : null;
  }
  return out;
}

function statusFor(item, now) {
  if (item.planner_override?.marked_complete) return 'done';
  const sub = item.submissions;
  if (!sub) return 'todo';
  if (sub.graded) return 'graded';
  if (sub.excused) return 'done';
  if (sub.submitted) return 'submitted';
  if (sub.missing) return 'missing';
  const due = item.plannable?.due_at || item.plannable_date;
  if (due && new Date(due) < now) return 'missing';
  return 'todo';
}

export async function fetchItems({ start, end }) {
  const base = process.env.CANVAS_BASE_URL.replace(/\/$/, '');
  const qs = new URLSearchParams({
    start_date: start.toISOString(),
    end_date: end.toISOString(),
    per_page: '100',
  });
  const raw = await canvasGetAll(`/api/v1/planner/items?${qs}`);
  const now = new Date();

  return raw
    .filter((item) => item.plannable_type !== 'announcement')
    .map((item) => {
      const kind = KIND_BY_TYPE[item.plannable_type] || 'assignment';
      const when = item.plannable?.due_at || item.plannable_date;
      const course = courseName(item.context_name);
      const rawTitle = item.plannable?.title || item.plannable?.name || 'Untitled';
      // Class meetings come through titled with the full course name.
      const title = rawTitle === item.context_name ? course : rawTitle;
      return {
        id: `canvas:${item.plannable_type}:${item.plannable_id}`,
        source: 'canvas',
        kind,
        category: 'school',
        title,
        course,
        when,
        end: item.plannable?.end_at || null,
        allDay: Boolean(item.plannable?.all_day),
        url: item.html_url ? (item.html_url.startsWith('http') ? item.html_url : base + item.html_url) : null,
        status: kind === 'event' ? null : statusFor(item, now),
        points: item.plannable?.points_possible ?? null,
      };
    });
}
