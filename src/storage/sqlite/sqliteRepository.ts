import type { HistoryEvent, ProgressSnapshot } from '../../domain/history/types';
import type { Task } from '../../domain/tasks/types';
import type { CommitBatch, Repository } from '../interfaces/repository';

export type SqlParam = string | number | null;
export type Row = Record<string, string | number | null>;
export interface SqlStatement {
  sql: string;
  params: SqlParam[];
}

/** Platform boundary for SQLite: Tauri IPC in the desktop app, node:sqlite in tests. */
export interface SqlExecutor {
  select(sql: string, params?: SqlParam[]): Promise<Row[]>;
  /** Runs all statements in one transaction; any failure rolls everything back. */
  commit(statements: SqlStatement[]): Promise<void>;
}

const TASK_COLUMNS = [
  'id', 'parent_id', 'task_type', 'title', 'description', 'status', 'priority', 'progress_percent', 'weight',
  'position', 'progress_method', 'due_date', 'created_at', 'updated_at', 'completed_at',
] as const;

const upsertTask = (t: Task): SqlStatement => ({
  // UPSERT, never INSERT OR REPLACE: REPLACE deletes the row first and would cascade-delete its children.
  sql: `INSERT INTO tasks (${TASK_COLUMNS.join(',')}) VALUES (${TASK_COLUMNS.map(() => '?').join(',')})
        ON CONFLICT(id) DO UPDATE SET ${TASK_COLUMNS.filter((c) => c !== 'id').map((c) => `${c}=excluded.${c}`).join(',')}`,
  params: TASK_COLUMNS.map((c) => t[c]),
});

const toTask = (r: Row): Task => r as unknown as Task;

export class SqliteRepository implements Repository {
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor) {
    this.db = db;
  }

  async getAllTasks(): Promise<Task[]> {
    return (await this.db.select('SELECT * FROM tasks')).map(toTask);
  }

  async getTask(id: string): Promise<Task | null> {
    const rows = await this.db.select('SELECT * FROM tasks WHERE id = ?', [id]);
    return rows[0] ? toTask(rows[0]) : null;
  }

  async getChildren(parentId: string | null): Promise<Task[]> {
    const rows =
      parentId === null
        ? await this.db.select('SELECT * FROM tasks WHERE parent_id IS NULL ORDER BY position')
        : await this.db.select('SELECT * FROM tasks WHERE parent_id = ? ORDER BY position', [parentId]);
    return rows.map(toTask);
  }

  async getSubtree(rootId: string): Promise<Task[]> {
    const rows = await this.db.select(
      `WITH RECURSIVE sub(id, depth) AS (
         SELECT id, 0 FROM tasks WHERE id = ?
         UNION ALL
         SELECT t.id, sub.depth + 1 FROM tasks t JOIN sub ON t.parent_id = sub.id
       )
       SELECT t.* FROM tasks t JOIN sub ON t.id = sub.id ORDER BY sub.depth, t.position`,
      [rootId],
    );
    return rows.map(toTask);
  }

  async commit(batch: CommitBatch): Promise<void> {
    const statements: SqlStatement[] = [{ sql: 'PRAGMA defer_foreign_keys = ON', params: [] }];
    for (const t of batch.putTasks ?? []) statements.push(upsertTask(t));
    for (const id of batch.deleteTaskIds ?? []) statements.push({ sql: 'DELETE FROM tasks WHERE id = ?', params: [id] });
    for (const h of batch.history ?? []) {
      statements.push({
        sql: 'INSERT OR REPLACE INTO history (id,task_id,task_title,event_type,old_value,new_value,created_at) VALUES (?,?,?,?,?,?,?)',
        params: [h.id, h.task_id, h.task_title, h.event_type, h.old_value, h.new_value, h.created_at],
      });
    }
    for (const s of batch.snapshots ?? []) {
      statements.push({
        sql: 'INSERT OR REPLACE INTO snapshots (id,task_id,progress,created_at) VALUES (?,?,?,?)',
        params: [s.id, s.task_id, s.progress, s.created_at],
      });
    }
    await this.db.commit(statements);
  }

  async getHistory(taskId?: string): Promise<HistoryEvent[]> {
    const rows = taskId
      ? await this.db.select('SELECT * FROM history WHERE task_id = ? ORDER BY created_at', [taskId])
      : await this.db.select('SELECT * FROM history ORDER BY created_at');
    return rows as unknown as HistoryEvent[];
  }

  async getSnapshots(taskId: string): Promise<ProgressSnapshot[]> {
    const rows = await this.db.select('SELECT * FROM snapshots WHERE task_id = ? ORDER BY created_at', [taskId]);
    return rows as unknown as ProgressSnapshot[];
  }

  async getSetting(key: string): Promise<string | null> {
    const rows = await this.db.select('SELECT value FROM settings WHERE key = ?', [key]);
    return (rows[0]?.value as string | undefined) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.db.commit([{ sql: 'INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', params: [key, value] }]);
  }
}
