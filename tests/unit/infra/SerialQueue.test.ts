import { describe, expect, it } from 'vitest';
import { SerialQueue } from '../../../src/infra/SerialQueue.js';

describe('Actual session queue', () => {
  it('serializes work, recovers from failures, and drains before closing once', async () => {
    const queue = new SerialQueue();
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = queue.run(async () => {
      events.push('read');
      await gate;
      events.push('done');
    });
    const failed = queue.run(async () => {
      events.push('failure');
      throw new Error('fixture');
    });
    const failure = expect(failed).rejects.toThrow('fixture');
    const last = queue.run(async () => {
      events.push('next');
    });
    const close = queue.close(async () => {
      events.push('shutdown');
    });
    const closeAgain = queue.close(async () => {
      events.push('unexpected');
    });
    await expect(queue.run(async () => undefined)).rejects.toThrow('shutting down');
    expect(events).toEqual(['read']);
    release();
    await Promise.all([first, failure, last, close, closeAgain]);
    expect(events).toEqual(['read', 'done', 'failure', 'next', 'shutdown']);
  });
});
