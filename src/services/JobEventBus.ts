import { EventEmitter } from 'node:events';
import type { Job } from '../domain/entities/Job.js';

export type JobEventPayload = {
  job: Job;
  status: Job['status'];
  event: 'created' | 'status';
  timestamp: string;
};

type JobListener = (payload: JobEventPayload) => void;

export class JobEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  onJob(listener: JobListener): void {
    this.emitter.on('job', listener);
  }

  offJob(listener: JobListener): void {
    this.emitter.off('job', listener);
  }

  emitJob(payload: JobEventPayload): void {
    this.emitter.emit('job', payload);
  }
}
