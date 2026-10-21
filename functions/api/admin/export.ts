// GET /api/admin/export?status=&form=&q=  -> CSV download (same filters as the list).
import type { Ctx } from "../../../backend/lib/types";
import { baseHeaders } from "../../../backend/lib/http";
import { leadFilters } from "../../../backend/lib/query";

const COLS = [
  "created_at", "form", "status", "priority", "name", "email", "phone", "business", "website", "service_area", "goal",
  "preferred_time", "message", "page_path", "referrer", "utm_source", "utm_medium", "utm_campaign", "country", "city",
  "value_estimate", "next_follow_up", "lost_reason", "tags",
];

// Quote every cell; neutralise spreadsheet formula injection (=, +, -, @ at the start).
const cell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export const onRequestGet = async ({ request, env }: Ctx) => {
  const { where, args } = leadFilters(new URL(request.url));
  const rows = await env.DB.prepare(`SELECT ${COLS.join(", ")} FROM leads ${where} ORDER BY created_at DESC LIMIT 10000`)
    .bind(...args)
    .all<Record<string, unknown>>();
  const csv = [COLS.join(","), ...rows.results.map((r) => COLS.map((c) => cell(r[c])).join(","))].join("\r\n");
  return new Response("﻿" + csv, {
    headers: {
      ...baseHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
};
