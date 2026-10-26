import express, { type Express } from 'express';
import type { Server } from 'node:http';
import { createIntegrationRouter, type IntegrationOptions } from './integrationRoutes.js';
import type { IntegrationService } from '../services/IntegrationService.js';

/** The listeners share one service/session. Private mode never mounts tools on the UI app. */
export function mountIntegrations(
  publicApp: Express,
  service: IntegrationService,
  options: IntegrationOptions & { listener: 'shared' | 'loopback' }
): Express | null {
  if (options.listener === 'shared') {
    publicApp.use('/integrations', createIntegrationRouter(service, options));
    return null;
  }
  publicApp.use('/integrations', (_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });
  if (!options.enabled) return null;
  const privateApp = express();
  privateApp.use('/integrations', createIntegrationRouter(service, options));
  return privateApp;
}

/** Never configurable to a wildcard: this listener is exclusively for same-pod clients. */
export function listenForIntegrations(app: Express, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1');
    server.once('error', reject);
    server.once('listening', () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}
