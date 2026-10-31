export interface ReportFacts {
  schemaVersion: 1;
  month: string;
  currency: string;
  capturedAt: string;
  income: number;
  spending: number;
  net: number;
  unresolvedInflows: number;
  categories: Array<{ id: string; name: string; amount: number }>;
  accounts: Array<{ name: string; latestRecord: string | null; firstRecord?: string | null }>;
  warnings: string[];
  transactionCount: number;
}
export interface SavedReport {
  rendererVersion: 1 | 2;
  analysis?: ReportAnalysis;
  narrativeSource?: 'local' | 'ai-assisted';
  id: string;
  budgetId: string;
  month: string;
  version: number;
  createdAt: string;
  jobId: string;
  supersedesId: string | null;
  sourceHash: string;
  pdfHash: string;
  facts: ReportFacts;
  narrative: string;
}

export interface ReportEvidence {
  id: string;
  sourceId: string;
  month: string;
  date: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string;
  payeeId: string | null;
  payeeName: string;
  amount: number;
  role: 'income' | 'spending' | 'transfer' | 'unresolved_inflow';
  parentId: string | null;
  parentAmount: number | null;
}
export interface ReportObservation {
  id: string;
  kind: 'category' | 'merchant' | 'purchase' | 'comparison' | 'repetition';
  text: string;
  evidenceIds: string[];
}
export interface ReportHistoryMonth {
  month: string;
  spending: number;
  income: number;
  transactionCount: number;
  cutoffDay: number | null;
}
export interface ReportAnalysis {
  evidenceVersion: 1;
  evidence: ReportEvidence[];
  observations: ReportObservation[];
  history: ReportHistoryMonth[];
  observedStart: string | null;
  observedEnd: string | null;
}
