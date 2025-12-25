module.exports = {
  async up(knex) {
    const result = await knex.raw("PRAGMA table_info('suggestions')");
    const rows = Array.isArray(result) ? result : result?.[0] || result?.rows || [];
    const hasColumn = rows.some((row) => row.name === 'suggested_payee_name');

    if (!hasColumn) {
      await knex.raw('ALTER TABLE suggestions ADD COLUMN suggested_payee_name TEXT');
    }
  },

  async down() {},
};
