export const CATEGORIES = {
  school: { label: 'School', color: 'var(--c-school)' },
  capstone: { label: 'Capstone', color: 'var(--c-capstone)' },
  jobs: { label: 'Jobs', color: 'var(--c-jobs)' },
  grad: { label: 'Grad school', color: 'var(--c-grad)' },
  leetcode: { label: 'LeetCode', color: 'var(--c-leetcode)' },
  health: { label: 'Gym & diet', color: 'var(--c-health)' },
  meeting: { label: 'Meetings', color: 'var(--c-meeting)' },
  personal: { label: 'Personal', color: 'var(--c-personal)' },
};

export const SOURCE_LABELS = {
  canvas: 'Canvas',
  google: 'Google Calendar',
  outlook: 'Outlook',
  ics: 'Calendar feed',
  manual: 'Task',
  syllabus: 'Syllabus',
  applications: 'Applications',
  gmail: 'Gmail',
};

export const DONE_STATUSES = ['done', 'submitted', 'graded'];

export function isDone(item) {
  return DONE_STATUSES.includes(item.status);
}
