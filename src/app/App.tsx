import { Moon, Sun } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { TaskExplorer } from '../pages/TaskExplorer/TaskExplorer';
import { useApp } from '../stores/appStore';

export function App() {
  const { ready, error, theme, init, setTheme } = useApp();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const onError = useCallback((m: string) => setToast(m), []);

  if (error) {
    return (
      <div className="grid h-screen place-items-center p-6 text-center">
        <div>
          <p className="font-semibold">Storage could not be opened</p>
          <p className="mt-1 text-sm text-[var(--text-dim)]">{error}</p>
        </div>
      </div>
    );
  }
  if (!ready) return <div className="grid h-screen place-items-center text-sm text-[var(--text-dim)]">Loading…</div>;

  return (
    <div className="flex h-screen flex-col">
      <nav className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2">
        <span className="font-semibold tracking-tight">TaskFlow</span>
        <button
          aria-label="Toggle theme"
          title="Toggle theme"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="rounded p-1.5 hover:bg-[var(--muted)]"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </nav>
      <main className="min-h-0 flex-1">
        <TaskExplorer onError={onError} />
      </main>
      {toast && (
        <div role="alert" className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-[var(--danger)] px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
