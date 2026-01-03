import { Router } from 'express';

export function createConfigRouter(deps: { openaiConfigured: boolean }): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ openaiConfigured: deps.openaiConfigured });
  });

  return router;
}
