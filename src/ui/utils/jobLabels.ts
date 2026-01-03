import type { Job } from '../services/api';

const jobUsesAI = (job: Job): boolean => {
  return Boolean((job.metadata as { useAI?: boolean } | null)?.useAI);
};

export function formatJobTypeLabel(job: Job): string {
  switch (job.type) {
    case 'budget_sync':
      return 'Sync Budget';
    case 'suggestions_generate':
      return jobUsesAI(job) ? 'Generate Suggestions (AI)' : 'Generate Suggestions';
    case 'sync_and_suggest':
      return jobUsesAI(job) ? 'Sync & Generate (AI)' : 'Sync & Generate';
    case 'suggestions_retry_payee':
      return 'Retry Suggestions';
    case 'suggestions_apply':
      return 'Apply Suggestions';
    case 'templates_apply':
      return 'Apply Templates';
    case 'payees_merge':
      return 'Merge Payees';
    case 'payees_merge_suggestions_generate':
      return 'Generate Payee Merges';
    case 'snapshot_create':
      return 'Create Snapshot';
    case 'snapshot_redownload':
      return 'Redownload Snapshot';
    case 'scheduled_sync_and_suggest':
      return jobUsesAI(job) ? 'Scheduled Sync & Generate (AI)' : 'Scheduled Sync & Generate';
    default:
      return job.type;
  }
}
