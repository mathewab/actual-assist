import type { Server } from 'node:http';

/** End owned indefinite streams; let ordinary in-flight HTTP work finish naturally. */
export function closeHttpServer(server: Server, closeStreams: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    closeStreams();
  });
}
