module.exports = {
  async up(knex) {
    const hasConfig = await knex.schema.hasTable('app_config');
    if (!hasConfig) {
      await knex.schema.createTable('app_config', (table) => {
        table.text('key').primary();
        table.text('value').notNullable();
        table.text('updated_at').notNullable().defaultTo(knex.raw("datetime('now')"));
      });
    }
  },

  async down(knex) {
    await knex.schema.dropTableIfExists('app_config');
  },
};
