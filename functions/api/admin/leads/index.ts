// GET /api/admin/leads?status=&form=&q=&sort=&page=&due=
import type { Ctx } from "../../../../backend/lib/types";
import { json } from "../../../../backend/lib/http";
import { leadFilters, sortSql } from "../../../../backend/lib/query";

const PAGE_SIZE = 25;
const COLS = "id, created_at, form, status, priority, name, email, phone, business, website, page_path, utm_source, country, value_estimate, next_follow_up, spam_score";

export const onRequestGet = async ({ request, env }: Ctx) => {
  const url = new URL(request.url);
  const page = Math.max(1, Math.min(1000, Number(url.searchParams.get("page")) || 1));
  const { where, args } = leadFilters(url);
  const [rows, count] = await env.DB.batch([
    env.DB.prepare(`SELECT ${COLS} FROM leads ${where} ORDER BY ${sortSql(url.searchParams.get("sort"))} LIMIT ? OFFSET ?`).bind(
      ...args,
      PAGE_SIZE,
      (page - 1) * PAGE_SIZE,
    ),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM leads ${where}`).bind(...args),
  ]);
  const total = (count.results[0] as { n: number })?.n ?? 0;
  return json({ ok: true, leads: rows.results, page, pageSize: PAGE_SIZE, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
};
