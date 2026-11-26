import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleAIAdapter } from '../../../../src/infra/ai/GoogleAIAdapter.js';
import type { Env } from '../../../../src/infra/env.js';

vi.mock('../../../../src/infra/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('Google SDK compatibility', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('preserves the beta endpoint and structured-output request with SDK 3', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"category":"Food"}' }] } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new GoogleAIAdapter({
      GOOGLE_AI_API_KEY: 'synthetic-test-key',
      GOOGLE_AI_MODEL: 'gemini-2.0-flash',
    } as Env);
    const result = await adapter.completion({
      input: 'Synthetic example',
      jsonSchema: {
        name: 'category',
        schema: { type: 'object', properties: { category: { type: 'string' } } },
      },
    });
    expect(result).toBe('{"category":"Food"}');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/v1beta/models/gemini-2.0-flash:generateContent');
    const payload = JSON.parse(init.body);
    expect(payload.generationConfig.responseMimeType).toBe('application/json');
    expect(payload.generationConfig.responseJsonSchema.properties.category.type).toBe('string');
  });
});
