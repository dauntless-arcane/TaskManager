# Architecture

```
React UI → Zustand store → services (taskService) → Repository interface → IdbRepository   (web)
                                                                          → SqliteRepository → Tauri IPC → Rust/rusqlite (desktop)
```

- `src/domain` — pure logic, no I/O: task types, tree rules (iterative, so depth is unbounded), progress engine, filters.
- `src/services` — domain operations (`taskService`). Every operation is one atomic `Repository.commit()`.
- `src/storage` — `Repository` interface; the only platform split is `createRepository.ts`.
- `src/stores` — Zustand store. Derived data (progress map, children map) is computed once per change.
- `src-tauri` — Rust. It exposes two generic commands (`db_select`, `db_commit`) and owns the connection and transactions. SQL text lives in TypeScript so both platforms share one logical schema.

## Decisions

- **Own Rust SQLite layer instead of `tauri-plugin-sql`.** The plugin uses a connection pool and cannot run a multi-statement transaction on one connection. `commit` must be atomic.
- **Adjacency list.** `parent_id` only. Moves change one row, so subtrees are preserved. Cycles are rejected in the service (`wouldCreateCycle`) and checked in `findIntegrityErrors` for imports.
- **IndexedDB roots use `parent_id = ''`** because null keys cannot be indexed. Conversion happens inside `IdbRepository`; the domain always sees `null`.
- **SQLite writes use UPSERT**, never `INSERT OR REPLACE` (REPLACE deletes the row first and would cascade-delete its children). Commits start with `PRAGMA defer_foreign_keys = ON`.
- **Parent completion is manual** and never cascades up or down. Completing a parent with unfinished descendants raises `ConfirmationRequiredError`; the UI asks first.
- **Unplanned dependency changes:** `idb` for IndexedDB; plain Tailwind instead of shadcn/ui so far.

## Progress rules

- Leaf: completed = 100, else manual `progress_percent`. An empty parent counts as a leaf (0% unless completed).
- Parents are derived; their own `progress_percent` and status are ignored. Manual progress on a parent is rejected.
- `equal`: mean of immediate children. `weighted`: Σ(w·p)/Σw; all-zero weights fall back to equal. `leaf`: mean of every leaf descendant.
- Each parent has its own `progress_method`; the dashboard can override it for a whole scope.
- **Weights are relative.** A new child gets the mean of its siblings' weights, so existing weights are never changed. Deleting a child needs no redistribution; "normalise to 100" is an explicit action.

## History and snapshots

Events are written in the same transaction as the change. A snapshot is written for the changed task and each ancestor only when its derived progress differs from its last snapshot.
