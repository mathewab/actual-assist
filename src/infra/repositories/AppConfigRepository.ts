import type { DatabaseAdapter } from '../DatabaseAdapter.js';

export class AppConfigRepository {
  constructor(private db: DatabaseAdapter) {}

  get(key: string): string | null {
    const row = this.db.queryOne<{ value: string }>('SELECT value FROM app_config WHERE key = ?', [
      key,
    ]);
    if (!row?.value) return null;
    const trimmed = row.value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  set(key: string, value: string): void {
    this.db.execute(
      `
      INSERT INTO app_config (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `,
      [key, value, new Date().toISOString()]
    );
  }

  getLlmConfig(): { provider: string | null; model: string | null } {
    return {
      provider: this.get('llm_provider'),
      model: this.get('llm_model'),
    };
  }

  setLlmConfig(provider: string, model: string | null): void {
    this.set('llm_provider', provider);
    this.set('llm_model', model ?? '');
  }

  getProviderBaseUrl(provider: string): string | null {
    return this.get(`llm_base_url_${provider}`);
  }

  setProviderBaseUrl(provider: string, baseUrl: string | null): void {
    this.set(`llm_base_url_${provider}`, baseUrl ?? '');
  }
}
