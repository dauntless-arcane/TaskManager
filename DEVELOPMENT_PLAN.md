# Development plan

## Done

- Domain: task model, tree rules, progress engine (3 methods), filters.
- Storage: `Repository` interface, IndexedDB and SQLite repositories, migrations, atomic commits.
- Services: create, update, status, move, reorder, delete, duplicate, normalise weights, history, snapshot deduplication.
- Task Explorer: tree, inline edit, context menu, drag-and-drop (before, inside, after), move dialog, search and filters, detail panel (Details, Progress, Activity), confirmations, light/dark theme.
- Desktop: Tauri 2 shell with SQLite; verified that the app starts and creates the database.

## Not done

**Phase 1 gaps:** Subtasks tab in the detail panel; toasts for success states; shadcn/ui; tree virtualisation for very large trees; per-row loading and error states.

**Phase 2:** Progress Dashboard (scope selector, breadcrumbs, history chart from snapshots, deadline performance), weight editing UI for all siblings, "normalise" button in the UI.

**Phase 3:** Overview page, Calendar, Archive, Goals, Projects pages.

**Phase 4:** JSON export/import with preview and validation, automatic backups and restore (desktop folder, web storage), PWA manifest and service worker, Windows installer, responsive detail panel (currently hidden below 768px), accessibility audit.

**Phase 5:** Large-tree performance tests, import/backup tests, Settings page, remaining documentation.

## Risks

- Project lives inside OneDrive; `node_modules` and `src-tauri/target` sync slowly. Consider moving it.
- Desktop and browser data are separate; sync is out of scope but the `Repository` boundary allows it later.
- Progress is recomputed for all tasks on every change (O(n)). Fine for thousands of tasks; revisit if trees reach tens of thousands.
