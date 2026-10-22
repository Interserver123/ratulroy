// Scheduled knowledge-base refresh, called by .github/workflows/kb-refresh.yml.
// POST with "Authorization: Bearer <CRON_SECRET>". Each call crawls one batch and
// reports progress; the workflow calls again until status is no longer "running".
import type { Ctx } from "../../../backend/lib/types";
import { fail, json } from "../../../backend/lib/http";
import { safeEqual } from "../../../backend/lib/crypto";
import { runningScan, startScan, stepScan } from "../../../backend/lib/messenger/kb";
import { log, pruneLogs } from "../../../backend/lib/messenger/log";

export const onRequestPost = async ({ request, env }: Ctx) => {
  const auth = request.headers.get("Authorization") ?? "";
  if (!env.CRON_SECRET || !safeEqual(auth, `Bearer ${env.CRON_SECRET}`)) return fail(401, "Unauthorized");
  const origin = new URL(request.url).origin;
  try {
    let scan = await runningScan(env);
    if (!scan) {
      await pruneLogs(env);
      scan = await startScan(env, origin, "schedule");
    }
    scan = await stepScan(env, origin, scan);
    return json({ ok: true, status: scan.status, done: scan.cursor, total: JSON.parse(scan.urls).length, chunks: scan.chunks, error: scan.error });
  } catch (e) {
    await log(env, "error", "kb", "Scheduled scan failed", { error: (e as Error).message });
    return fail(500, (e as Error).message);
  }
};
