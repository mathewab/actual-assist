import type { Env } from '../env.js';

export type LLMProviderId = 'openai' | 'anthropic' | 'google' | 'ollama' | 'gateway';

export interface LLMProviderInfo {
  id: LLMProviderId;
  label: string;
  defaultModel: string;
  apiKeyEnv: keyof Env;
}

export const LLM_PROVIDERS: Record<LLMProviderId, LLMProviderInfo> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-3-5-sonnet-20241022',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    defaultModel: 'gemini-1.5-flash',
    apiKeyEnv: 'GOOGLE_API_KEY',
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    defaultModel: 'llama3.1:8b',
    apiKeyEnv: 'OLLAMA_API_KEY',
  },
  gateway: {
    id: 'gateway',
    label: 'AI Gateway',
    defaultModel: 'openai/gpt-4o-mini',
    apiKeyEnv: 'AI_GATEWAY_API_KEY',
  },
};

export function listProviders(env: Env): Array<LLMProviderInfo & { configured: boolean }> {
  return (Object.values(LLM_PROVIDERS) as LLMProviderInfo[]).map((provider) => ({
    ...provider,
    configured: isProviderConfigured(env, provider.id),
  }));
}

export function isProviderConfigured(env: Env, providerId: LLMProviderId): boolean {
  if (providerId === 'ollama') {
    return true;
  }
  const provider = LLM_PROVIDERS[providerId];
  return Boolean(env[provider.apiKeyEnv]);
}
