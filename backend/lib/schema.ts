// Creates the database tables on first use, so setup needs no command line.
// Mirrors migrations/0001_init.sql (keep both in sync when the schema changes).
import type { Env } from "./types";
// Wrangler bundles .sql files as text.
import sql from "../../migrations/0001_init.sql";

let ready = false;

export async function ensureSchema(env: Env) {
  if (ready) return;
  const exists = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'login_attempts'").first();
  if (!exists) {
    const statements = sql
      .replace(/--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s && !/^PRAGMA/i.test(s));
    await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
  }
  ready = true;
}
