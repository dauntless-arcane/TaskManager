import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { HistoryEvent } from '../../domain/history/types';
import { createProgressCalculator } from '../../domain/progress/engine';
import { PRIORITIES, PROGRESS_METHODS, STATUSES, type Priority, type ProgressMethod, type Status, type Task } from '../../domain/tasks/types';
import type { UpdateTaskInput } from '../../services/taskService';
import { useApp } from '../../stores/appStore';

interface Props {
  task: Task;
  onClose(): void;
  onStatus(task: Task, status: Status): void;
  onError(message: string): void;
}

type Tab = 'details' | 'progress' | 'activity';
const LABEL: Record<string, string> = {
  todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', completed: 'Completed',
  leaf: 'Leaf-weighted', equal: 'Equal-child', weighted: 'Custom-weighted',
};
const NO_TASKS: Task[] = [];
const field = 'w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm';

export function DetailPanel({ task, onClose, onStatus, onError }: Props) {
  const [tab, setTab] = useState<Tab>('details');
  const run = useApp((s) => s.run);
  const tasks = useApp((s) => s.tasks);
  const progress = useApp((s) => s.progress.get(task.id) ?? 0);
  const kids = useApp((s) => s.children.get(task.id) ?? NO_TASKS);
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description);

  useEffect(() => {
    setTitle(task.title);
    setDesc(task.description);
  }, [task.id, task.title, task.description]);

  const save = (patch: UpdateTaskInput) =>
    run((s) => s.update(task.id, patch)).catch((e: Error) => onError(e.message));

  return (
    <aside className="flex h-full w-full flex-col border-l border-[var(--border)] bg-[var(--surface)] md:w-96">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="truncate font-semibold">{task.title}</h2>
        <button aria-label="Close panel" onClick={onClose} className="rounded p-1 hover:bg-[var(--muted)]">
          <X size={16} />
        </button>
      </header>
      <div role="tablist" className="flex gap-1 border-b border-[var(--border)] px-3">
        {(['details', 'progress', 'activity'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm capitalize ${tab === t ? 'border-b-2 border-[var(--accent)] font-medium' : 'text-[var(--text-dim)]'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {tab === 'details' && (
          <>
            <label className="block text-xs text-[var(--text-dim)]">Title
              <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== task.title && save({ title })} />
            </label>
            <label className="block text-xs text-[var(--text-dim)]">Notes
              <textarea rows={5} className={field} value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== task.description && save({ description: desc })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-[var(--text-dim)]">Status
                <select className={field} value={task.status} onChange={(e) => onStatus(task, e.target.value as Status)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                </select>
              </label>
              <label className="block text-xs text-[var(--text-dim)]">Priority
                <select className={field} value={task.priority} onChange={(e) => save({ priority: e.target.value as Priority })}>
                  {PRIORITIES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
                </select>
              </label>
              <label className="block text-xs text-[var(--text-dim)]">Due date
                <input type="date" className={field} value={task.due_date ?? ''} onChange={(e) => save({ due_date: e.target.value || null })} />
              </label>
              <label className="block text-xs text-[var(--text-dim)]">Weight (among siblings)
                <input type="number" min={0} className={field} defaultValue={task.weight} key={task.weight} onBlur={(e) => Number(e.target.value) !== task.weight && save({ weight: Number(e.target.value) })} />
              </label>
            </div>
            {kids.length === 0 && (
              <label className="block text-xs text-[var(--text-dim)]">Manual progress: {task.status === 'completed' ? 100 : task.progress_percent}%
                <input type="range" min={0} max={100} className="w-full" disabled={task.status === 'completed'} value={task.progress_percent} onChange={(e) => save({ progress_percent: Number(e.target.value) })} />
              </label>
            )}
          </>
        )}

        {tab === 'progress' && <ProgressTab task={task} progress={progress} tasks={tasks} onMethod={(m) => save({ progress_method: m })} />}
        {tab === 'activity' && <ActivityTab taskId={task.id} version={tasks} />}
      </div>
    </aside>
  );
}

function ProgressTab({ task, progress, tasks, onMethod }: { task: Task; progress: number; tasks: Task[]; onMethod(m: ProgressMethod): void }) {
  const items = createProgressCalculator(tasks).breakdown(task.id);
  return (
    <>
      <div>
        <div className="text-3xl font-semibold tabular-nums">{progress.toFixed(1)}%</div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--muted)]">
          <div className="h-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--text-dim)]">No subtasks. Progress comes from this task's own status and manual progress.</p>
      ) : (
        <>
          <label className="block text-xs text-[var(--text-dim)]">Calculation method
            <select className={field} value={task.progress_method} onChange={(e) => onMethod(e.target.value as ProgressMethod)}>
              {PROGRESS_METHODS.map((m) => <option key={m} value={m}>{LABEL[m]}</option>)}
            </select>
          </label>
          <ul className="space-y-2 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                <span className="text-xs text-[var(--text-dim)]">{task.progress_method === 'weighted' ? `w ${i.weight.toFixed(0)} · ` : ''}{(i.contribution * 100).toFixed(0)}% share</span>
                <span className="w-10 text-right tabular-nums">{i.progress.toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function ActivityTab({ taskId, version }: { taskId: string; version: unknown }) {
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const loadHistory = useApp((s) => s.loadHistory);
  useEffect(() => {
    let live = true;
    loadHistory(taskId).then((e) => live && setEvents(e));
    return () => { live = false; };
  }, [taskId, version, loadHistory]);
  if (!events) return <p className="text-sm text-[var(--text-dim)]">Loading…</p>;
  if (!events.length) return <p className="text-sm text-[var(--text-dim)]">No activity yet.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {[...events].reverse().map((e) => (
        <li key={e.id}>
          <span className="font-medium">{e.event_type.replace('_', ' ')}</span>
          {e.old_value !== null || e.new_value !== null ? <span className="text-[var(--text-dim)]"> {e.old_value ?? '—'} → {e.new_value ?? '—'}</span> : null}
          <div className="text-xs text-[var(--text-dim)]">{new Date(e.created_at).toLocaleString()}</div>
        </li>
      ))}
    </ul>
  );
}
