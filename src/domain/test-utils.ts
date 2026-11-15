import type { Task } from './tasks/types';

let n = 0;
export function makeTask(over: Partial<Task> & { id: string }): Task {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    parent_id: null, task_type: 'task', title: over.id, description: '', status: 'todo', priority: 'medium',
    progress_percent: 0, weight: 1, position: n++, progress_method: 'equal', due_date: null,
    created_at: now, updated_at: now, completed_at: null, ...over,
  };
}
