// GET /api/admin/messenger/conversations?filter=all|human|unread
import type { Ctx } from "../../../../../backend/lib/types";
import { json } from "../../../../../backend/lib/http";

export const onRequestGet = async ({ env, request }: Ctx) => {
  const f = new URL(request.url).searchParams.get("filter");
  const where = f === "human" ? "WHERE mode = 'human' OR handoff_reason IS NOT NULL" : f === "unread" ? "WHERE unread > 0" : "";
  const { results } = await env.DB.prepare(
    `SELECT psid, name, mode, handoff_reason, last_user_at, last_message_at, last_preview, unread, lang FROM mc_conversations ${where} ORDER BY last_message_at DESC LIMIT 200`,
  ).all();
  return json({ ok: true, conversations: results });
};
