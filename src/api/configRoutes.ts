import { Router } from 'express';
import type { AICapabilities } from '../infra/ai/AIAdapter.js';

export function createConfigRouter(deps: {
  aiConfigured: boolean;
  aiBackend: string;
  aiCapabilities: AICapabilities;
}): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      // New AI backend info
      aiConfigured: deps.aiConfigured,
      aiBackend: deps.aiBackend,
      aiCapabilities: deps.aiCapabilities,
      // Backward compatibility (deprecated)
      openaiConfigured: deps.aiConfigured,
    });
  });

  return router;
}
