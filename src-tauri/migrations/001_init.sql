CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL,
  parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN ('project','task')),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('todo','in_progress','blocked','completed')),
  priority TEXT NOT NULL CHECK (priority IN ('low','medium','high','critical')),
  progress_percent REAL NOT NULL CHECK (progress_percent BETWEEN 0 AND 100),
  weight REAL NOT NULL CHECK (weight >= 0),
  position INTEGER NOT NULL,
  progress_method TEXT NOT NULL CHECK (progress_method IN ('leaf','equal','weighted')),
  due_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX idx_tasks_parent ON tasks(parent_id, position);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_due ON tasks(due_date);
CREATE INDEX idx_tasks_title ON tasks(title);

CREATE TABLE history (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  task_title TEXT NOT NULL,
  event_type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_history_task ON history(task_id, created_at);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  progress REAL NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_snapshots_task ON snapshots(task_id, created_at);

CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
