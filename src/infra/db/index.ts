import { Database } from "bun:sqlite";

const db = new Database("mydb.sqlite", { create: true, strict: true });

db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA foreign_keys = ON;");

export default db;
