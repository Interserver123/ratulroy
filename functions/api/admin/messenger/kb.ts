// GET  /api/admin/messenger/kb?q=…  — index stats, recent scans, optional test search
// POST /api/admin/messenger/kb {action:"start"|"step"} — manual rescan, one batch per call
import type { Ctx } from "../../../../backend/lib/types";
import { fail, json, readJson } from "../../../../backend/lib/http";
import { kbStats, runningScan, search, startScan, stepScan } from "../../../../backend/lib/messenger/kb";
import { log } from "../../../../backend/lib/messenger/log";

export const onRequestGet = async ({ env, request }: Ctx) => {
  const q = new URL(request.url).searchParams.get("q")?.slice(0, 200);
  const hits = q ? (await search(env, q, 8)).map((h) => ({ ...h, content: h.content.slice(0, 400) })) : undefined;
  return json({ ok: true, ...(await kbStats(env)), hits });
};

export const onRequestPost = async ({ env, request }: Ctx) => {
  const body = await readJson<{ action?: string }>(request, 1024);
  const origin = new URL(request.url).origin;
  try {
    let scan = await runningScan(env);
    if (body?.action === "start") scan = scan ?? (await startScan(env, origin, "manual"));
    else if (body?.action === "step") {
      if (!scan) return fail(409, "No scan is running");
      scan = await stepScan(env, origin, scan);
    } else return fail(400, "Unknown action");
    return json({ ok: true, scan: { id: scan.id, status: scan.status, done: scan.cursor, total: JSON.parse(scan.urls).length, chunks: scan.chunks, failed: scan.pages_failed, error: scan.error } });
  } catch (e) {
    await log(env, "error", "kb", "Manual scan failed", { error: (e as Error).message });
    return fail(500, `Scan failed: ${(e as Error).message}`);
  }
};
