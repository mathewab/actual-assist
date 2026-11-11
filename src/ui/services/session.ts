export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
export interface SessionState {
  mode: 'legacy' | 'enforced';
  authenticated: boolean;
  csrf?: string;
  expiresAt?: number;
  principal?: { id: string; role: string };
}
let csrf: string | undefined;
export function setSession(state: SessionState | null) {
  csrf = state?.csrf;
}
export async function sessionFetch(
  input: string,
  init: NonNullable<Parameters<typeof fetch>[1]> = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (csrf && !['GET', 'HEAD', 'OPTIONS'].includes(init.method ?? 'GET'))
    headers.set('X-CSRF-Token', csrf);
  const response = await fetch(input, { ...init, headers, credentials: 'same-origin' });
  if (response.status === 401) window.dispatchEvent(new Event('session-expired'));
  return response;
}
export async function readSession(): Promise<SessionState> {
  const response = await fetch(`${API_BASE}/auth/session`, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Unable to check your session. Retry to continue.');
  return response.json();
}
