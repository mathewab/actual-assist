import { useCallback, useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  API_BASE,
  readSession,
  sessionFetch,
  setSession,
  type SessionState,
} from '../services/session';

export function SessionGate({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [state, setState] = useState<SessionState | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = useCallback(
    (next: SessionState) => {
      setSession(next);
      setState(next);
      if (next.mode === 'enforced' && !next.authenticated) client.clear();
    },
    [client]
  );
  const check = useCallback(async () => {
    try {
      update(await readSession());
      setError('');
    } catch (e) {
      setSession(null);
      setState(null);
      client.clear();
      setError((e as Error).message);
    }
  }, [update, client]);
  useEffect(() => {
    void readSession()
      .then(update)
      .catch((e: Error) => setError(e.message));
    const expire = () => update({ mode: 'enforced', authenticated: false });
    const pageShow = () => {
      setState(null);
      setSession(null);
      client.clear();
      void check();
    };
    window.addEventListener('session-expired', expire);
    window.addEventListener('pageshow', pageShow);
    return () => {
      window.removeEventListener('session-expired', expire);
      window.removeEventListener('pageshow', pageShow);
    };
  }, [check, update, client]);
  useEffect(() => {
    if (!state?.expiresAt) return;
    const timer = setTimeout(
      () => update({ mode: 'enforced', authenticated: false }),
      Math.max(0, state.expiresAt - Date.now())
    );
    return () => clearTimeout(timer);
  }, [state, update]);
  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? 'Too many attempts. Try again shortly.'
            : 'Sign-in failed. Check your operator credential.'
        );
      update(await response.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setToken('');
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError('');
    try {
      const response = await sessionFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
      if (!response.ok) throw new Error('Sign-out failed. Please retry.');
      update({ mode: 'enforced', authenticated: false });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!state)
    return (
      <main className="p-6">
        <p>{error || 'Checking session…'}</p>
        {error && <button onClick={() => void check()}>Retry</button>}
      </main>
    );
  if (state.mode === 'legacy') return children;
  if (!state.authenticated)
    return (
      <main className="mx-auto max-w-md p-6">
        <h1>Sign in to Actual Assist</h1>
        <form onSubmit={login}>
          <label htmlFor="operator-token">Operator credential</label>
          <input
            id="operator-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            className="block w-full border p-2"
          />
          <button disabled={busy} type="submit">
            Sign in
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  return (
    <>
      <div className="flex justify-end gap-3 p-2">
        <span>Signed in as {state.principal?.id}</span>
        <button disabled={busy} onClick={() => void logout()}>
          Sign out
        </button>
        {error && <span role="alert">{error}</span>}
      </div>
      {children}
    </>
  );
}
