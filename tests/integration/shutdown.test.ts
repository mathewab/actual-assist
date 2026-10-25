import { expect, it, vi } from 'vitest';
import express from 'express';
import { createJobEventsRouter } from '../../src/api/jobEventsRoutes.js';
import { JobEventBus } from '../../src/services/JobEventBus.js';
import { closeHttpServer } from '../../src/infra/closeHttpServer.js';

it('ends open SSE streams and drains an active HTTP read before resource cleanup', async () => {
  const bus = new JobEventBus();
  const unsubscribe = vi.spyOn(bus, 'offJob');
  const app = express();
  app.use('/events', createJobEventsRouter(bus));
  let finishRead!: () => void;
  let readStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    readStarted = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    finishRead = resolve;
  });
  app.get('/slow', async (_req, res) => {
    readStarted();
    await gate;
    res.json({ fixture: true });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing listener');
  const url = `http://127.0.0.1:${address.port}`;
  const controller = new AbortController();
  try {
    const stream = await fetch(`${url}/events/stream?budgetId=fixture`, {
      signal: controller.signal,
    });
    const reader = stream.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: ready');
    const slowRead = fetch(`${url}/slow`).then((response) => response.json());
    await started;
    const cleanupBudgetAndDatabase = vi.fn();
    const stopped = closeHttpServer(server, () => bus.shutdown()).then(cleanupBudgetAndDatabase);
    expect(bus.isStopping()).toBe(true);
    expect(await reader.read()).toMatchObject({ done: true });
    expect(unsubscribe).toHaveBeenCalled();
    expect(cleanupBudgetAndDatabase).not.toHaveBeenCalled();
    finishRead();
    await expect(slowRead).resolves.toEqual({ fixture: true });
    await stopped;
    expect(cleanupBudgetAndDatabase).toHaveBeenCalledTimes(1);
    bus.shutdown();
  } finally {
    finishRead();
    controller.abort();
    server.closeAllConnections();
    server.close();
  }
});
