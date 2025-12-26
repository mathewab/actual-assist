/**
 * JobStep entity - ordered step within a combined job
 * P1 (Single Responsibility): Tracks step lifecycle
 */
export type JobStepType = 'sync' | 'suggestions';
export type JobStepStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface JobStep {
  id: string;
  jobId: string;
  stepType: JobStepType;
  status: JobStepStatus;
  position: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failureReason: string | null;
}

/**
 * Factory function to create a new JobStep
 * P4 (Explicitness): All fields explicitly captured
 */
export function createJobStep(params: {
  id: string;
  jobId: string;
  stepType: JobStepType;
  position: number;
}): JobStep {
  return {
    id: params.id,
    jobId: params.jobId,
    stepType: params.stepType,
    position: params.position,
    status: 'queued',
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    failureReason: null,
  };
}
