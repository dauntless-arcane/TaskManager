import { describe, expect, it } from 'vitest';
import { makeTask as t } from '../test-utils';
import { NO_FILTERS, isOverdue, visibleIdsFor } from './filter';

const now = new Date(2026, 5, 15); // 2026-06-15 local
const tasks = [
  t({ id: 'root', title: 'Website' }),
  t({ id: 'a', parent_id: 'root', title: 'Design', priority: 'high', due_date: '2026-06-10' }),
  t({ id: 'a1', parent_id: 'a', title: 'Logo', status: 'completed', due_date: '2026-06-10' }),
  t({ id: 'b', parent_id: 'root', title: 'Deploy', due_date: '2026-06-20' }),
  t({ id: 'c', title: 'Unrelated' }),
];

describe('filters', () => {
  it('returns null when nothing is filtered', () => {
    expect(visibleIdsFor(tasks, NO_FILTERS, now)).toBeNull();
    expect(visibleIdsFor(tasks, { ...NO_FILTERS, query: '   ' }, now)).toBeNull();
  });

  it('search matches any depth and keeps ancestors for context', () => {
    const r = visibleIdsFor(tasks, { ...NO_FILTERS, query: 'logo' }, now)!;
    expect([...r.matched]).toEqual(['a1']);
    expect([...r.visible].sort()).toEqual(['a', 'a1', 'root']);
  });

  it('filters by status and priority', () => {
    expect([...visibleIdsFor(tasks, { ...NO_FILTERS, status: 'completed' }, now)!.matched]).toEqual(['a1']);
    expect([...visibleIdsFor(tasks, { ...NO_FILTERS, priority: 'high' }, now)!.matched]).toEqual(['a']);
  });

  it('deadline filters: overdue excludes completed, week is inclusive, none', () => {
    expect([...visibleIdsFor(tasks, { ...NO_FILTERS, deadline: 'overdue' }, now)!.matched]).toEqual(['a']);
    expect([...visibleIdsFor(tasks, { ...NO_FILTERS, deadline: 'week' }, now)!.matched]).toEqual(['b']);
    expect([...visibleIdsFor(tasks, { ...NO_FILTERS, deadline: 'none' }, now)!.matched].sort()).toEqual(['c', 'root']);
    expect(isOverdue(tasks[2], '2026-06-15')).toBe(false);
  });
});
