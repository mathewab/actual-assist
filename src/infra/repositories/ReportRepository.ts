import type { DatabaseAdapter } from '../DatabaseAdapter.js';
import type { SavedReport } from '../../domain/reports/Report.js';
export class ReportRepository {
  constructor(private db: DatabaseAdapter) {}
  hasFile(id: string): boolean {
    return Boolean(this.db.queryOne('SELECT id FROM monthly_reports WHERE id = ?', [id]));
  }
  get(budgetId: string, id: string): SavedReport | null {
    const row = this.db.queryOne<{ report_json: string }>(
      'SELECT report_json FROM monthly_reports WHERE budget_id = ? AND id = ?',
      [budgetId, id]
    );
    return row ? (JSON.parse(row.report_json) as SavedReport) : null;
  }
  byKey(budgetId: string, key: string) {
    const row = this.db.queryOne<{ request_json: string; report_json: string }>(
      'SELECT request_json, report_json FROM monthly_reports WHERE budget_id = ? AND request_key = ?',
      [budgetId, key]
    );
    return row
      ? { request: row.request_json, report: JSON.parse(row.report_json) as SavedReport }
      : null;
  }
  list(budgetId: string, limit = 100, offset = 0): SavedReport[] {
    return this.db
      .query<{ report_json: string }>(
        "SELECT json_remove(report_json, '$.analysis') AS report_json FROM monthly_reports WHERE budget_id = ? ORDER BY month DESC, version DESC LIMIT ? OFFSET ?",
        [budgetId, limit, offset]
      )
      .map((row) => JSON.parse(row.report_json) as SavedReport);
  }
  nextVersion(budgetId: string, month: string): number {
    return (
      (this.db.queryOne<{ version: number }>(
        'SELECT COALESCE(MAX(version), 0) AS version FROM monthly_reports WHERE budget_id = ? AND month = ?',
        [budgetId, month]
      )?.version ?? 0) + 1
    );
  }
  save(report: SavedReport, key: string, request: string): void {
    this.db.execute(
      'INSERT INTO monthly_reports (id,budget_id,month,version,request_key,request_json,report_json) VALUES (?,?,?,?,?,?,?)',
      [
        report.id,
        report.budgetId,
        report.month,
        report.version,
        key,
        request,
        JSON.stringify(report),
      ]
    );
  }
}
