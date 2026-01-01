module.exports = {
  async up(knex) {
    const hasClusters = await knex.schema.hasTable('payee_merge_clusters');
    if (!hasClusters) {
      await knex.schema.createTable('payee_merge_clusters', (table) => {
        table.text('id').primary();
        table.text('cluster_id').notNullable();
        table.text('group_hash').notNullable();
        table.text('budget_id').notNullable();
        table.text('payee_id').notNullable();
        table.text('payee_name').notNullable();
        table.text('normalized_name').notNullable();
        table.text('token_set').notNullable();
        table.text('created_at').notNullable().defaultTo(knex.raw("datetime('now')"));
      });

      await knex.schema.alterTable('payee_merge_clusters', (table) => {
        table.index(['budget_id']);
        table.index(['cluster_id']);
      });
    } else {
      const hasGroupHash = await knex.schema.hasColumn('payee_merge_clusters', 'group_hash');
      if (!hasGroupHash) {
        await knex.schema.alterTable('payee_merge_clusters', (table) => {
          table.text('group_hash');
        });
        await knex.raw(`UPDATE payee_merge_clusters SET group_hash = '' WHERE group_hash IS NULL`);
      }
    }

    const hasMeta = await knex.schema.hasTable('payee_merge_cluster_meta');
    if (!hasMeta) {
      await knex.schema.createTable('payee_merge_cluster_meta', (table) => {
        table.text('budget_id').primary();
        table.text('payee_hash').notNullable();
        table.text('created_at').notNullable().defaultTo(knex.raw("datetime('now')"));
      });
    }

    const hasHidden = await knex.schema.hasTable('payee_merge_hidden_groups');
    if (!hasHidden) {
      await knex.schema.createTable('payee_merge_hidden_groups', (table) => {
        table.text('budget_id').notNullable();
        table.text('group_hash').notNullable();
        table.text('hidden_at').notNullable().defaultTo(knex.raw("datetime('now')"));
        table.primary(['budget_id', 'group_hash']);
      });
    }
  },

  async down(knex) {
    await knex.schema.dropTableIfExists('payee_merge_hidden_groups');
    await knex.schema.dropTableIfExists('payee_merge_cluster_meta');
    await knex.schema.dropTableIfExists('payee_merge_clusters');
  },
};
