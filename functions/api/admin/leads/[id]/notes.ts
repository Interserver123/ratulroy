// POST /api/admin/leads/:id/notes  { body }
import type { Ctx } from "../../../../../backend/lib/types";
import { fail, json, nowIso, readJson, str, uuid } from "../../../../../backend/lib/http";

export const onRequestPost = async ({ request, env, params, data }: Ctx<"id">) => {
  if (!/^[0-9a-f-]{36}$/.test(params.id)) return fail(404, "Not found");
  const body = await readJson<{ body?: string }>(request, 8192);
  const text = str(body?.body, 4000);
  if (!text) return fail(422, "Write a note first");
  const exists = await env.DB.prepare("SELECT 1 AS x FROM leads WHERE id = ?").bind(params.id).first();
  if (!exists) return fail(404, "Not found");

  const now = nowIso();
  const id = uuid();
  const author = data.user!.name || data.user!.email;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO lead_notes (id, lead_id, created_at, author, body) VALUES (?, ?, ?, ?, ?)").bind(id, params.id, now, author, text),
    env.DB.prepare("INSERT INTO lead_events (id, lead_id, created_at, actor, type, data) VALUES (?, ?, ?, ?, 'note', '{}')").bind(
      uuid(),
      params.id,
      now,
      data.user!.email,
    ),
    env.DB.prepare("UPDATE leads SET updated_at = ? WHERE id = ?").bind(now, params.id),
  ]);
  return json({ ok: true, note: { id, created_at: now, author, body: text } }, 201);
};
