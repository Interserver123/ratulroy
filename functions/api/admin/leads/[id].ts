// GET / PATCH / DELETE /api/admin/leads/:id
import type { Ctx } from "../../../../backend/lib/types";
import { fail, json, nowIso, readJson, str, uuid } from "../../../../backend/lib/http";
import { PRIORITIES, STATUSES } from "../../../../backend/lib/leads";

const validId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

export const onRequestGet = async ({ env, params }: Ctx<"id">) => {
  if (!validId(params.id)) return fail(404, "Not found");
  const [lead, notes, events] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(params.id),
    env.DB.prepare("SELECT id, created_at, author, body FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC").bind(params.id),
    env.DB.prepare("SELECT id, created_at, actor, type, data FROM lead_events WHERE lead_id = ? ORDER BY created_at DESC LIMIT 100").bind(params.id),
  ]);
  const row = lead.results[0] as Record<string, unknown> | undefined;
  if (!row) return fail(404, "Not found");
  delete row.ip_hash;
  return json({ ok: true, lead: row, notes: notes.results, events: events.results });
};

export const onRequestPatch = async ({ request, env, params, data }: Ctx<"id">) => {
  if (!validId(params.id)) return fail(404, "Not found");
  const body = await readJson(request, 4096);
  if (!body) return fail(400, "Invalid request");

  const current = await env.DB.prepare("SELECT status FROM leads WHERE id = ?").bind(params.id).first<{ status: string }>();
  if (!current) return fail(404, "Not found");

  const sets: string[] = [];
  const args: unknown[] = [];
  const changed: Record<string, unknown> = {};
  const set = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    args.push(v);
    changed[col] = v;
  };

  if ("status" in body) {
    if (!STATUSES.includes(body.status as never)) return fail(422, "Invalid status");
    set("status", body.status);
  }
  if ("priority" in body) {
    if (!PRIORITIES.includes(body.priority as never)) return fail(422, "Invalid priority");
    set("priority", body.priority);
  }
  if ("value_estimate" in body) {
    const v = body.value_estimate === null || body.value_estimate === "" ? null : Math.round(Number(body.value_estimate));
    if (v !== null && (!Number.isFinite(v) || v < 0 || v > 1e10)) return fail(422, "Invalid value");
    set("value_estimate", v);
  }
  if ("next_follow_up" in body) {
    const d = body.next_follow_up ? String(body.next_follow_up) : null;
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return fail(422, "Invalid date");
    set("next_follow_up", d);
  }
  if ("lost_reason" in body) set("lost_reason", str(body.lost_reason, 300));
  if ("tags" in body) {
    if (!Array.isArray(body.tags)) return fail(422, "Invalid tags");
    const tags = [...new Set(body.tags.map((t) => str(t, 30)).filter(Boolean))].slice(0, 12);
    set("tags", JSON.stringify(tags));
  }
  if (!sets.length) return fail(400, "Nothing to update");

  const now = nowIso();
  const actor = data.user!.email;
  const statusChanged = "status" in changed && changed.status !== current.status;
  await env.DB.batch([
    env.DB.prepare(`UPDATE leads SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`).bind(...args, now, params.id),
    env.DB.prepare("INSERT INTO lead_events (id, lead_id, created_at, actor, type, data) VALUES (?, ?, ?, ?, ?, ?)").bind(
      uuid(),
      params.id,
      now,
      actor,
      statusChanged ? "status" : "update",
      JSON.stringify(statusChanged ? { from: current.status, to: changed.status } : changed),
    ),
  ]);
  return json({ ok: true });
};

export const onRequestDelete = async ({ env, params, data }: Ctx<"id">) => {
  if (data.user!.role !== "owner") return fail(403, "Only the owner can delete leads");
  if (!validId(params.id)) return fail(404, "Not found");
  const res = await env.DB.prepare("DELETE FROM leads WHERE id = ?").bind(params.id).run();
  if (!res.meta.changes) return fail(404, "Not found");
  return json({ ok: true });
};
