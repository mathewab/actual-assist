module.exports = {
  async up(knex) {
    const hasJobs = await knex.schema.hasTable('jobs');
    if (!hasJobs) {
      await knex.schema.createTable('jobs', (table) => {
        table.text('id').primary();
        table.text('budget_id').notNullable();
        table.text('type').notNullable();
        table.text('status').notNullable();
        table.text('created_at').notNullable().defaultTo(knex.raw("datetime('now')"));
        table.text('started_at');
        table.text('completed_at');
        table.text('failure_reason');
        table.text('parent_job_id');
        table.text('metadata');
      });
      await knex.schema.alterTable('jobs', (table) => {
        table.index(['budget_id']);
        table.index(['status']);
        table.index(['type']);
      });
    }

    const hasJobSteps = await knex.schema.hasTable('job_steps');
    if (!hasJobSteps) {
      await knex.schema.createTable('job_steps', (table) => {
        table.text('id').primary();
        table.text('job_id').notNullable();
        table.text('step_type').notNullable();
        table.text('status').notNullable();
        table.integer('position').notNullable();
        table.text('created_at').notNullable().defaultTo(knex.raw("datetime('now')"));
        table.text('started_at');
        table.text('completed_at');
        table.text('failure_reason');
        table.unique(['job_id', 'position']);
      });
      await knex.schema.alterTable('job_steps', (table) => {
        table.index(['job_id']);
        table.index(['status']);
      });
    }

    const hasJobEvents = await knex.schema.hasTable('job_events');
    if (!hasJobEvents) {
      await knex.schema.createTable('job_events', (table) => {
        table.text('id').primary();
        table.text('job_id').notNullable();
        table.text('job_step_id');
        table.text('status').notNullable();
        table.text('message');
        table.text('created_at').notNullable().defaultTo(knex.raw("datetime('now')"));
      });
      await knex.schema.alterTable('job_events', (table) => {
        table.index(['job_id']);
        table.index(['job_step_id']);
      });
    }
  },

  async down(knex) {
    await knex.schema.dropTableIfExists('job_events');
    await knex.schema.dropTableIfExists('job_steps');
    await knex.schema.dropTableIfExists('jobs');
  },
};
