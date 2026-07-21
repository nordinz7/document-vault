import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import db from "./index.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

export function migrate(): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = new Set(
    (db.query("SELECT name FROM _migrations").all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    db.transaction(() => {
      db.run(sql);
      db.query("INSERT INTO _migrations (name) VALUES ($name)").run({ name: file });
    })();
    console.error(`migrated: ${file}`);
  }
}
