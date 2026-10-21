// GET /api/admin/stats: KPIs and breakdowns for the dashboard.
import type { Ctx } from "../../../backend/lib/types";
import { json } from "../../../backend/lib/http";

export const onRequestGet = async ({ env }: Ctx) => {
  const DB = env.DB;
  const d30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const d7 = new Date(Date.now() - 7 * 86400_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const [totals, byStatus, byForm, bySource, perDay, topPages, due] = await DB.batch([
    DB.prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS week,
        SUM(CASE WHEN status IN ('contacted','qualified','proposal') THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS won,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS fresh,
        SUM(CASE WHEN status = 'won' THEN COALESCE(value_estimate,0) ELSE 0 END) AS won_value,
        SUM(CASE WHEN status IN ('qualified','proposal') THEN COALESCE(value_estimate,0) ELSE 0 END) AS pipeline_value
       FROM leads WHERE status != 'spam'`,
    ).bind(d7),
    DB.prepare("SELECT status AS k, COUNT(*) AS n FROM leads GROUP BY status"),
    DB.prepare("SELECT form AS k, COUNT(*) AS n FROM leads WHERE status != 'spam' GROUP BY form ORDER BY n DESC"),
    DB.prepare(
      `SELECT COALESCE(utm_source,
         CASE WHEN referrer IS NULL OR referrer = '' THEN 'direct'
              WHEN referrer LIKE '%google.%' THEN 'google'
              WHEN referrer LIKE '%bing.%' THEN 'bing'
              WHEN referrer LIKE '%facebook.%' OR referrer LIKE '%fb.%' THEN 'facebook'
              WHEN referrer LIKE '%chatgpt.%' OR referrer LIKE '%openai.%' OR referrer LIKE '%perplexity.%' THEN 'ai assistant'
              ELSE 'other referral' END) AS k, COUNT(*) AS n
       FROM leads WHERE status != 'spam' GROUP BY k ORDER BY n DESC LIMIT 8`,
    ),
    DB.prepare("SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM leads WHERE status != 'spam' AND created_at > ? GROUP BY d ORDER BY d").bind(d30),
    DB.prepare("SELECT page_path AS k, COUNT(*) AS n FROM leads WHERE status != 'spam' AND page_path IS NOT NULL GROUP BY page_path ORDER BY n DESC LIMIT 8"),
    DB.prepare(
      "SELECT COUNT(*) AS n FROM leads WHERE next_follow_up IS NOT NULL AND next_follow_up <= ? AND status NOT IN ('won','lost','spam')",
    ).bind(today),
  ]);

  return json({
    ok: true,
    totals: { ...(totals.results[0] ?? {}), followUpsDue: (due.results[0] as { n: number })?.n ?? 0 },
    byStatus: byStatus.results,
    byForm: byForm.results,
    bySource: bySource.results,
    perDay: perDay.results,
    topPages: topPages.results,
  });
};
