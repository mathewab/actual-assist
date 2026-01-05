import { Router } from 'express';
import { z } from 'zod';
import { ValidationError } from '../domain/errors.js';
import type { LLMConfigService } from '../services/LLMConfigService.js';

export function createConfigRouter(deps: { llmConfigService: LLMConfigService }): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(deps.llmConfigService.getConfig());
  });

  const llmConfigSchema = z.object({
    provider: z.enum(['openai', 'anthropic', 'google', 'ollama', 'gateway']),
    model: z.string().optional(),
    baseUrl: z.string().optional(),
  });

  router.put('/llm', (req, res, next) => {
    const parsed = llmConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError('Invalid LLM config payload', parsed.error.flatten()));
    }

    try {
      const updated = deps.llmConfigService.updateConfig(parsed.data);
      res.json(updated);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
