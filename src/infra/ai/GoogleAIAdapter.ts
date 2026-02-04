import { GoogleGenAI } from '@google/genai';
import { AIError } from '../../domain/errors.js';
import { logger } from '../logger.js';
import { parseJsonResponse } from './parseJsonResponse.js';
import type { AIAdapter, AICapabilities, CompletionOptions } from './AIAdapter.js';
import type { Env } from '../env.js';

/**
 * Google AI (Gemini) adapter
 * P5 (Separation of concerns): Domain layer uses AIAdapter interface
 *
 * Uses the @google/genai SDK which supports:
 * - System instructions
 * - Structured JSON output via responseSchema
 * - Streaming responses
 *
 * Note: Web search is NOT supported by Gemini API directly
 */
export class GoogleAIAdapter implements AIAdapter {
  private client: GoogleGenAI | null;
  private model: string;
  private apiKey?: string;

  constructor(env: Env) {
    this.apiKey = env.GOOGLE_AI_API_KEY;
    this.client = this.apiKey ? new GoogleGenAI({ apiKey: this.apiKey }) : null;
    this.model = env.GOOGLE_AI_MODEL;
  }

  /**
   * Generate completion using the Google AI API
   */
  async completion(options: CompletionOptions): Promise<string> {
    if (!this.client || !this.apiKey) {
      logger.error('Google AI API key is not configured');
      throw new AIError('Google AI API key is not configured', 'google');
    }

    try {
      // Log warning if web search requested (not supported)
      if (options.webSearch) {
        logger.warn('Web search requested but not supported by Google AI backend', {
          backend: 'google',
        });
      }

      // Build the prompt (combine instructions and input like OpenAI does with system + user)
      const prompt = options.instructions
        ? `${options.instructions}\n\n${options.input}`
        : options.input;

      logger.info('Google AI request payload', {
        model: this.model,
        hasInstructions: !!options.instructions,
        inputLength: options.input.length,
        hasJsonSchema: !!options.jsonSchema,
        webSearchRequested: options.webSearch ?? false,
      });

      // Build config for structured output if JSON schema is provided
      const config: Record<string, unknown> = {};
      if (options.jsonSchema) {
        config.responseMimeType = 'application/json';
        // Use responseJsonSchema for JSON Schema format (more compatible)
        config.responseJsonSchema = options.jsonSchema.schema;
      }

      const response = await this.client.models.generateContent({
        model: this.model,
        contents: prompt,
        config: Object.keys(config).length > 0 ? config : undefined,
      });

      const content = response.text;

      if (!content) {
        logger.error('Empty response from Google AI', {
          response: JSON.stringify(response, null, 2),
        });
        throw new AIError('Empty response from Google AI', 'google');
      }

      logger.info('Google AI completion successful', {
        inputLength: options.input.length,
        responseLength: content.length,
      });

      return content;
    } catch (error) {
      if (error instanceof AIError) {
        throw error;
      }
      logger.error('Google AI completion failed', {
        error,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new AIError('Completion failed', 'google', { error });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  getCapabilities(): AICapabilities {
    return {
      supportsWebSearch: false, // Gemini API doesn't have built-in web search
      supportsStructuredOutput: true,
      supportsStreaming: true,
    };
  }

  getBackendName(): string {
    return 'Google AI (Gemini)';
  }

  /**
   * Parse JSON from LLM response
   * Delegates to shared utility for consistency across adapters
   */
  static parseJsonResponse<T>(content: string): T {
    return parseJsonResponse<T>(content);
  }
}
