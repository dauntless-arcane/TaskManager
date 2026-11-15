import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createProgressCalculator } from '../domain/progress/engine';
import { findIntegrityErrors } from '../domain/tasks/tree';
import { IdbRepository } from '../storage/indexeddb/idbRepository';
import type { Repository } from '../storage/interfaces/repository';
import { createNodeExecutor } from '../storage/sqlite/nodeExecutor';
import { SqliteRepository } from '../storage/sqlite/sqliteRepository';
import { ConfirmationRequiredError, createTaskService, TaskServiceError, type TaskService } from './taskService';

let repo: Repository;
let svc: TaskService;
let clock = Date.parse('2026-01-01T00:00:00Z');
let dbN = 0;

const backends: [string, () => Promise<Repository>][] = [
  ['indexeddb', () => IdbRepository.open(`test-${dbN++}`)],
  ['sqlite', async () => new SqliteRepository(createNodeExecutor())],
];

const progressOf = async (id: string) => createProgressCalculator(await repo.getAllTasks()).calculate(id);

describe.each(backends)('task service [%s]', (_name, makeRepo) => {
  beforeEach(async () => {
    repo = await makeRepo();
    svc = createTaskService(repo, () => new Date((clock += 1000)));
  });

  it('creates roots, children and 200-deep descendants; persists across reopen', async () => {
    const root = await svc.create({ title: 'Root' });
    expect(root.task_type).toBe('project');
    let parent = root;
    for (let i = 0; i < 200; i++) parent = await svc.create({ title: `n${i}`, parent_id: parent.id });
    expect((await repo.getSubtree(root.id)).length).toBe(201);
    expect(findIntegrityErrors(await repo.getAllTasks())).toEqual([]);
    expect((await repo.getTask(parent.id))?.parent_id).not.toBeNull();
  });

  it('rejects empty titles and unknown parents', async () => {
    await expect(svc.create({ title: '  ' })).rejects.toThrow(TaskServiceError);
    await expect(svc.create({ title: 'x', parent_id: 'nope' })).rejects.toThrow(TaskServiceError);
  });

  it('reorders siblings', async () => {
    const p = await svc.create({ title: 'p' });
    const [a, b, c] = [await svc.create({ title: 'a', parent_id: p.id }), await svc.create({ title: 'b', parent_id: p.id }), await svc.create({ title: 'c', parent_id: p.id })];
    await svc.reorder(p.id, [c.id, a.id, b.id]);
    expect((await repo.getChildren(p.id)).map((t) => t.title)).toEqual(['c', 'a', 'b']);
    await expect(svc.reorder(p.id, [a.id])).rejects.toThrow(TaskServiceError);
  });

  it('moves a subtree intact and blocks cycles', async () => {
    const a = await svc.create({ title: 'a' });
    const b = await svc.create({ title: 'b', parent_id: a.id });
    const c = await svc.create({ title: 'c', parent_id: b.id });
    const d = await svc.create({ title: 'd' });
    await svc.move(b.id, d.id);
    expect((await repo.getSubtree(d.id)).map((t) => t.title).sort()).toEqual(['b', 'c', 'd']);
    expect((await repo.getTask(c.id))?.parent_id).toBe(b.id);
    await expect(svc.move(d.id, c.id)).rejects.toThrow(/descendant/);
    await expect(svc.move(d.id, d.id)).rejects.toThrow(TaskServiceError);
  });

  it('move to index renumbers siblings in both parents', async () => {
    const p = await svc.create({ title: 'p' });
    const q = await svc.create({ title: 'q' });
    const a = await svc.create({ title: 'a', parent_id: p.id });
    const b = await svc.create({ title: 'b', parent_id: p.id });
    const x = await svc.create({ title: 'x', parent_id: q.id });
    await svc.move(a.id, q.id, 0);
    expect((await repo.getChildren(q.id)).map((t) => t.title)).toEqual(['a', 'x']);
    expect((await repo.getChildren(p.id)).map((t) => [t.title, t.position])).toEqual([['b', 0]]);
    expect(x.id).toBeDefined();
    expect(b.id).toBeDefined();
  });

  it('deleting a parent deletes descendants and updates ancestors', async () => {
    const p = await svc.create({ title: 'p' });
    const a = await svc.create({ title: 'a', parent_id: p.id });
    await svc.create({ title: 'a1', parent_id: a.id });
    const b = await svc.create({ title: 'b', parent_id: p.id });
    await svc.setStatus(b.id, 'completed');
    expect(await progressOf(p.id)).toBe(50);
    expect(await svc.remove(a.id)).toEqual({ deleted: 2 });
    expect((await repo.getAllTasks()).length).toBe(2);
    expect(await progressOf(p.id)).toBe(100);
    expect((await repo.getHistory(a.id)).some((h) => h.event_type === 'deleted')).toBe(true);
  });

  it('parent completion is manual, needs confirmation, and never cascades', async () => {
    const p = await svc.create({ title: 'p' });
    const a = await svc.create({ title: 'a', parent_id: p.id });
    await svc.setStatus(a.id, 'completed');
    expect((await repo.getTask(p.id))?.status).toBe('todo'); // not auto-completed
    const b = await svc.create({ title: 'b', parent_id: p.id });
    await expect(svc.setStatus(p.id, 'completed')).rejects.toBeInstanceOf(ConfirmationRequiredError);
    await svc.setStatus(p.id, 'completed', { confirmIncomplete: true });
    expect((await repo.getTask(b.id))?.status).toBe('todo'); // no cascade down
    await svc.setStatus(p.id, 'todo');
    expect((await repo.getTask(a.id))?.status).toBe('completed'); // reopen does not cascade
    expect((await repo.getTask(p.id))?.completed_at).toBeNull();
    const types = (await repo.getHistory(p.id)).map((h) => h.event_type);
    expect(types).toContain('completed');
    expect(types).toContain('reopened');
  });

  it('forbids manual progress on parents; allows on leaves', async () => {
    const p = await svc.create({ title: 'p' });
    const a = await svc.create({ title: 'a', parent_id: p.id });
    await expect(svc.update(p.id, { progress_percent: 50 })).rejects.toThrow(/derived/);
    await svc.update(a.id, { progress_percent: 40 });
    expect(await progressOf(p.id)).toBe(40);
  });

  it('adding a child to a weighted parent does not alter existing weights', async () => {
    const p = await svc.create({ title: 'p', progress_method: 'weighted' });
    const a = await svc.create({ title: 'a', parent_id: p.id, weight: 50 });
    const b = await svc.create({ title: 'b', parent_id: p.id, weight: 30 });
    const c = await svc.create({ title: 'c', parent_id: p.id });
    expect(c.weight).toBe(40);
    expect((await repo.getTask(a.id))?.weight).toBe(50);
    expect((await repo.getTask(b.id))?.weight).toBe(30);
    await svc.normalizeChildWeights(p.id);
    const sum = (await repo.getChildren(p.id)).reduce((s, t) => s + t.weight, 0);
    expect(sum).toBeCloseTo(100);
  });

  it('records snapshots only when progress changes (dedup)', async () => {
    const p = await svc.create({ title: 'p' });
    const a = await svc.create({ title: 'a', parent_id: p.id });
    await svc.create({ title: 'b', parent_id: p.id });
    const before = (await repo.getSnapshots(p.id)).length;
    await svc.update(p.id, { description: 'no progress change' });
    expect((await repo.getSnapshots(p.id)).length).toBe(before);
    await svc.setStatus(a.id, 'completed');
    const snaps = await repo.getSnapshots(p.id);
    expect(snaps.length).toBe(before + 1);
    expect(snaps.at(-1)?.progress).toBe(50);
  });

  it('duplicates a subtree with fresh ids', async () => {
    const p = await svc.create({ title: 'p' });
    const a = await svc.create({ title: 'a', parent_id: p.id });
    await svc.create({ title: 'a1', parent_id: a.id });
    const copy = await svc.duplicate(p.id);
    expect(copy.id).not.toBe(p.id);
    expect((await repo.getSubtree(copy.id)).length).toBe(3);
    expect((await repo.getAllTasks()).length).toBe(6);
    expect(findIntegrityErrors(await repo.getAllTasks())).toEqual([]);
  });

  it('commit is atomic: a failing batch writes nothing', async () => {
    const t = await svc.create({ title: 't' });
    const bad = { ...t, id: 'bad', title: undefined } as never;
    const before = (await repo.getAllTasks()).length;
    // A non-cloneable value forces the transaction to fail partway through.
    await expect(repo.commit({ putTasks: [bad, { ...t, id: 'fn', title: (() => 1) as never }] })).rejects.toThrow();
    expect((await repo.getAllTasks()).length).toBe(before);
  });
});
