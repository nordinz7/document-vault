import { Database } from "bun:sqlite";

/**
 * The database connection. This module is intentionally connection-only:
 * it does NOT create tables. Schema setup lives in ./migrate.ts and is run
 * explicitly at startup, so there is no import cycle between the connection
 * and the schema definitions.
 */
const db = new Database("mydb.sqlite", { create: true, strict: true });

db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA foreign_keys = ON;"); // SQLite disables FK enforcement by default.

export default db;
