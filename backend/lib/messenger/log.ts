// Integration log (admin > Messenger > Activity log). Never throws.
import type { Env } from "../types";
import { nowIso } from "../http";

export type Level = "info" | "warn" | "error";

export async function log(env: Env, level: Level, scope: string, message: string, data?: unknown) {
  try {
    const text = data === undefined ? null : JSON.stringify(data, (_k, v) => (typeof v === "string" && v.length > 2000 ? v.slice(0, 2000) + "…" : v));
    await env.DB.prepare("INSERT INTO app_logs (created_at, level, scope, message, data) VALUES (?, ?, ?, ?, ?)")
      .bind(nowIso(), level, scope.slice(0, 40), message.slice(0, 500), text)
      .run();
  } catch (e) {
    console.error("log failed", e);
  }
  if (level === "error") console.error(`[${scope}] ${message}`);
}

export async function pruneLogs(env: Env, days = 30) {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM app_logs WHERE created_at < ?").bind(cutoff),
    env.DB.prepare("DELETE FROM mc_events WHERE received_at < ?").bind(new Date(Date.now() - 7 * 86400_000).toISOString()),
  ]);
}
