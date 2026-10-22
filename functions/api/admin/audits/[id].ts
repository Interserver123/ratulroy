// PATCH /api/admin/audits/:id {stage?, report_url?} : move an audit request along.
// Marking it "sent" also moves a still-new lead to "contacted" and logs the event.
import type { Ctx } from "../../../../backend/lib/types";
import { fail, json, nowIso, readJson, str, uuid } from "../../../../backend/lib/http";

const STAGES = ["todo", "in_progress", "sent"] as const;

export const onRequestPatch = async ({ env, request, params, data }: Ctx<"id">) => {
  if (!/^[0-9a-f-]{36}$/.test(params.id)) return fail(404, "Not found");
  const body = await readJson<{ stage?: string; report_url?: string | null }>(request, 4096);
  if (!body) return fail(400, "Invalid request");
  const lead = await env.DB.prepare("SELECT id, status FROM leads WHERE id = ? AND form = 'audit'").bind(params.id).first<{ id: string; status: string }>();
  if (!lead) return fail(404, "Audit request not found");

  const cur = await env.DB.prepare("SELECT stage, report_url, sent_at FROM audit_requests WHERE lead_id = ?").bind(params.id).first<{ stage: string; report_url: string | null; sent_at: string | null }>();
  const stage = body.stage === undefined ? (cur?.stage ?? "todo") : body.stage;
  if (!STAGES.includes(stage as never)) return fail(422, "Invalid stage");
  let reportUrl = cur?.report_url ?? null;
  if ("report_url" in body) {
    reportUrl = str(body.report_url, 500);
    if (reportUrl && !/^https?:\/\//i.test(reportUrl)) return fail(422, "Report link must start with https://");
  }
  const now = nowIso();
  const sentAt = stage === "sent" ? (cur?.sent_at ?? now) : null;
  const who = data.user?.email ?? "admin";

  const stmts = [
    env.DB.prepare(
      `INSERT INTO audit_requests (lead_id, stage, report_url, sent_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(lead_id) DO UPDATE SET stage = excluded.stage, report_url = excluded.report_url, sent_at = excluded.sent_at, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    ).bind(params.id, stage, reportUrl, sentAt, now, who),
  ];
  if (stage !== (cur?.stage ?? "todo"))
    stmts.push(env.DB.prepare("INSERT INTO lead_events (id, lead_id, created_at, actor, type, data) VALUES (?, ?, ?, ?, 'update', ?)").bind(uuid(), params.id, now, who, JSON.stringify({ audit: stage })));
  if (stage === "sent" && lead.status === "new") {
    stmts.push(env.DB.prepare("UPDATE leads SET status = 'contacted', updated_at = ? WHERE id = ?").bind(now, params.id));
    stmts.push(env.DB.prepare("INSERT INTO lead_events (id, lead_id, created_at, actor, type, data) VALUES (?, ?, ?, ?, 'status', ?)").bind(uuid(), params.id, now, who, JSON.stringify({ from: "new", to: "contacted" })));
  }
  await env.DB.batch(stmts);
  return json({ ok: true, stage, report_url: reportUrl, sent_at: sentAt });
};
