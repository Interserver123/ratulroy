// GET /api/admin/audits?stage=todo|in_progress|sent|all&q= : free-audit requests with
// their progress and the 48-hour reply deadline promised on the website.
import type { Ctx } from "../../../../backend/lib/types";
import { json } from "../../../../backend/lib/http";

export const AUDIT_HOURS = 48;

export const onRequestGet = async ({ env, request }: Ctx) => {
  const u = new URL(request.url);
  const stage = u.searchParams.get("stage") ?? "open";
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 100);
  const stageSql = "COALESCE(a.stage, 'todo')";
  const where = ["l.form = 'audit'", "l.status != 'spam'"];
  const args: unknown[] = [];
  if (stage === "open") where.push(`${stageSql} != 'sent'`);
  else if (["todo", "in_progress", "sent"].includes(stage)) {
    where.push(`${stageSql} = ?`);
    args.push(stage);
  }
  if (q) {
    where.push("(l.email LIKE ? OR l.website LIKE ? OR l.name LIKE ? OR l.business LIKE ?)");
    args.push(...Array(4).fill(`%${q}%`));
  }
  const [rows, counts] = await env.DB.batch([
    env.DB.prepare(
      `SELECT l.id, l.created_at, l.status, l.name, l.email, l.phone, l.business, l.website, l.page_path, l.message,
              ${stageSql} AS stage, a.report_url, a.sent_at, a.updated_at AS stage_at,
              strftime('%Y-%m-%dT%H:%M:%fZ', l.created_at, '+${AUDIT_HOURS} hours') AS due_at
         FROM leads l LEFT JOIN audit_requests a ON a.lead_id = l.id
        WHERE ${where.join(" AND ")}
        ORDER BY CASE WHEN ${stageSql} = 'sent' THEN 1 ELSE 0 END, l.created_at ${stage === "sent" ? "DESC" : "ASC"}
        LIMIT 300`,
    ).bind(...args),
    env.DB.prepare(
      `SELECT ${stageSql} AS stage, COUNT(*) AS n,
              SUM(CASE WHEN ${stageSql} != 'sent' AND l.created_at < ? THEN 1 ELSE 0 END) AS overdue
         FROM leads l LEFT JOIN audit_requests a ON a.lead_id = l.id
        WHERE l.form = 'audit' AND l.status != 'spam' GROUP BY 1`,
    ).bind(new Date(Date.now() - AUDIT_HOURS * 3600_000).toISOString()),
  ]);
  const c = { todo: 0, in_progress: 0, sent: 0, overdue: 0 };
  for (const r of counts.results as { stage: keyof typeof c; n: number; overdue: number }[]) {
    c[r.stage] = r.n;
    c.overdue += r.overdue ?? 0;
  }
  return json({ ok: true, hours: AUDIT_HOURS, counts: c, audits: rows.results });
};
