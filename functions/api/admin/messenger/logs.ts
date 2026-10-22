// GET /api/admin/messenger/logs?level=error — latest integration log entries.
import type { Ctx } from "../../../../backend/lib/types";
import { json } from "../../../../backend/lib/http";

export const onRequestGet = async ({ env, request }: Ctx) => {
  const level = new URL(request.url).searchParams.get("level");
  const stmt = ["info", "warn", "error"].includes(level ?? "")
    ? env.DB.prepare("SELECT * FROM app_logs WHERE level = ? ORDER BY id DESC LIMIT 200").bind(level)
    : env.DB.prepare("SELECT * FROM app_logs ORDER BY id DESC LIMIT 200");
  return json({ ok: true, logs: (await stmt.all()).results });
};
