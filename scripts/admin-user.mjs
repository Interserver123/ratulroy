#!/usr/bin/env node
// Prints SQL that creates (or resets) an admin user for the leads dashboard.
//   node scripts/admin-user.mjs you@example.com 'long-password' ["Your Name"] [owner|editor] > admin.sql
//   npx wrangler d1 execute ratulroy-leads --remote --file admin.sql -c wrangler.backend.toml
// The password is hashed here (PBKDF2-SHA256, same format the API verifies); it never leaves your machine.
import { webcrypto as crypto } from "node:crypto";

const [email, password, name = "Ratul Roy", role = "owner"] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: node scripts/admin-user.mjs <email> <password> [name] [owner|editor]");
  process.exit(1);
}
if (password.length < 12) {
  console.error("Use a password of at least 12 characters.");
  process.exit(1);
}
if (!["owner", "editor"].includes(role)) {
  console.error("Role must be owner or editor.");
  process.exit(1);
}

const hex = (b) => Buffer.from(b).toString("hex");
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
const hash = `pbkdf2-sha256$100000$${hex(salt)}$${hex(bits)}`;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

console.log(
  `INSERT INTO admin_users (id, email, name, password_hash, role, created_at) VALUES (${q(crypto.randomUUID())}, ${q(email.toLowerCase())}, ${q(name)}, ${q(hash)}, ${q(role)}, ${q(new Date().toISOString())})\n` +
    `ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, name = excluded.name, role = excluded.role;`,
);
