import { invoke } from '@tauri-apps/api/core';
import type { Row, SqlExecutor, SqlParam, SqlStatement } from './sqliteRepository';

/** Desktop executor: SQL runs in the Rust process, which owns the connection and transactions. */
export const tauriExecutor: SqlExecutor = {
  select: (sql: string, params: SqlParam[] = []) => invoke<Row[]>('db_select', { sql, params }),
  commit: (statements: SqlStatement[]) => invoke<void>('db_commit', { statements }),
};
