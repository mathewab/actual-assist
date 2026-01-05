import type { Env } from '../infra/env.js';
import type { AppConfigRepository } from '../infra/repositories/AppConfigRepository.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import { ValidationError } from '../domain/errors.js';
import { LLM_PROVIDERS, type LLMProviderId, isProviderConfigured } from '../infra/llm/providers.js';
import type { LLMRouter } from '../infra/llm/LLMRouter.js';

export interface LLMConfigResponse {
  llmConfigured: boolean;
  llmProvider: LLMProviderId;
  llmModel: string;
  llmModelOverride: string | null;
  llmBaseUrl: string | null;
  llmBaseUrlEffective: string | null;
  llmProviders: Array<{
    id: LLMProviderId;
    label: string;
    configured: boolean;
    defaultModel: string;
  }>;
}

export class LLMConfigService {
  constructor(
    private env: Env,
    private configRepo: AppConfigRepository,
    private llmRouter: LLMRouter,
    private auditRepo: AuditRepository
  ) {}

  getConfig(): LLMConfigResponse {
    const activeProvider = this.llmRouter.getActiveProvider();
    const activeModel = this.llmRouter.getActiveModel(activeProvider);
    const modelOverride = this.configRepo.get('llm_model');
    const baseUrl = this.configRepo.getProviderBaseUrl(activeProvider);
    const effectiveBaseUrl = this.llmRouter.getActiveBaseUrl(activeProvider);
    return {
      llmConfigured: this.llmRouter.isConfigured(),
      llmProvider: activeProvider,
      llmModel: activeModel,
      llmModelOverride: modelOverride,
      llmBaseUrl: baseUrl,
      llmBaseUrlEffective: effectiveBaseUrl,
      llmProviders: this.llmRouter.listProviders().map((provider) => ({
        id: provider.id,
        label: provider.label,
        configured: provider.configured,
        defaultModel: provider.defaultModel,
      })),
    };
  }

  updateConfig(params: {
    provider: LLMProviderId;
    model?: string;
    baseUrl?: string;
  }): LLMConfigResponse {
    const provider = params.provider;
    if (!LLM_PROVIDERS[provider]) {
      throw new ValidationError('Unsupported LLM provider', { provider });
    }

    if (!isProviderConfigured(this.env, provider)) {
      throw new ValidationError('LLM provider is not configured', { provider });
    }

    const trimmedModel = params.model?.trim() ?? '';
    const model = trimmedModel.length > 0 ? trimmedModel : null;
    let baseUrl: string | null | undefined;
    if (params.baseUrl !== undefined) {
      const trimmedBaseUrl = params.baseUrl.trim();
      baseUrl = trimmedBaseUrl.length > 0 ? trimmedBaseUrl : null;
      if (baseUrl) {
        try {
          new URL(baseUrl);
        } catch {
          throw new ValidationError('Invalid base URL', { baseUrl });
        }
      }
    }
    const previousProvider = this.configRepo.get('llm_provider');
    const previousModel = this.configRepo.get('llm_model');
    const previousBaseUrl = this.configRepo.getProviderBaseUrl(provider);

    this.configRepo.setLlmConfig(provider, model);
    if (params.baseUrl !== undefined) {
      this.configRepo.setProviderBaseUrl(provider, baseUrl ?? null);
    }

    const nextBaseUrl = params.baseUrl !== undefined ? baseUrl : previousBaseUrl;

    if (
      previousProvider !== provider ||
      previousModel !== model ||
      previousBaseUrl !== nextBaseUrl
    ) {
      this.auditRepo.log({
        eventType: 'llm_provider_changed',
        entityType: 'config',
        entityId: 'llm',
        metadata: {
          previousProvider,
          previousModel,
          provider,
          model,
          baseUrl: nextBaseUrl,
        },
      });
    }

    return this.getConfig();
  }
}
