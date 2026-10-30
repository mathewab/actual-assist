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
  accounts: Array<{ name: string; latestRecord: string | null }>;
  warnings: string[];
  transactionCount: number;
}
export interface SavedReport {
  rendererVersion: 1;
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
