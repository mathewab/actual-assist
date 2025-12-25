import OpenAI from 'openai';
import { OpenAIError } from '../domain/errors.js';
import { logger } from './logger.js';
import type { Env } from './env.js';

/** Options for completion using Responses API */
export interface CompletionOptions {
  /** System instructions for the model */
  instructions?: string;
  /** User input/prompt */
  input: string;
  /** Enable web search tool for up-to-date information */
  webSearch?: boolean;
}

/**
 * OpenAI API adapter - generic wrapper for OpenAI Responses API
 * P5 (Separation of concerns): Domain layer never imports OpenAI directly
 *
 * Uses the Responses API which supports:
 * - System instructions separate from input
 * - Optional web search tool for real-time information
 * - Consistent interface for all completion types
 */
export class OpenAIAdapter {
  private client: OpenAI;
  private model: string;

  constructor(env: Env) {
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
    this.model = env.OPENAI_MODEL;
  }

  /**
   * Generate completion using the Responses API
   * @param options.instructions - System instructions for the model
   * @param options.input - User input/prompt
   * @param options.webSearch - Enable web search for up-to-date information
   */
  async completion(options: CompletionOptions): Promise<string> {
    try {
      const tools: OpenAI.Responses.Tool[] = options.webSearch
        ? [{ type: 'web_search_preview' }]
        : [];

      logger.info('Calling OpenAI Responses API', {
        model: this.model,
        webSearch: options.webSearch ?? false,
        inputLength: options.input.length,
        hasInstructions: !!options.instructions,
      });

      const response = await this.client.responses.create({
        model: this.model,
        instructions: options.instructions,
        input: options.input,
        tools: tools.length > 0 ? tools : undefined,
      });

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

  /**
   * Parse JSON from LLM response (handles markdown code blocks)
   */
  static parseJsonResponse<T>(content: string): T {
    const trimmed = content.trim();

    // Strip common markdown code fences with optional language (case-insensitive)
    // Matches: ```json\n...``` or ```JSON\n...``` or ```anything\n...```
    const fencedMatch = trimmed.match(/```[^\n]*\n([\s\S]*?)```/i);
    const candidate = fencedMatch && fencedMatch[1] ? fencedMatch[1].trim() : trimmed;

    return JSON.parse(candidate);
  }
}
