import { create } from 'zustand';
import { createProgressCalculator } from '../domain/progress/engine';
import { childrenMap } from '../domain/tasks/tree';
import type { HistoryEvent } from '../domain/history/types';
import { NO_FILTERS, type TaskFilters } from '../domain/tasks/filter';
import type { Task } from '../domain/tasks/types';
import { createTaskService, type TaskService } from '../services/taskService';
import { createRepository } from '../storage/createRepository';
import type { Repository } from '../storage/interfaces/repository';

export type Theme = 'light' | 'dark';

interface AppState {
  ready: boolean;
  error: string | null;
  tasks: Task[];
  selectedId: string | null;
  expanded: ReadonlySet<string>;
  theme: Theme;
  filters: TaskFilters;
  /** Derived, recomputed once per task change so components never recalculate. */
  progress: ReadonlyMap<string, number>;
  children: ReadonlyMap<string | null, Task[]>;

  init(): Promise<void>;
  reload(): Promise<void>;
  setFilters(filters: Partial<TaskFilters>): void;
  select(id: string | null): void;
  toggle(id: string): void;
  expand(id: string): void;
  setTheme(theme: Theme): Promise<void>;
  /** Runs a service operation, then refreshes. Errors are surfaced, never swallowed. */
  loadHistory(taskId: string): Promise<HistoryEvent[]>;
  run<T>(op: (svc: TaskService) => Promise<T>): Promise<T>;
}

let repo: Repository;
let svc: TaskService;

function derive(tasks: Task[]) {
  const calc = createProgressCalculator(tasks);
  return {
    progress: new Map(tasks.map((t) => [t.id, calc.calculate(t.id)])),
    children: childrenMap(tasks),
  };
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  error: null,
  tasks: [],
  selectedId: null,
  expanded: new Set(),
  theme: 'light',
  filters: NO_FILTERS,
  progress: new Map(),
  children: new Map(),

  async init() {
    try {
      repo = await createRepository();
      svc = createTaskService(repo);
      const stored = await repo.getSetting('theme');
      const theme: Theme = stored === 'dark' || stored === 'light' ? stored : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      const tasks = await repo.getAllTasks();
      set({ ready: true, theme, tasks, ...derive(tasks) });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  async reload() {
    const tasks = await repo.getAllTasks();
    const { selectedId } = get();
    set({ tasks, ...derive(tasks), selectedId: selectedId && tasks.some((t) => t.id === selectedId) ? selectedId : null });
  },

  setFilters: (f) => set({ filters: { ...get().filters, ...f } }),

  select: (id) => set({ selectedId: id }),

  toggle(id) {
    const next = new Set(get().expanded);
    if (!next.delete(id)) next.add(id);
    set({ expanded: next });
  },

  expand(id) {
    if (!get().expanded.has(id)) set({ expanded: new Set(get().expanded).add(id) });
  },

  async setTheme(theme) {
    set({ theme });
    await repo.setSetting('theme', theme);
  },

  loadHistory: (taskId) => repo.getHistory(taskId),

  async run(op) {
    const result = await op(svc);
    await get().reload();
    return result;
  },
}));
