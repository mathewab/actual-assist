import { type HttpAuth, principalOf } from '../auth/httpAuth.js';
import { permits } from '../auth/principals.js';
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
  auth: HttpAuth;
  version: string;
}

/** Stateless MCP transports have request lifetimes; the injected budget service has a process lifetime. */
export function createIntegrationRouter(
  service: IntegrationService,
  options: IntegrationOptions
): Router {
  const router = Router();
  if (options.enabled && options.auth.mode !== 'enforced')
    throw new Error('Machine API requires enforced authentication');
  const paths = ['/api/v1', '/mcp'];
  if (!options.enabled) {
    router.use(paths, (_req, res) => {
      res.status(404).json({ error: 'NOT_FOUND' });
    });
    return router;
  }
  router.use(
    paths,
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'RATE_LIMITED' },
    }),
    options.auth.requirePermission('budget:read')
  );
  router.use(paths, express.json({ limit: '32kb' }));
  router.get('/api/v1/health', (_req, res) => {
    const ready = service.isReady();
    res
      .status(ready ? 200 : 503)
      .json({ status: ready ? 'ready' : 'not-ready', version: options.version });
  });
  router.get('/api/v1/:collection', async (req, res) => {
    try {
      const collection = collectionSchema.parse(req.params.collection);
      res.json(await service.read(collection, req.query, 'rest', principalOf(res).id));
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
            if (!permits(principalOf(res), 'budget:read')) throw new Error('Forbidden');
            const result = await service.read(collection, input, 'mcp', principalOf(res).id);
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
  router.use(paths, (_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    const tooLarge = error?.type === 'entity.too.large';
    res.status(tooLarge ? 413 : 400).json({
      error: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST',
      message: 'Invalid request body',
    });
  };
  router.use(paths, handleError);
  return router;
}
