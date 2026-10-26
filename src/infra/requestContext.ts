import { AsyncLocalStorage } from 'node:async_hooks';

/** Request attribution only; authorization remains in the shared access policy. */
export const requestContext = new AsyncLocalStorage<{ principalId: string }>();
export function attributedMetadata(metadata?: Record<string, unknown> | null) {
  const principalId = requestContext.getStore()?.principalId;
  return principalId ? { ...metadata, principalId } : metadata;
}
