import { createGateway } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider-v2';
import type { Env } from '../env.js';
import type { AppConfigRepository } from '../repositories/AppConfigRepository.js';
import type {
  LLMAdapter,
  LLMCapabilities,
  LLMObjectOptions,
  LLMTextOptions,
} from './LLMAdapter.js';
import { LLMProviderAdapter } from './LLMProviderAdapter.js';
import { LLM_PROVIDERS, type LLMProviderId, isProviderConfigured } from './providers.js';

export class LLMRouter implements LLMAdapter {
  private adapters: Record<LLMProviderId, LLMProviderAdapter>;
  private env: Env;
  private configRepo: AppConfigRepository;

  constructor(env: Env, configRepo: AppConfigRepository) {
    this.env = env;
    this.configRepo = configRepo;

    this.adapters = {
      openai: new LLMProviderAdapter({
        providerId: 'openai',
        defaultModel: LLM_PROVIDERS.openai.defaultModel,
        modelFactory: (modelId) =>
          createOpenAI({
            apiKey: env.OPENAI_API_KEY,
            baseURL: this.getProviderBaseUrlOverride('openai') ?? undefined,
          })(modelId),
        isConfigured: () => Boolean(env.OPENAI_API_KEY),
      }),
      anthropic: new LLMProviderAdapter({
        providerId: 'anthropic',
        defaultModel: LLM_PROVIDERS.anthropic.defaultModel,
        modelFactory: (modelId) =>
          createAnthropic({
            apiKey: env.ANTHROPIC_API_KEY,
            baseURL: this.getProviderBaseUrlOverride('anthropic') ?? undefined,
          })(modelId),
        isConfigured: () => Boolean(env.ANTHROPIC_API_KEY),
      }),
      google: new LLMProviderAdapter({
        providerId: 'google',
        defaultModel: LLM_PROVIDERS.google.defaultModel,
        modelFactory: (modelId) =>
          createGoogleGenerativeAI({
            apiKey: env.GOOGLE_API_KEY,
            baseURL: this.getProviderBaseUrlOverride('google') ?? undefined,
          })(modelId),
        isConfigured: () => Boolean(env.GOOGLE_API_KEY),
      }),
      ollama: new LLMProviderAdapter({
        providerId: 'ollama',
        defaultModel: LLM_PROVIDERS.ollama.defaultModel,
        modelFactory: (modelId) =>
          createOllama({
            baseURL: this.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
          })(modelId),
        isConfigured: () => true,
      }),
      gateway: new LLMProviderAdapter({
        providerId: 'gateway',
        defaultModel: LLM_PROVIDERS.gateway.defaultModel,
        modelFactory: (modelId) =>
          createGateway({
            apiKey: env.AI_GATEWAY_API_KEY,
            baseURL: this.env.AI_GATEWAY_BASE_URL,
          })(modelId),
        isConfigured: () => Boolean(env.AI_GATEWAY_API_KEY),
      }),
    };
  }

  private getProviderBaseUrlOverride(providerId: LLMProviderId): string | null {
    return this.configRepo.getProviderBaseUrl(providerId);
  }

  private getProviderBaseUrlEffective(providerId: LLMProviderId): string | null {
    const override = this.getProviderBaseUrlOverride(providerId);
    if (override) return override;
    if (providerId === 'gateway') {
      return this.env.AI_GATEWAY_BASE_URL ?? 'https://ai-gateway.vercel.sh/v3/ai';
    }
    if (providerId === 'ollama') {
      return this.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    }
    if (providerId === 'openai') {
      return 'https://api.openai.com/v1';
    }
    if (providerId === 'anthropic') {
      return 'https://api.anthropic.com/v1';
    }
    if (providerId === 'google') {
      return 'https://generativelanguage.googleapis.com/v1beta';
    }
    return null;
  }

  listProviders(): Array<
    (typeof LLM_PROVIDERS)[keyof typeof LLM_PROVIDERS] & { configured: boolean }
  > {
    return (
      Object.values(LLM_PROVIDERS) as Array<(typeof LLM_PROVIDERS)[keyof typeof LLM_PROVIDERS]>
    ).map((provider) => ({
      ...provider,
      configured: isProviderConfigured(this.env, provider.id),
    }));
  }

  getActiveProvider(): LLMProviderId {
    const stored = this.configRepo.get('llm_provider');
    if (stored && stored in LLM_PROVIDERS) {
      return stored as LLMProviderId;
    }
    return this.env.LLM_PROVIDER;
  }

  getActiveModel(providerId?: LLMProviderId): string {
    const stored = this.configRepo.get('llm_model');
    if (stored) {
      return stored;
    }
    if (providerId) {
      if (providerId !== this.env.LLM_PROVIDER) {
        return LLM_PROVIDERS[providerId].defaultModel;
      }
      return this.env.LLM_MODEL || LLM_PROVIDERS[providerId].defaultModel;
    }
    return this.env.LLM_MODEL || LLM_PROVIDERS.openai.defaultModel;
  }

  getActiveBaseUrl(providerId?: LLMProviderId): string | null {
    const provider = providerId ?? this.getActiveProvider();
    return this.getProviderBaseUrlEffective(provider);
  }

  isConfigured(): boolean {
    const provider = this.getActiveProvider();
    return this.adapters[provider].isConfigured();
  }

  capabilities(): LLMCapabilities {
    const provider = this.getActiveProvider();
    return this.adapters[provider].capabilities();
  }

  async generateText(options: LLMTextOptions): Promise<string> {
    const provider = this.getActiveProvider();
    const adapter = this.adapters[provider];
    const model = options.model ?? this.getActiveModel(provider);
    return adapter.generateText({ ...options, model });
  }

  async generateObject<T>(options: LLMObjectOptions): Promise<T> {
    const provider = this.getActiveProvider();
    const adapter = this.adapters[provider];
    const model = options.model ?? this.getActiveModel(provider);
    return adapter.generateObject<T>({ ...options, model });
  }
}
