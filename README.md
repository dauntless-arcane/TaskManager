# TaskFlow

Local-first personal task manager with unlimited-depth task hierarchies and a derived progress engine.
Runs as a browser app (IndexedDB) and a Windows desktop app (Tauri 2 + SQLite). The two stores are
independent: **data does not sync between desktop and browser.**

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Browser dev server (http://localhost:5173) |
| `npm run tauri dev` | Desktop app (needs Rust, see below) |
| `npm test` | Vitest unit and service tests (IndexedDB and SQLite parity) |
| `npm run e2e` | Playwright browser tests |
| `npm run typecheck` | `tsc --noEmit` |
| `cd src-tauri && cargo test` | Rust SQLite layer tests |

## Requirements

Node 22+, Rust (stable, MSVC toolchain) and Visual Studio C++ build tools for the desktop build.

## Status

See [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for what is done and what is not.
Design: [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), [TESTING.md](TESTING.md).
