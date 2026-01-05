import type { Env } from '../env.js';
import type { AppConfigRepository } from '../repositories/AppConfigRepository.js';
import { LLMRouter } from './LLMRouter.js';

export function createLLMRouter(env: Env, configRepo: AppConfigRepository): LLMRouter {
  return new LLMRouter(env, configRepo);
}
