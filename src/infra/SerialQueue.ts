/** One FIFO owner for the process-global Actual API. Failures do not poison the queue. */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private closing = false;

  run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error('Actual API is shutting down'));
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }

  close(operation: () => Promise<void>): Promise<void> {
    if (this.closing) return this.tail.then(() => undefined);
    this.closing = true;
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
