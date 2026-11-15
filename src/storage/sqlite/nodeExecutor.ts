import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { Row, SqlExecutor, SqlParam, SqlStatement } from './sqliteRepository';

/** Test-only executor mirroring the Rust layer (same migration file, same transaction semantics). */
export function createNodeExecutor(): SqlExecutor {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(new URL('../../../src-tauri/migrations/001_init.sql', import.meta.url), 'utf-8'));
  return {
    async select(sql: string, params: SqlParam[] = []) {
      return db.prepare(sql).all(...params) as Row[];
    },
    async commit(statements: SqlStatement[]) {
      db.exec('BEGIN');
      try {
        for (const s of statements) db.prepare(s.sql).run(...s.params);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
