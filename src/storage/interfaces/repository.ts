import type { HistoryEvent, ProgressSnapshot } from '../../domain/history/types';
import type { Task } from '../../domain/tasks/types';

/** One atomic unit of work. Either every part is applied or none is. */
export interface CommitBatch {
  putTasks?: Task[];
  deleteTaskIds?: string[];
  history?: HistoryEvent[];
  snapshots?: ProgressSnapshot[];
}

/**
 * Storage boundary. Implemented by IndexedDB (web) and SQLite (desktop).
 * Domain/services depend only on this interface.
 */
export interface Repository {
  getAllTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  /** parentId null returns root tasks. Sorted by position. */
  getChildren(parentId: string | null): Promise<Task[]>;
  /** Root plus all descendants. */
  getSubtree(rootId: string): Promise<Task[]>;

  commit(batch: CommitBatch): Promise<void>;

  getHistory(taskId?: string): Promise<HistoryEvent[]>;
  getSnapshots(taskId: string): Promise<ProgressSnapshot[]>;

  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}
