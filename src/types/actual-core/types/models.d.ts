// Minimal type stubs for @actual-app/core/types/models
// Prevents TypeScript from resolving into raw .ts source files
export type ImportTransactionEntity = Record<string, unknown> & { account?: string };
export type RuleEntity = { id: string } & Record<string, unknown>;
export type TransactionEntity = { id: string } & Record<string, unknown>;
