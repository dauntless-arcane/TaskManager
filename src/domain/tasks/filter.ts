import { getAncestorIds, indexTasks } from './tree';
import type { Priority, Status, Task } from './types';

export type DeadlineFilter = 'any' | 'overdue' | 'today' | 'week' | 'none';

export interface TaskFilters {
  query: string;
  status: Status | 'any';
  priority: Priority | 'any';
  deadline: DeadlineFilter;
}

export const NO_FILTERS: TaskFilters = { query: '', status: 'any', priority: 'any', deadline: 'any' };

export const isFiltering = (f: TaskFilters): boolean =>
  f.query.trim() !== '' || f.status !== 'any' || f.priority !== 'any' || f.deadline !== 'any';

/** Date-only (YYYY-MM-DD) in local time, matching what <input type="date"> produces. */
export function localDateString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const isOverdue = (t: Task, today: string): boolean =>
  t.due_date !== null && t.due_date < today && t.status !== 'completed';

function matches(t: Task, f: TaskFilters, today: string, weekEnd: string): boolean {
  const q = f.query.trim().toLowerCase();
  if (q && !t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
  if (f.status !== 'any' && t.status !== f.status) return false;
  if (f.priority !== 'any' && t.priority !== f.priority) return false;
  switch (f.deadline) {
    case 'overdue': return isOverdue(t, today);
    case 'today': return t.due_date === today;
    case 'week': return t.due_date !== null && t.due_date >= today && t.due_date <= weekEnd;
    case 'none': return t.due_date === null;
    default: return true;
  }
}

/**
 * Ids to display while filtering: every matching task plus all of its ancestors,
 * so a match deep in the tree is shown in context. Returns null when no filter is active.
 */
export function visibleIdsFor(tasks: readonly Task[], f: TaskFilters, now: Date = new Date()): { visible: Set<string>; matched: Set<string> } | null {
  if (!isFiltering(f)) return null;
  const today = localDateString(now);
  const weekEnd = localDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
  const index = indexTasks(tasks);
  const matched = new Set<string>();
  const visible = new Set<string>();
  for (const t of tasks) {
    if (!matches(t, f, today, weekEnd)) continue;
    matched.add(t.id);
    visible.add(t.id);
    for (const a of getAncestorIds(index, t.id)) visible.add(a);
  }
  return { visible, matched };
}
