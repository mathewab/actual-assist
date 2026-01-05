import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../../src/infra/env.js';
import { LLMRouter } from '../../../src/infra/llm/LLMRouter.js';
import type { AppConfigRepository } from '../../../src/infra/repositories/AppConfigRepository.js';

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
  generateObject: vi.fn(),
  jsonSchema: vi.fn((schema) => schema),
  createGateway: vi.fn(() => (modelId: string) => ({ provider: 'gateway', modelId })),
}));

const providerMocks = vi.hoisted(() => ({
  createOpenAI: vi.fn(() => (modelId: string) => ({ provider: 'openai', modelId })),
  createAnthropic: vi.fn(() => (modelId: string) => ({ provider: 'anthropic', modelId })),
  createGoogleGenerativeAI: vi.fn(() => (modelId: string) => ({ provider: 'google', modelId })),
}));

vi.mock('ai', () => aiMocks);

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: providerMocks.createOpenAI,
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: providerMocks.createAnthropic,
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: providerMocks.createGoogleGenerativeAI,
}));

vi.mock('ollama-ai-provider-v2', () => ({
  createOllama: vi.fn(() => (modelId: string) => ({ provider: 'ollama', modelId })),
}));

const env: Env = {
  NODE_ENV: 'test',
  PORT: 3000,
  ACTUAL_SERVER_URL: 'http://localhost:5006',
  ACTUAL_PASSWORD: 'test-password',
  ACTUAL_BUDGET_ID: '00000000-0000-0000-0000-000000000000',
  ACTUAL_SYNC_ID: undefined,
  ACTUAL_ENCRYPTION_KEY: undefined,
  LLM_PROVIDER: 'openai',
  LLM_MODEL: undefined,
  OPENAI_API_KEY: 'sk-test',
  ANTHROPIC_API_KEY: 'ant-test',
  GOOGLE_API_KEY: 'google-test',
  OLLAMA_API_KEY: undefined,
  OLLAMA_BASE_URL: undefined,
  AI_GATEWAY_API_KEY: 'gw-test',
  AI_GATEWAY_BASE_URL: undefined,
  DATA_DIR: './data',
  SQLITE_DB_PATH: './data/audit.db',
  LOG_LEVEL: 'info',
  LOG_FILE: undefined,
  SYNC_INTERVAL_MINUTES: 360,
  JOB_TIMEOUT_MINUTES: 60,
  JOB_TIMEOUT_CHECK_INTERVAL_MINUTES: 5,
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 120,
};

describe('LLMRouter', () => {
  it('uses stored provider and model when available', async () => {
    aiMocks.generateText.mockResolvedValue({ text: 'ok' });

    const configRepo = {
      get: (key: string) => {
        if (key === 'llm_provider') return 'anthropic';
        if (key === 'llm_model') return 'claude-test';
        return null;
      },
      getProviderBaseUrl: () => null,
    } as AppConfigRepository;

    const router = new LLMRouter(env, configRepo);
    await router.generateText({ input: 'ping' });

    expect(aiMocks.generateText).toHaveBeenCalledOnce();
    const call = aiMocks.generateText.mock.calls[0][0];
    expect(call.model).toEqual({ provider: 'anthropic', modelId: 'claude-test' });
  });
});
