import OpenAI from 'openai';
import { OpenAIError } from '../domain/errors.js';
import { logger } from './logger.js';
import type { Env } from './env.js';

/** Options for chat completion */
export interface ChatCompletionOptions {
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  jsonResponse?: boolean;
}

/** Options for responses API with web search */
export interface WebSearchCompletionOptions {
  prompt: string;
}

/**
 * OpenAI API adapter - generic wrapper for OpenAI API calls
 * P5 (Separation of concerns): Domain layer never imports OpenAI directly
 * 
 * This adapter is intentionally generic and reusable by any service.
 * Prompt construction belongs in the calling service, not here.
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
   * Simple chat completion (no web search)
   * Use for tasks where the model has sufficient knowledge
   */
  async chatCompletion(options: ChatCompletionOptions): Promise<string> {
    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      messages.push({ role: 'user', content: options.userPrompt });

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.3,
        response_format: options.jsonResponse ? { type: 'json_object' } : undefined,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new OpenAIError('Empty response from OpenAI');
      }

      logger.debug('OpenAI chat completion', {
        promptLength: options.userPrompt.length,
        responseLength: content.length,
      });

      return content;
    } catch (error) {
      if (error instanceof OpenAIError) {
        throw error;
      }
      logger.error('OpenAI chat completion failed', { error });
      throw new OpenAIError('Chat completion failed', { error });
    }
  }

  /**
   * Completion with web search using Responses API
   * Use for tasks requiring up-to-date information (e.g., merchant identification)
   */
  async webSearchCompletion(options: WebSearchCompletionOptions): Promise<string> {
    try {
      const response = await this.client.responses.create({
        model: this.model,
        tools: [{ type: 'web_search_preview' }],
        input: options.prompt,
      });

      // Extract text content from response
      const textOutput = response.output.find(item => item.type === 'message');
      const content = textOutput?.content?.find(c => c.type === 'output_text')?.text;
      
      if (!content) {
        throw new OpenAIError('Empty response from OpenAI');
      }

      logger.debug('OpenAI web search completion', {
        promptLength: options.prompt.length,
        responseLength: content.length,
      });

      return content;
    } catch (error) {
      if (error instanceof OpenAIError) {
        throw error;
      }
      logger.error('OpenAI web search completion failed', { error });
      throw new OpenAIError('Web search completion failed', { error });
    }
  }

  /**
   * Parse JSON from LLM response (handles markdown code blocks)
   */
  static parseJsonResponse<T>(content: string): T {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || 
                      content.match(/```\s*([\s\S]*?)```/) ||
                      [null, content];
    const jsonStr = jsonMatch[1]?.trim() || content.trim();
    return JSON.parse(jsonStr);
  }
}
