import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { HistoryEvent, ProgressSnapshot } from '../../domain/history/types';
import type { Task } from '../../domain/tasks/types';
import type { CommitBatch, Repository } from '../interfaces/repository';

export const DB_VERSION = 1;

/** Stored shape: roots use parent_id '' because IndexedDB cannot index null keys. */
type TaskRow = Omit<Task, 'parent_id'> & { parent_id: string };

interface TaskFlowDB extends DBSchema {
  tasks: {
    key: string;
    value: TaskRow;
    indexes: { parent_id: string; status: string; priority: string; due_date: string; title: string };
  };
  history: {
    key: string;
    value: HistoryEvent;
    indexes: { task_id: string; created_at: string };
  };
  snapshots: {
    key: string;
    value: ProgressSnapshot;
    indexes: { task_id: string };
  };
  settings: { key: string; value: { key: string; value: string } };
}

export async function openTaskFlowDB(name = 'taskflow'): Promise<IDBPDatabase<TaskFlowDB>> {
  return openDB<TaskFlowDB>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Each block migrates from exactly one version to the next.
      if (oldVersion < 1) {
        const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
        // IndexedDB cannot index null keys; parent_id is stored as '' for roots (see toRow/fromRow).
        tasks.createIndex('parent_id', 'parent_id');
        tasks.createIndex('status', 'status');
        tasks.createIndex('priority', 'priority');
        tasks.createIndex('due_date', 'due_date');
        tasks.createIndex('title', 'title');
        const history = db.createObjectStore('history', { keyPath: 'id' });
        history.createIndex('task_id', 'task_id');
        history.createIndex('created_at', 'created_at');
        db.createObjectStore('snapshots', { keyPath: 'id' }).createIndex('task_id', 'task_id');
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    },
  });
}

/** Roots are stored with parent_id '' so the index covers them; domain code still sees null. */
const toRow = (t: Task): TaskRow => ({ ...t, parent_id: t.parent_id ?? '' });
const fromRow = (t: TaskRow): Task => ({ ...t, parent_id: t.parent_id === '' ? null : t.parent_id });

export class IdbRepository implements Repository {
  private readonly db: IDBPDatabase<TaskFlowDB>;

  constructor(db: IDBPDatabase<TaskFlowDB>) {
    this.db = db;
  }

  static async open(name?: string): Promise<IdbRepository> {
    return new IdbRepository(await openTaskFlowDB(name));
  }

  async getAllTasks(): Promise<Task[]> {
    return (await this.db.getAll('tasks')).map(fromRow);
  }

  async getTask(id: string): Promise<Task | null> {
    const row = await this.db.get('tasks', id);
    return row ? fromRow(row) : null;
  }

  async getChildren(parentId: string | null): Promise<Task[]> {
    const rows = await this.db.getAllFromIndex('tasks', 'parent_id', parentId ?? '');
    return rows.map(fromRow).sort((a, b) => a.position - b.position);
  }

  async getSubtree(rootId: string): Promise<Task[]> {
    const root = await this.getTask(rootId);
    if (!root) return [];
    const out: Task[] = [root];
    const queue = [rootId];
    while (queue.length) {
      const kids = await this.getChildren(queue.shift()!);
      out.push(...kids);
      queue.push(...kids.map((k) => k.id));
    }
    return out;
  }

  async commit(batch: CommitBatch): Promise<void> {
    const tx = this.db.transaction(['tasks', 'history', 'snapshots'], 'readwrite');
    const ops: Promise<unknown>[] = [tx.done];
    try {
      // Building requests can throw synchronously (e.g. DataCloneError); that must abort the whole transaction.
      for (const t of batch.putTasks ?? []) ops.push(tx.objectStore('tasks').put(toRow(t)));
      for (const id of batch.deleteTaskIds ?? []) ops.push(tx.objectStore('tasks').delete(id));
      for (const h of batch.history ?? []) ops.push(tx.objectStore('history').put(h));
      for (const s of batch.snapshots ?? []) ops.push(tx.objectStore('snapshots').put(s));
      await Promise.all(ops);
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* already finished */
      }
      await Promise.allSettled(ops);
      throw e;
    }
  }

  async getHistory(taskId?: string): Promise<HistoryEvent[]> {
    const rows = taskId ? await this.db.getAllFromIndex('history', 'task_id', taskId) : await this.db.getAll('history');
    return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async getSnapshots(taskId: string): Promise<ProgressSnapshot[]> {
    const rows = await this.db.getAllFromIndex('snapshots', 'task_id', taskId);
    return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async getSetting(key: string): Promise<string | null> {
    return (await this.db.get('settings', key))?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.db.put('settings', { key, value });
  }
}
