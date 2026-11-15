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

export interface TaskList {
  id: string;
  name: string;
}

/** Lists group root-level tasks (e.g. Office, Weekend). Stored as one settings entry, so no schema change. */
interface ListsData {
  lists: TaskList[];
  /** root task id -> list id. Roots without an entry are "unsorted" and only appear under All. */
  membership: Record<string, string>;
}
const LISTS_KEY = 'lists';

interface AppState {
  ready: boolean;
  error: string | null;
  tasks: Task[];
  selectedId: string | null;
  expanded: ReadonlySet<string>;
  theme: Theme;
  filters: TaskFilters;
  lists: TaskList[];
  membership: Readonly<Record<string, string>>;
  /** null = All Tasks. */
  activeListId: string | null;
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
  setActiveList(id: string | null): void;
  createList(name: string): Promise<TaskList>;
  renameList(id: string, name: string): Promise<void>;
  /** Tasks in the list are kept and become unsorted. */
  deleteList(id: string): Promise<void>;
  /** listId null makes the root unsorted. */
  assignToList(rootId: string, listId: string | null): Promise<void>;
  /** Runs a service operation, then refreshes. Errors are surfaced, never swallowed. */
  loadHistory(taskId: string): Promise<HistoryEvent[]>;
  run<T>(op: (svc: TaskService) => Promise<T>): Promise<T>;
}

let repo: Repository;
let svc: TaskService;

async function saveLists(lists: TaskList[], membership: Record<string, string>) {
  await repo.setSetting(LISTS_KEY, JSON.stringify({ lists, membership } satisfies ListsData));
}

function parseLists(raw: string | null): ListsData {
  try {
    const d = raw ? (JSON.parse(raw) as Partial<ListsData>) : {};
    return { lists: Array.isArray(d.lists) ? d.lists : [], membership: d.membership && typeof d.membership === 'object' ? d.membership : {} };
  } catch {
    return { lists: [], membership: {} };
  }
}

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
  lists: [],
  membership: {},
  activeListId: null,
  progress: new Map(),
  children: new Map(),

  async init() {
    try {
      repo = await createRepository();
      svc = createTaskService(repo);
      const stored = await repo.getSetting('theme');
      const theme: Theme = stored === 'dark' || stored === 'light' ? stored : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      const tasks = await repo.getAllTasks();
      const { lists, membership } = parseLists(await repo.getSetting(LISTS_KEY));
      set({ ready: true, theme, tasks, lists, membership, ...derive(tasks) });
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

  setActiveList: (id) => set({ activeListId: id, selectedId: null }),

  async createList(name) {
    const list = { id: crypto.randomUUID(), name: name.trim() };
    const lists = [...get().lists, list];
    await saveLists(lists, { ...get().membership });
    set({ lists, activeListId: list.id, selectedId: null });
    return list;
  },

  async renameList(id, name) {
    const lists = get().lists.map((l) => (l.id === id ? { ...l, name: name.trim() } : l));
    await saveLists(lists, { ...get().membership });
    set({ lists });
  },

  async deleteList(id) {
    const lists = get().lists.filter((l) => l.id !== id);
    const membership = Object.fromEntries(Object.entries(get().membership).filter(([, l]) => l !== id));
    await saveLists(lists, membership);
    set({ lists, membership, activeListId: get().activeListId === id ? null : get().activeListId });
  },

  async assignToList(rootId, listId) {
    const membership = { ...get().membership };
    if (listId) membership[rootId] = listId;
    else delete membership[rootId];
    await saveLists(get().lists, membership);
    set({ membership });
  },

  loadHistory: (taskId) => repo.getHistory(taskId),

  async run(op) {
    const result = await op(svc);
    await get().reload();
    return result;
  },
}));
