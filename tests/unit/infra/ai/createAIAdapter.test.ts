import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAIAdapter } from '../../../../src/infra/ai/createAIAdapter.js';
import type { Env } from '../../../../src/infra/env.js';

// Mock the logger to avoid console output during tests
vi.mock('../../../../src/infra/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Create a minimal mock env
function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    ACTUAL_SERVER_URL: 'http://localhost:5006',
    ACTUAL_PASSWORD: 'test-password',
    ACTUAL_BUDGET_ID: '00000000-0000-0000-0000-000000000000',
    AI_BACKEND: 'openai',
    OPENAI_API_KEY: undefined,
    OPENAI_MODEL: 'gpt-4o-mini',
    GOOGLE_AI_API_KEY: undefined,
    GOOGLE_AI_MODEL: 'gemini-2.0-flash',
    DATA_DIR: './data',
    SQLITE_DB_PATH: './data/test.db',
    LOG_LEVEL: 'info',
    SYNC_INTERVAL_MINUTES: 360,
    JOB_TIMEOUT_MINUTES: 60,
    JOB_TIMEOUT_CHECK_INTERVAL_MINUTES: 5,
    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_MAX_REQUESTS: 120,
    ...overrides,
  } as Env;
}

describe('createAIAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return OpenAIAdapter when AI_BACKEND=openai and configured', () => {
    const env = createMockEnv({
      AI_BACKEND: 'openai',
      OPENAI_API_KEY: 'sk-test-key',
    });

    const adapter = createAIAdapter(env);

    expect(adapter.getBackendName()).toBe('OpenAI');
    expect(adapter.isConfigured()).toBe(true);
  });

  it('should return unconfigured OpenAIAdapter when no API key is set', () => {
    const env = createMockEnv({
      AI_BACKEND: 'openai',
      OPENAI_API_KEY: undefined,
    });

    const adapter = createAIAdapter(env);

    expect(adapter.getBackendName()).toBe('OpenAI');
    expect(adapter.isConfigured()).toBe(false);
  });

  it('should return GoogleAIAdapter when AI_BACKEND=google and configured', () => {
    const env = createMockEnv({
      AI_BACKEND: 'google',
      GOOGLE_AI_API_KEY: 'test-google-key',
    });

    const adapter = createAIAdapter(env);

    expect(adapter.getBackendName()).toBe('Google AI (Gemini)');
    expect(adapter.isConfigured()).toBe(true);
  });

  it('should fall back to OpenAI when AI_BACKEND=google but not configured', () => {
    const env = createMockEnv({
      AI_BACKEND: 'google',
      GOOGLE_AI_API_KEY: undefined,
      OPENAI_API_KEY: 'sk-test-key',
    });

    const adapter = createAIAdapter(env);

    expect(adapter.getBackendName()).toBe('OpenAI');
    expect(adapter.isConfigured()).toBe(true);
  });

  it('should return unconfigured adapter when both backends are not configured', () => {
    const env = createMockEnv({
      AI_BACKEND: 'google',
      GOOGLE_AI_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
    });

    const adapter = createAIAdapter(env);

    // Falls back to OpenAI (unconfigured)
    expect(adapter.getBackendName()).toBe('OpenAI');
    expect(adapter.isConfigured()).toBe(false);
  });

  it('should report correct capabilities for OpenAI', () => {
    const env = createMockEnv({
      AI_BACKEND: 'openai',
      OPENAI_API_KEY: 'sk-test-key',
    });

    const adapter = createAIAdapter(env);
    const capabilities = adapter.getCapabilities();

    expect(capabilities.supportsWebSearch).toBe(true);
    expect(capabilities.supportsStructuredOutput).toBe(true);
    expect(capabilities.supportsStreaming).toBe(true);
  });

  it('should report correct capabilities for Google AI', () => {
    const env = createMockEnv({
      AI_BACKEND: 'google',
      GOOGLE_AI_API_KEY: 'test-google-key',
    });

    const adapter = createAIAdapter(env);
    const capabilities = adapter.getCapabilities();

    expect(capabilities.supportsWebSearch).toBe(false);
    expect(capabilities.supportsStructuredOutput).toBe(true);
    expect(capabilities.supportsStreaming).toBe(true);
  });
});
