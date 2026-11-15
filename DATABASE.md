# Database

One logical schema, two implementations.

| Entity | SQLite (`src-tauri/migrations`) | IndexedDB (`idbRepository.ts`) |
| --- | --- | --- |
| tasks | `tasks`, FK `parent_id` with `ON DELETE CASCADE`, CHECK constraints | store `tasks` (key `id`) |
| history | `history` | store `history` |
| snapshots | `snapshots` | store `snapshots` |
| settings | `settings(key, value)` | store `settings` (key `key`) |

Indexes (both): parent (SQLite: `parent_id, position`), status, priority, due_date, title. History and snapshots are indexed by `task_id`.

## Versioning

- SQLite: files `migrations/NNN_*.sql`, applied in order and tracked by `PRAGMA user_version`. Each migration runs in its own transaction.
- IndexedDB: `DB_VERSION` with `upgrade(db, oldVersion)` blocks, one `if (oldVersion < N)` per version.

## Integrity

- Duplicate IDs, dangling parents and cycles are detected by `findIntegrityErrors` (used to validate imports before committing).
- SQLite additionally enforces foreign keys and CHECK constraints (valid status, priority, method; non-negative weight; progress 0-100).
- A failed `commit` leaves no partial writes on either backend (tested).

## Known difference

SQLite enforces CHECK constraints; IndexedDB relies on service-level validation. Keep new rules in the service so both behave the same.
