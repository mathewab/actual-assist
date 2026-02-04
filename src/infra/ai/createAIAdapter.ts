import type { Env } from '../env.js';
import type { AIAdapter } from './AIAdapter.js';
import { OpenAIAdapter } from '../OpenAIAdapter.js';
import { GoogleAIAdapter } from './GoogleAIAdapter.js';
import { logger } from '../logger.js';

/**
 * Factory function to create the appropriate AI adapter based on configuration
 * Falls back gracefully if selected backend is not configured
 *
 * @param env - Validated environment configuration
 * @returns The configured AI adapter instance
 */
export function createAIAdapter(env: Env): AIAdapter {
  const backend = env.AI_BACKEND;

  logger.info('Initializing AI backend', { requested: backend });

  if (backend === 'google') {
    const adapter = new GoogleAIAdapter(env);
    if (adapter.isConfigured()) {
      logger.info('Using Google AI (Gemini) backend', { model: env.GOOGLE_AI_MODEL });
      return adapter;
    }
    logger.warn(
      'Google AI selected but not configured (missing GOOGLE_AI_API_KEY), falling back to OpenAI'
    );
  }

  // Default to OpenAI
  const adapter = new OpenAIAdapter(env);
  if (adapter.isConfigured()) {
    logger.info('Using OpenAI backend', { model: env.OPENAI_MODEL });
    return adapter;
  }
  logger.warn('OpenAI not configured (missing OPENAI_API_KEY), AI features will be disabled');
  return adapter; // Return unconfigured adapter (isConfigured() returns false)
}
