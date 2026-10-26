import { createHash, timingSafeEqual } from 'node:crypto';
import express, { Router, type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  collectionSchema,
  readInputSchema,
  integrationError,
  type IntegrationService,
} from '../services/IntegrationService.js';

export interface IntegrationOptions {
  enabled: boolean;
  token?: string;
  allowedOrigins: string[];
  version: string;
}

/** Stateless MCP transports have request lifetimes; the injected budget service has a process lifetime. */
export function createIntegrationRouter(
  service: IntegrationService,
  options: IntegrationOptions
): Router {
  const router = Router();
  if (!options.enabled) {
    router.use((_req, res) => {
      res.status(404).json({ error: 'NOT_FOUND' });
    });
    return router;
  }
  if (!options.token || options.token.length < 32)
    throw new Error('Integration token must contain at least 32 characters');
  const tokenHash = createHash('sha256').update(options.token).digest();
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'RATE_LIMITED', message: 'Too many integration requests' },
    })
  );
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const authorization = req.get('authorization') ?? '';
    const candidate = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const hash = createHash('sha256').update(candidate).digest();
    if (!candidate || !timingSafeEqual(hash, tokenHash)) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="actual-assist"');
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Bearer authentication required' });
      return;
    }
    const origin = req.get('origin');
    if (origin && !options.allowedOrigins.includes(origin)) {
      res.status(403).json({ error: 'FORBIDDEN_ORIGIN', message: 'Origin is not allowed' });
      return;
    }
    next();
  });
  router.use(express.json({ limit: '32kb' }));
  router.get('/v1/health', (_req, res) => {
    const ready = service.isReady();
    res
      .status(ready ? 200 : 503)
      .json({ status: ready ? 'ready' : 'not-ready', version: options.version });
  });
  router.get('/v1/:collection', async (req, res) => {
    try {
      const collection = collectionSchema.parse(req.params.collection);
      res.json(await service.read(collection, req.query, 'rest'));
    } catch (error) {
      const safe = integrationError(error);
      res.status(safe.status).json({ error: safe.code, message: safe.message });
    }
  });
  router.post('/mcp', async (req, res) => {
    const server = new McpServer({ name: 'actual-assist', version: options.version });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    for (const collection of collectionSchema.options) {
      server.registerTool(
        `list_${collection}`,
        {
          description: `Read ${collection} from the configured budget cache. No synchronization or financial mutations. Transactions require accountId, startDate and endDate (maximum 93 days).`,
          inputSchema: readInputSchema,
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        },
        async (input) => {
          try {
            const result = await service.read(collection, input, 'mcp');
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
              structuredContent: result,
            };
          } catch (error) {
            const safe = integrationError(error);
            return {
              isError: true,
              content: [
                { type: 'text', text: JSON.stringify({ error: safe.code, message: safe.message }) },
              ],
            };
          }
        }
      );
    }
    res.on('close', () => {
      void server.close().catch(() => undefined);
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent)
        res.status(500).json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32603, message: 'Internal server error' },
        });
    }
  });
  router.all('/mcp', (_req, res) => {
    res.setHeader('Allow', 'POST');
    res
      .status(405)
      .json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Method not allowed' } });
  });
  router.use((_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    const tooLarge = error?.type === 'entity.too.large';
    res.status(tooLarge ? 413 : 400).json({
      error: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST',
      message: 'Invalid request body',
    });
  };
  router.use(handleError);
  return router;
}
