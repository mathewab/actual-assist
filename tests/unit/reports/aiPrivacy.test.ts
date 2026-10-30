import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  stream: vi.fn(),
  generate: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('openai', () => ({
  default: class {
    responses = { stream: mocks.stream };
  },
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generate };
  },
}));
vi.mock('../../../src/infra/logger.js', () => ({
  logger: { info: mocks.info, error: mocks.error, debug: mocks.debug },
}));
import { OpenAIAdapter } from '../../../src/infra/OpenAIAdapter.js';
import { GoogleAIAdapter } from '../../../src/infra/ai/GoogleAIAdapter.js';
import type { Env } from '../../../src/infra/env.js';
it('does not log prompt, narrative, or provider error bodies for either provider', async () => {
  const privateText = 'SENSITIVE_SYNTHETIC_PAYEE_AND_AMOUNT';
  const env = { OPENAI_API_KEY: 'fixture', GOOGLE_AI_API_KEY: 'fixture' } as Env;
  mocks.stream.mockReturnValue({
    finalResponse: async () => ({
      output: [{ type: 'message', content: [{ type: 'output_text', text: privateText }] }],
    }),
  });
  mocks.generate.mockResolvedValue({ text: privateText });
  for (const adapter of [new OpenAIAdapter(env), new GoogleAIAdapter(env)])
    expect(await adapter.completion({ input: privateText, instructions: privateText })).toBe(
      privateText
    );
  mocks.stream.mockImplementation(() => {
    throw new Error(privateText);
  });
  mocks.generate.mockRejectedValue(new Error(privateText));
  for (const adapter of [new OpenAIAdapter(env), new GoogleAIAdapter(env)])
    await expect(adapter.completion({ input: privateText })).rejects.toThrow('Completion failed');
  expect(
    JSON.stringify([mocks.info.mock.calls, mocks.error.mock.calls, mocks.debug.mock.calls])
  ).not.toContain(privateText);
});
