import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// .env is optional (CI passes DATABASE_URL directly).
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  /* no .env file — rely on the environment */
}

export const MIGRATIONS_DIR = path.join(root, "db", "migrations");

export function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (put it in .env or the environment).");
    process.exit(1);
  }
  return new pg.Client({ connectionString: url });
}

export function readMigration(file) {
  return readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
}
