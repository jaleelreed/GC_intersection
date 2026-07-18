// One-command dev reset (US-004): drop everything, re-migrate, re-seed.
// Refuses to run against anything that does not look like a dev/test database.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { connect } from "./client.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

if (process.env.DB_RESET_ALLOW_PROD !== "1") {
  const url = process.env.DATABASE_URL ?? "";
  const looksSafe = /localhost|127\.0\.0\.1|\bdev\b|\btest\b|neon\.tech/.test(url);
  if (!looksSafe) {
    console.error(
      "db:reset refused: DATABASE_URL does not look like a dev database. Set DB_RESET_ALLOW_PROD=1 to override."
    );
    process.exit(1);
  }
}

const client = connect();
await client.connect();
try {
  console.log("dropping schema public");
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
} finally {
  await client.end();
}

execFileSync(process.execPath, [path.join(here, "migrate.mjs")], { stdio: "inherit" });
execFileSync(process.execPath, [path.join(here, "seed.mjs")], { stdio: "inherit" });
console.log("reset complete");
