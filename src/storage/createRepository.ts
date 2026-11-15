import { IdbRepository } from './indexeddb/idbRepository';
import type { Repository } from './interfaces/repository';

export const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** The single place that picks a platform adapter. Everything above this sees only `Repository`. */
export async function createRepository(): Promise<Repository> {
  if (isTauri()) {
    const [{ SqliteRepository }, { tauriExecutor }] = await Promise.all([
      import('./sqlite/sqliteRepository'),
      import('./sqlite/tauriExecutor'),
    ]);
    return new SqliteRepository(tauriExecutor);
  }
  return IdbRepository.open();
}
