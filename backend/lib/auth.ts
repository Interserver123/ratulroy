import type { AdminUser, Env } from "./types";
import { randomToken, sha256 } from "./crypto";
import { nowIso, uuid } from "./http";

export const COOKIE = "__Host-rr_session";
const SESSION_DAYS = 7;

export function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("Cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export const sessionCookie = (token: string, maxAge = SESSION_DAYS * 86400) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export async function createSession(env: Env, userId: string, ipHash: string, userAgent: string) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await env.DB.prepare(
    "INSERT INTO admin_sessions (id, user_id, token_hash, created_at, expires_at, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(uuid(), userId, await sha256(token), nowIso(), expires, ipHash, userAgent.slice(0, 200))
    .run();
  return token;
}

/** Returns the signed-in admin for this request, or null. Expired sessions are ignored. */
export async function getUser(request: Request, env: Env): Promise<AdminUser | null> {
  const token = readCookie(request, COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role FROM admin_sessions s
     JOIN admin_users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), nowIso())
    .first<AdminUser>();
  return row ?? null;
}

export async function destroySession(request: Request, env: Env) {
  const token = readCookie(request, COOKIE);
  if (token) await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}
