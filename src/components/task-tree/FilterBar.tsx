import { Search, X } from 'lucide-react';
import { NO_FILTERS, isFiltering, type DeadlineFilter } from '../../domain/tasks/filter';
import { PRIORITIES, STATUSES, type Priority, type Status } from '../../domain/tasks/types';
import { useApp } from '../../stores/appStore';

const sel = 'rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm';
const STATUS_LABEL: Record<Status, string> = { todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', completed: 'Completed' };
const DEADLINES: [DeadlineFilter, string][] = [
  ['any', 'Any deadline'], ['overdue', 'Overdue'], ['today', 'Due today'], ['week', 'Due in 7 days'], ['none', 'No deadline'],
];

export function FilterBar() {
  const filters = useApp((s) => s.filters);
  const setFilters = useApp((s) => s.setFilters);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-2">
      <label className="relative min-w-40 flex-1">
        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
        <input
          type="search"
          aria-label="Search tasks"
          placeholder="Search all levels…"
          value={filters.query}
          onChange={(e) => setFilters({ query: e.target.value })}
          className={`${sel} w-full pl-7`}
        />
      </label>
      <select aria-label="Filter by status" className={sel} value={filters.status} onChange={(e) => setFilters({ status: e.target.value as Status | 'any' })}>
        <option value="any">Any status</option>
        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
      <select aria-label="Filter by priority" className={sel} value={filters.priority} onChange={(e) => setFilters({ priority: e.target.value as Priority | 'any' })}>
        <option value="any">Any priority</option>
        {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
      </select>
      <select aria-label="Filter by deadline" className={sel} value={filters.deadline} onChange={(e) => setFilters({ deadline: e.target.value as DeadlineFilter })}>
        {DEADLINES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {isFiltering(filters) && (
        <button onClick={() => setFilters(NO_FILTERS)} className="flex items-center gap-1 text-sm text-[var(--text-dim)] hover:text-[var(--text)]">
          <X size={14} /> Clear
        </button>
      )}
    </div>
  );
}
