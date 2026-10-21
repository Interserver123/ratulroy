#!/usr/bin/env node
// End-to-end test of the leads API against a running server (default: local `npm run backend:dev`).
//   BASE=http://127.0.0.1:8788 ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/backend-test.mjs
// Creates test leads, exercises every admin endpoint, then deletes what it created.
const BASE = process.env.BASE ?? "http://127.0.0.1:8788";
const EMAIL = process.env.ADMIN_EMAIL ?? "test@ratulroy.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "local-test-password-123";
let cookie = "";
let passed = 0;
const fails = [];

async function call(path, { method = "GET", body, origin = BASE, raw = false } = {}) {
  const headers = { Origin: origin };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const data = raw ? await res.text() : await res.json().catch(() => ({}));
  return { status: res.status, data, headers: res.headers };
}
function check(name, cond, info = "") {
  if (cond) passed++;
  else fails.push(`${name} ${info}`);
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : ` ${info}`}`);
}

const stamp = Date.now();
const lead = {
  type: "audit",
  name: "Test Lead",
  email: `lead-${stamp}@example.com`,
  website: "https://example.com",
  phone: "+8801700000000",
  page: "/local-seo-service",
  elapsed_ms: 9000,
  utm_source: "test",
};

// Public endpoint
let r = await call("/api/leads", { method: "POST", body: lead });
check("valid lead accepted (201)", r.status === 201, JSON.stringify(r.data));
check("API sends X-Robots-Tag noindex", /noindex/.test(r.headers.get("x-robots-tag") ?? ""));
check("API sends Cache-Control no-store", /no-store/.test(r.headers.get("cache-control") ?? ""));
r = await call("/api/leads", { method: "POST", body: { ...lead, email: "not-an-email" } });
check("invalid email rejected (422)", r.status === 422 && r.data.fields?.email, JSON.stringify(r.data));
r = await call("/api/leads", { method: "POST", body: { ...lead, website: "" } });
check("audit without website rejected (422)", r.status === 422);
r = await call("/api/leads", { method: "POST", body: lead, origin: "https://evil.example" });
check("cross-origin POST blocked (403)", r.status === 403);
r = await call("/api/leads", { method: "POST", body: { ...lead, email: `bot-${stamp}@example.com`, company_website: "http://spam", elapsed_ms: 300 } });
check("honeypot submission stored quietly (201)", r.status === 201);

// Auth
r = await call("/api/admin/leads");
check("admin API requires login (401)", r.status === 401);
r = await call("/api/admin/login", { method: "POST", body: { email: EMAIL, password: "wrong-password" } });
check("wrong password rejected (401)", r.status === 401);
r = await call("/api/admin/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
check("login succeeds", r.status === 200 && cookie.startsWith("__Host-rr_session="), JSON.stringify(r.data));
r = await call("/api/admin/me");
check("me returns user", r.data.user?.email === EMAIL);

// Data
r = await call(`/api/admin/leads?status=all&q=${stamp}`);
const mine = r.data.leads ?? [];
check("list finds both test leads", mine.length === 2, `found ${mine.length}`);
const real = mine.find((l) => l.email.startsWith("lead-"));
const bot = mine.find((l) => l.email.startsWith("bot-"));
check("honeypot lead marked spam", bot?.status === "spam" && bot.spam_score >= 60, JSON.stringify(bot));
check("real lead is new", real?.status === "new");
r = await call("/api/admin/leads?q=" + stamp);
check("default list hides spam", (r.data.leads ?? []).length === 1);

r = await call(`/api/admin/leads/${real.id}`);
check("detail has attribution + created event", r.data.lead?.utm_source === "test" && r.data.events?.[0]?.type === "created");
check("detail never exposes ip_hash", !("ip_hash" in (r.data.lead ?? {})));
r = await call(`/api/admin/leads/${real.id}`, { method: "PATCH", body: { status: "qualified", priority: "high", value_estimate: 49900, next_follow_up: "2026-01-01", tags: ["dental", "dhaka"] } });
check("patch ok", r.status === 200, JSON.stringify(r.data));
r = await call(`/api/admin/leads/${real.id}`, { method: "PATCH", body: { status: "bogus" } });
check("invalid status rejected (422)", r.status === 422);
r = await call(`/api/admin/leads/${real.id}/notes`, { method: "POST", body: { body: "Called, sending proposal <b>tomorrow</b>" } });
check("note added (201)", r.status === 201);
r = await call(`/api/admin/leads/${real.id}`);
check("status change + note in timeline", r.data.events?.some((e) => e.type === "status") && r.data.notes?.length === 1);
r = await call("/api/admin/leads?due=1&q=" + stamp);
check("follow-up due filter", (r.data.leads ?? []).length === 1);

r = await call("/api/admin/stats");
check("stats returns totals", typeof r.data.totals?.total === "number" && Array.isArray(r.data.perDay));
r = await call(`/api/admin/export?status=all&q=${stamp}`, { raw: true });
check("CSV export", r.status === 200 && /text\/csv/.test(r.headers.get("content-type")) && r.data.split("\n").length === 3);

// Cleanup + logout
for (const l of mine) await call(`/api/admin/leads/${l.id}`, { method: "DELETE" });
r = await call(`/api/admin/leads?status=all&q=${stamp}`);
check("test leads deleted", (r.data.leads ?? []).length === 0);
r = await call("/api/admin/logout", { method: "POST" });
check("logout", r.status === 200);
r = await call("/api/admin/me");
check("session gone after logout (401)", r.status === 401);

console.log(`\n${passed} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
