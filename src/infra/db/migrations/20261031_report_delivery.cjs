module.exports = {
  async up(knex) {
    await knex.schema.createTable('report_delivery', table => {
      table.text('report_id').primary();
      table.text('status').notNullable();
      table.text('updated_at').notNullable();
    });
  },
  async down(knex) { await knex.schema.dropTableIfExists('report_delivery'); },
};
