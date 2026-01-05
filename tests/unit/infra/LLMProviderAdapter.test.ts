import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LLMProviderAdapter } from '../../../src/infra/llm/LLMProviderAdapter.js';
import { LLMError } from '../../../src/domain/errors.js';

const loggerMock = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../src/infra/logger.js', () => loggerMock);

const aiMocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  jsonSchema: vi.fn((schema) => schema),
  Output: {
    object: vi.fn((options) => options),
  },
}));

vi.mock('ai', () => aiMocks);

describe('LLMProviderAdapter', () => {
  beforeEach(() => {
    aiMocks.generateText.mockReset();
    aiMocks.jsonSchema.mockClear();
  });

  it('throws when provider is not configured', async () => {
    const adapter = new LLMProviderAdapter({
      providerId: 'test',
      defaultModel: 'model',
      modelFactory: () => ({}),
      isConfigured: () => false,
    });

    await expect(adapter.generateText({ input: 'hi' })).rejects.toBeInstanceOf(LLMError);
  });

  it('generates text via Vercel AI SDK', async () => {
    aiMocks.generateText.mockResolvedValue({ text: 'ok' });
    const modelFactory = vi.fn((modelId: string) => ({ modelId }));

    const adapter = new LLMProviderAdapter({
      providerId: 'test',
      defaultModel: 'model',
      modelFactory,
      isConfigured: () => true,
    });

    const result = await adapter.generateText({ input: 'hello', system: 'system' });

    expect(result).toBe('ok');
    expect(modelFactory).toHaveBeenCalledWith('model');
    expect(aiMocks.generateText).toHaveBeenCalledOnce();
  });

  it('generates objects via Vercel AI SDK', async () => {
    aiMocks.generateText.mockResolvedValue({ output: { status: 'ok' } });
    const modelFactory = vi.fn((modelId: string) => ({ modelId }));

    const adapter = new LLMProviderAdapter({
      providerId: 'test',
      defaultModel: 'model',
      modelFactory,
      isConfigured: () => true,
    });

    const result = await adapter.generateObject<{ status: string }>({
      input: 'hello',
      system: 'system',
      schema: {
        name: 'status',
        schema: {
          type: 'object',
          properties: { status: { type: ['string', 'null'] } },
        },
      },
    });

    expect(result).toEqual({ status: 'ok' });
    expect(aiMocks.jsonSchema).toHaveBeenCalledOnce();
    expect(aiMocks.Output.object).toHaveBeenCalledOnce();
    const schemaArg = aiMocks.jsonSchema.mock.calls[0][0] as {
      properties: { status: { type: string; nullable?: boolean } };
    };
    expect(schemaArg.properties.status.type).toBe('string');
    expect(schemaArg.properties.status.nullable).toBe(true);
  });
});
