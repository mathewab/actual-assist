import OpenAI from 'openai';
import { OpenAIError } from '../domain/errors.js';
import { logger } from './logger.js';
import type { Env } from './env.js';
import type { AIAdapter, AICapabilities, CompletionOptions } from './ai/AIAdapter.js';
import { parseJsonResponse } from './ai/parseJsonResponse.js';

// Re-export CompletionOptions for backward compatibility
export type { CompletionOptions } from './ai/AIAdapter.js';

/**
 * OpenAI API adapter - generic wrapper for OpenAI Responses API
 * P5 (Separation of concerns): Domain layer never imports OpenAI directly
 *
 * Uses the Responses API which supports:
 * - System instructions separate from input
 * - Optional web search tool for real-time information
 * - Consistent interface for all completion types
 */
export class OpenAIAdapter implements AIAdapter {
  private client: OpenAI | null;
  private model: string;
  private apiKey?: string;

  constructor(env: Env) {
    this.apiKey = env.OPENAI_API_KEY;
    this.client = this.apiKey
      ? new OpenAI({
          apiKey: this.apiKey,
        })
      : null;
    this.model = env.OPENAI_MODEL;
  }

  /**
   * Generate completion using the Responses API
   * @param options.instructions - System instructions for the model
   * @param options.input - User input/prompt
   * @param options.webSearch - Enable web search for up-to-date information
   */
  async completion(options: CompletionOptions): Promise<string> {
    if (!this.client || !this.apiKey) {
      logger.error('OpenAI API key is not configured');
      throw new OpenAIError('OpenAI API key is not configured');
    }

    try {
      const tools: OpenAI.Responses.Tool[] = options.webSearch
        ? [{ type: 'web_search_preview' }]
        : [];

      logger.info('OpenAI request payload', {
        model: this.model,
        instructions: options.instructions ?? null,
        input: options.input,
        inputLength: options.input.length,
        hasInstructions: !!options.instructions,
        webSearch: options.webSearch ?? false,
        responseSchemaName: options.jsonSchema?.name ?? null,
      });

      const text =
        options.jsonSchema && options.jsonSchema.schema
          ? {
              format: {
                type: 'json_schema' as const,
                name: options.jsonSchema.name,
                schema: options.jsonSchema.schema,
                strict: options.jsonSchema.strict ?? true,
              },
            }
          : undefined;

      const responseStream = this.client.responses.stream({
        model: this.model,
        instructions: options.instructions,
        input: options.input,
        tools: tools.length > 0 ? tools : undefined,
        text,
      });
      let chunkBuffer = '';
      responseStream.on('response.output_text.delta', (event) => {
        chunkBuffer += event.delta;
        if (chunkBuffer.length >= 100) {
          logger.info('OpenAI response chunk', {
            delta: chunkBuffer,
          });
          chunkBuffer = '';
        }
      });
      const response = await responseStream.finalResponse();
      if (chunkBuffer.length > 0) {
        logger.info('OpenAI response chunk', {
          delta: chunkBuffer,
        });
      }

      // Log response structure for debugging
      logger.debug('OpenAI Responses API response', {
        outputCount: response.output.length,
        outputTypes: response.output.map((item) => item.type),
      });

      // Check if web search was performed (when enabled)
      if (options.webSearch) {
        type WebSearchCallOutput = Extract<
          OpenAI.Responses.ResponseOutputItem,
          { type: 'web_search_call' }
        >;
        const webSearchItem = response.output.find(
          (item): item is WebSearchCallOutput => item.type === 'web_search_call'
        );
        if (webSearchItem) {
          const status =
            typeof (webSearchItem as { status?: string }).status === 'string'
              ? (webSearchItem as { status?: string }).status
              : 'unknown';
          logger.info('Web search was performed', {
            status,
          });
        } else {
          logger.warn('Web search was enabled but NOT performed');
        }
      }

      // Extract text content from response
      const textOutput = response.output.find((item) => item.type === 'message');
      const content = textOutput?.content?.find((c) => c.type === 'output_text')?.text;

      if (!content) {
        logger.error('Empty response from OpenAI', {
          outputs: JSON.stringify(response.output, null, 2),
        });
        throw new OpenAIError('Empty response from OpenAI');
      }

      logger.info('OpenAI completion successful', {
        inputLength: options.input.length,
        responseLength: content.length,
        webSearch: options.webSearch ?? false,
      });

      return content;
    } catch (error) {
      if (error instanceof OpenAIError) {
        throw error;
      }
      logger.error('OpenAI completion failed', {
        error,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new OpenAIError('Completion failed', { error });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  getCapabilities(): AICapabilities {
    return {
      supportsWebSearch: true,
      supportsStructuredOutput: true,
      supportsStreaming: true,
    };
  }

  getBackendName(): string {
    return 'OpenAI';
  }

  /**
   * Parse JSON from LLM response (handles markdown code blocks)
   * Delegates to shared utility for consistency across adapters
   */
  static parseJsonResponse<T>(content: string): T {
    return parseJsonResponse<T>(content);
  }
}
