export const HISTORY_EVENTS = [
  'created',
  'edited',
  'status_changed',
  'priority_changed',
  'deadline_changed',
  'weight_changed',
  'moved',
  'completed',
  'reopened',
  'deleted',
] as const;
export type HistoryEventType = (typeof HISTORY_EVENTS)[number];

export interface HistoryEvent {
  id: string;
  task_id: string;
  task_title: string;
  event_type: HistoryEventType;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

/** Recorded only when a task's derived progress actually changes. */
export interface ProgressSnapshot {
  id: string;
  task_id: string;
  progress: number;
  created_at: string;
}
