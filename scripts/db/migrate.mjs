import { readdirSync } from "node:fs";
import { connect, readMigration, MIGRATIONS_DIR } from "./client.mjs";

const client = connect();
await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const applied = new Set(
    (await client.query("SELECT filename FROM schema_migrations")).rows.map((r) => r.filename)
  );
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip   ${file}`);
      continue;
    }
    console.log(`apply  ${file}`);
    await client.query("BEGIN");
    try {
      await client.query(readMigration(file));
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`FAILED ${file}: ${err.message}`);
      process.exit(1);
    }
  }
  console.log("migrations up to date");
} finally {
  await client.end();
}
