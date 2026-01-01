module.exports = {
  async up(knex) {
    const hasSnapshot = await knex.schema.hasTable('payee_merge_payee_snapshot');
    if (!hasSnapshot) {
      await knex.schema.createTable('payee_merge_payee_snapshot', (table) => {
        table.text('budget_id').notNullable();
        table.text('payee_id').notNullable();
        table.text('payee_name').notNullable();
        table.text('created_at').notNullable().defaultTo(knex.raw("datetime('now')"));
        table.primary(['budget_id', 'payee_id']);
      });

      await knex.schema.alterTable('payee_merge_payee_snapshot', (table) => {
        table.index(['budget_id']);
      });
    }
  },

  async down(knex) {
    await knex.schema.dropTableIfExists('payee_merge_payee_snapshot');
  },
};
