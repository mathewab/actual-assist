import { describe, it, expect } from 'vitest';

describe('Vitest configuration', () => {
  it('should run basic assertions', () => {
    expect(1 + 1).toBe(2);
  });

  it('should support async tests', async () => {
    const promise = Promise.resolve(42);
    await expect(promise).resolves.toBe(42);
  });
});
