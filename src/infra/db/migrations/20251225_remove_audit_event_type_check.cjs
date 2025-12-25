module.exports = {
  async up(knex) {
    const row = await knex('sqlite_master')
      .select('sql')
      .where({ type: 'table', name: 'audit_log' })
      .first();
    const schemaSql = row?.sql || '';

    if (!schemaSql || !schemaSql.includes('CHECK(event_type')) {
      return;
    }

    await knex.raw('ALTER TABLE audit_log RENAME TO audit_log_old');

    await knex.raw(`
      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        metadata TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await knex.raw(`
      INSERT INTO audit_log (id, event_type, entity_type, entity_id, metadata, timestamp)
      SELECT id, event_type, entity_type, entity_id, metadata, timestamp
      FROM audit_log_old
    `);

    await knex.raw('DROP TABLE audit_log_old');

    await knex.raw(
      'CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id)'
    );
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC)');
  },

  async down() {},
};
