import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export type Permission = 'budget:read' | 'app:operate' | 'ui:session';
export interface Principal {
  id: string;
  role: 'reader' | 'operator';
}
export function permits(principal: Principal, permission: Permission): boolean {
  return permission === 'budget:read' || principal.role === 'operator';
}

/** Authentication adapters produce principals; they do not decide route permissions. */
export interface AuthenticationProvider {
  authenticate(credential: string): Promise<Principal | null>;
}
export const credentialsSchema = z
  .array(
    z.strictObject({
      id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
      token: z.string().min(32).max(512),
      role: z.enum(['reader', 'operator']),
    })
  )
  .max(100)
  .superRefine((credentials, context) => {
    if (
      new Set(credentials.map((c) => c.id)).size !== credentials.length ||
      new Set(credentials.map((c) => c.token)).size !== credentials.length
    ) {
      context.addIssue({ code: 'custom', message: 'Credential IDs and tokens must be unique' });
    }
  });
export type Credential = z.infer<typeof credentialsSchema>[number];
export class StaticCredentialProvider implements AuthenticationProvider {
  private credentials: Array<{ principal: Principal; hash: Buffer }>;
  constructor(credentials: Credential[]) {
    this.credentials = credentials.map(({ id, role, token }) => ({
      principal: { id, role },
      hash: createHash('sha256').update(token).digest(),
    }));
  }
  async authenticate(credential: string): Promise<Principal | null> {
    const hash = createHash('sha256').update(credential).digest();
    let principal: Principal | null = null;
    for (const candidate of this.credentials) {
      if (timingSafeEqual(candidate.hash, hash)) principal = candidate.principal;
    }
    return principal;
  }
}
