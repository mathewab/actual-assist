import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('production Node runtime compatibility', () => {
  it('builds native modules with the same Node major used at runtime and in development', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    const developmentMajor = readFileSync('.nvmrc', 'utf8').trim().split('.')[0];
    const builderMajor = dockerfile.match(/FROM node:(\d+)/)?.[1];
    const runtimeMajor = dockerfile.match(/FROM gcr\.io\/distroless\/nodejs(\d+)/)?.[1];
    expect(builderMajor).toBeDefined();
    expect(runtimeMajor).toBeDefined();
    expect(builderMajor).toBe(runtimeMajor);
    expect(developmentMajor).toBe(runtimeMajor);
  });
});
