const path = require('path');

const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'data', 'audit.db');

module.exports = {
  client: 'better-sqlite3',
  connection: {
    filename: dbPath,
  },
  migrations: {
    directory: path.join(process.cwd(), 'src', 'infra', 'db', 'migrations'),
    extension: 'cjs',
  },
  useNullAsDefault: true,
};
