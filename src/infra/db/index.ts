import { Database } from "bun:sqlite";
import { join } from "node:path";

// Anchor the DB file to the project root (this file lives at src/infra/db/) so
// it resolves the same way no matter the working directory. When launched as an
// MCP server, cwd is set by the client, not the project root — a relative path
// would fail to open with SQLITE_CANTOPEN. Mirrors migrate.ts's import.meta.dir.
//
// `DB_PATH` overrides it verbatim (no anchoring, so ":memory:" works) — tests
// set it to an isolated file or ":memory:" so they never touch the dev DB.
const DB_PATH =
  process.env.DB_PATH || join(import.meta.dir, "../../..", "mydb.sqlite");

const isMemory = DB_PATH === ":memory:" || DB_PATH === "";

const db = new Database(DB_PATH, { create: true, strict: true });

// WAL is a no-op for an in-memory DB (journal_mode stays "memory").
if (!isMemory) db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA foreign_keys = ON;");

export default db;
