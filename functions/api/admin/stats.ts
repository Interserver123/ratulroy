// GET /api/admin/stats?days=7|30|90 : KPIs, period comparison and breakdowns for the dashboard.
import type { Ctx } from "../../../backend/lib/types";
import { json } from "../../../backend/lib/http";

const SOURCE_SQL = `COALESCE(NULLIF(utm_source,''),
  CASE WHEN referrer IS NULL OR referrer = '' THEN 'direct'
       WHEN referrer LIKE '%google.%' THEN 'google'
       WHEN referrer LIKE '%bing.%' THEN 'bing'
       WHEN referrer LIKE '%facebook.%' OR referrer LIKE '%fb.%' OR referrer LIKE '%instagram.%' THEN 'facebook'
       WHEN referrer LIKE '%chatgpt.%' OR referrer LIKE '%openai.%' OR referrer LIKE '%perplexity.%' OR referrer LIKE '%gemini.%' THEN 'ai assistant'
       ELSE 'other referral' END)`;

export const onRequestGet = async ({ request, env }: Ctx) => {
  const DB = env.DB;
  const days = [7, 30, 90].includes(Number(new URL(request.url).searchParams.get("days")))
    ? Number(new URL(request.url).searchParams.get("days"))
    : 30;
  const now = Date.now();
  const from = new Date(now - days * 86400_000).toISOString();
  const prevFrom = new Date(now - 2 * days * 86400_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const [totals, period, byStatus, byForm, bySource, perDay, topPages, due] = await DB.batch([
    DB.prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS fresh,
        SUM(CASE WHEN status IN ('contacted','qualified','proposal') THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS won,
        SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) AS lost,
        SUM(CASE WHEN status = 'won' THEN COALESCE(value_estimate,0) ELSE 0 END) AS won_value,
        SUM(CASE WHEN status IN ('qualified','proposal') THEN COALESCE(value_estimate,0) ELSE 0 END) AS pipeline_value
       FROM leads WHERE status != 'spam'`,
    ),
    DB.prepare(
      `SELECT SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS current,
              SUM(CASE WHEN created_at <= ? AND created_at > ? THEN 1 ELSE 0 END) AS previous,
              SUM(CASE WHEN created_at > ? AND status NOT IN ('new','spam') THEN 1 ELSE 0 END) AS worked
       FROM leads WHERE status != 'spam'`,
    ).bind(from, from, prevFrom, from),
    DB.prepare("SELECT status AS k, COUNT(*) AS n FROM leads GROUP BY status"),
    DB.prepare("SELECT form AS k, COUNT(*) AS n FROM leads WHERE status != 'spam' AND created_at > ? GROUP BY form ORDER BY n DESC").bind(from),
    DB.prepare(`SELECT ${SOURCE_SQL} AS k, COUNT(*) AS n FROM leads WHERE status != 'spam' AND created_at > ? GROUP BY k ORDER BY n DESC LIMIT 8`).bind(from),
    DB.prepare(
      `SELECT substr(created_at,1,10) AS d, COUNT(*) AS n,
              SUM(CASE WHEN status NOT IN ('new','spam') THEN 1 ELSE 0 END) AS worked
       FROM leads WHERE status != 'spam' AND created_at > ? GROUP BY d ORDER BY d`,
    ).bind(from),
    DB.prepare(
      "SELECT page_path AS k, COUNT(*) AS n FROM leads WHERE status != 'spam' AND page_path IS NOT NULL AND created_at > ? GROUP BY page_path ORDER BY n DESC LIMIT 6",
    ).bind(from),
    DB.prepare("SELECT COUNT(*) AS n FROM leads WHERE next_follow_up IS NOT NULL AND next_follow_up <= ? AND status NOT IN ('won','lost','spam')").bind(today),
  ]);

  return json({
    ok: true,
    days,
    totals: { ...(totals.results[0] ?? {}), followUpsDue: (due.results[0] as { n: number })?.n ?? 0 },
    period: period.results[0] ?? { current: 0, previous: 0, worked: 0 },
    byStatus: byStatus.results,
    byForm: byForm.results,
    bySource: bySource.results,
    perDay: perDay.results,
    topPages: topPages.results,
  });
};
