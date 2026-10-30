module.exports = {
  async up(knex) {
    await knex.schema.createTable('monthly_reports', table => {
      table.text('id').primary();
      table.text('budget_id').notNullable();
      table.text('month').notNullable();
      table.integer('version').notNullable();
      table.text('request_key').notNullable();
      table.text('request_json').notNullable();
      table.text('report_json').notNullable();
      table.unique(['budget_id', 'month', 'version']);
      table.unique(['budget_id', 'request_key']);
    });
  },
  async down(knex) { await knex.schema.dropTableIfExists('monthly_reports'); },
};
