# Testing

| Layer | Tool | What it covers |
| --- | --- | --- |
| Domain | Vitest | Progress engine (3 methods, empty parent, weights, 5000-deep chain, recalculation after add/delete/move), tree rules and cycles, filters |
| Services | Vitest | Same suite runs against **IndexedDB** (`fake-indexeddb`) and **SQLite** (`node:sqlite` with the real migration file): deep nesting, reorder, move subtree, cycle blocking, delete, manual completion and reopen, weights, snapshot dedup, duplicate, atomic commit |
| Rust | `cargo test` | Migration idempotence, rollback on failure, foreign keys and cascade delete |
| End to end | Playwright (Chromium) | Create nested tasks, complete, reload persistence, delete warning, context menu, search and filters, move dialog, drag-and-drop |

Run: `npm test`, `npm run e2e`, `cd src-tauri && cargo test`.

## Not yet tested

Export/import, backup restore, desktop UI automation (the desktop app was only smoke-checked by starting it), large-tree performance, accessibility audit.

## Notes

`node:sqlite` is experimental in Node 22 and prints a warning; it stands in for the Rust layer so both backends share one test suite.
