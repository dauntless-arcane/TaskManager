export const TASK_TYPES = ['project', 'task'] as const;
export const STATUSES = ['todo', 'in_progress', 'blocked', 'completed'] as const;
export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export const PROGRESS_METHODS = ['leaf', 'equal', 'weighted'] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type ProgressMethod = (typeof PROGRESS_METHODS)[number];

export interface Task {
  id: string;
  parent_id: string | null;
  task_type: TaskType;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  /** Manual progress (0-100). Only meaningful for leaf tasks; parents are derived. */
  progress_percent: number;
  /** Relative weight among siblings; used by the 'weighted' method. */
  weight: number;
  position: number;
  /** Method used to derive this task's progress from its children. */
  progress_method: ProgressMethod;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
