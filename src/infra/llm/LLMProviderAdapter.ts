import { generateText, jsonSchema, Output } from 'ai';
import type { LanguageModel } from 'ai';
import { LLMError } from '../../domain/errors.js';
import { logger } from '../logger.js';
import type {
  LLMAdapter,
  LLMCapabilities,
  LLMObjectOptions,
  LLMTextOptions,
} from './LLMAdapter.js';

type ModelFactory = (modelId: string) => LanguageModel;

interface ProviderAdapterOptions {
  providerId: string;
  defaultModel: string;
  modelFactory: ModelFactory;
  isConfigured: () => boolean;
  supportsWebSearch?: boolean;
  supportsJsonSchema?: boolean;
}

function normalizeJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => normalizeJsonSchema(item));
  }

  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const obj = schema as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    normalized[key] = normalizeJsonSchema(value);
  }

  if (Array.isArray(normalized.type)) {
    const types = normalized.type.filter((type) => type !== 'null');
    if (types.length === 1) {
      normalized.type = types[0];
      normalized.nullable = Boolean(normalized.nullable) || true;
    }
  }

  return normalized;
}

function truncateValue(value: string, limit = 800): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…`;
}

function safeSerialize(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export class LLMProviderAdapter implements LLMAdapter {
  private providerId: string;
  private defaultModel: string;
  private modelFactory: ModelFactory;
  private configured: () => boolean;
  private supportsWebSearch: boolean;
  private supportsJsonSchema: boolean;

  constructor(options: ProviderAdapterOptions) {
    this.providerId = options.providerId;
    this.defaultModel = options.defaultModel;
    this.modelFactory = options.modelFactory;
    this.configured = options.isConfigured;
    this.supportsWebSearch = options.supportsWebSearch ?? false;
    this.supportsJsonSchema = options.supportsJsonSchema ?? true;
  }

  capabilities(): LLMCapabilities {
    return {
      webSearch: this.supportsWebSearch,
      jsonSchema: this.supportsJsonSchema,
    };
  }

  isConfigured(): boolean {
    return this.configured();
  }

  async generateText(options: LLMTextOptions): Promise<string> {
    if (!this.isConfigured()) {
      logger.error('LLM provider is not configured', { provider: this.providerId });
      throw new LLMError('LLM provider is not configured');
    }

    if (options.webSearch && !this.supportsWebSearch) {
      logger.warn('Web search requested but not supported by provider', {
        provider: this.providerId,
      });
    }

    const modelId = options.model ?? this.defaultModel;
    const model = this.modelFactory(modelId);

    try {
      logger.info('LLM text request', {
        provider: this.providerId,
        model: modelId,
        inputLength: options.input.length,
        hasSystem: Boolean(options.system),
        webSearch: options.webSearch ?? false,
        inputPreview: truncateValue(options.input),
      });

      const response = await generateText({
        model,
        system: options.system,
        prompt: options.input,
        providerOptions: options.providerOptions,
      });

      logger.info('LLM text response', {
        provider: this.providerId,
        model: modelId,
        responseLength: response.text.length,
        responsePreview: truncateValue(response.text),
      });

      return response.text;
    } catch (error) {
      logger.error('LLM text generation failed', {
        provider: this.providerId,
        error,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new LLMError('Text generation failed', { error });
    }
  }

  async generateObject<T>(options: LLMObjectOptions): Promise<T> {
    if (!this.isConfigured()) {
      logger.error('LLM provider is not configured', { provider: this.providerId });
      throw new LLMError('LLM provider is not configured');
    }

    if (options.webSearch && !this.supportsWebSearch) {
      logger.warn('Web search requested but not supported by provider', {
        provider: this.providerId,
      });
    }

    const modelId = options.model ?? this.defaultModel;
    const model = this.modelFactory(modelId);

    try {
      logger.info('LLM structured request', {
        provider: this.providerId,
        model: modelId,
        inputLength: options.input.length,
        hasSystem: Boolean(options.system),
        schemaName: options.schema.name,
        webSearch: options.webSearch ?? false,
        inputPreview: truncateValue(options.input),
      });

      const normalizedSchema = normalizeJsonSchema(options.schema.schema) as Record<
        string,
        unknown
      >;

      if (normalizedSchema.type !== 'object') {
        logger.error('LLM schema must be an object', {
          provider: this.providerId,
          schemaName: options.schema.name,
          schemaType: normalizedSchema.type ?? null,
        });
        throw new LLMError('LLM schema must be a JSON object');
      }

      const response = await generateText({
        model,
        system: options.system,
        prompt: options.input,
        output: Output.object({
          schema: jsonSchema(normalizedSchema),
          name: options.schema.name,
          description: options.schema.description,
        }),
        providerOptions: options.providerOptions,
      });

      logger.info('LLM structured response', {
        provider: this.providerId,
        model: modelId,
        outputPreview: truncateValue(safeSerialize(response.output)),
      });

      return response.output as T;
    } catch (error) {
      logger.error('LLM structured generation failed', {
        provider: this.providerId,
        error,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new LLMError('Structured generation failed', { error });
    }
  }
}
