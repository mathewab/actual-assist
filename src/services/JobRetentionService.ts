import { logger } from '../infra/logger.js';
import type { JobRepository } from '../infra/repositories/JobRepository.js';
import type { JobStepRepository } from '../infra/repositories/JobStepRepository.js';
import type { JobEventRepository } from '../infra/repositories/JobEventRepository.js';

/**
 * JobRetentionService - purge old job data
 * P7 (Error handling): Logs failures with context
 */
export class JobRetentionService {
  constructor(
    private jobRepo: JobRepository,
    private stepRepo: JobStepRepository,
    private eventRepo: JobEventRepository
  ) {}

  cleanupOlderThan(days: number): number {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const jobIds = this.jobRepo.listIdsOlderThan(cutoff);

    if (jobIds.length === 0) {
      logger.info('No expired jobs to cleanup', { cutoff: cutoff.toISOString() });
      return 0;
    }

    try {
      this.eventRepo.deleteByJobIds(jobIds);
      this.stepRepo.deleteByJobIds(jobIds);
      this.jobRepo.deleteByIds(jobIds);

      logger.info('Cleaned up expired jobs', {
        count: jobIds.length,
        cutoff: cutoff.toISOString(),
      });

      return jobIds.length;
    } catch (error) {
      logger.error('Failed to cleanup expired jobs', { error });
      throw error;
    }
  }
}
