import { API_BASE, sessionFetch } from './session';
export async function reportRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await sessionFetch(
    `${API_BASE}/v1/reports${path}`,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}
  );
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error ?? 'Report request failed');
  }
  return response.json() as Promise<T>;
}
