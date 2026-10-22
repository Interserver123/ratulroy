#!/usr/bin/env node
// Tests the admin Audits workflow against a running local server.
//   BASE=http://127.0.0.1:8788 node scripts/audits-test.mjs
const BASE = process.env.BASE ?? "http://127.0.0.1:8788";
const EMAIL = process.env.ADMIN_EMAIL ?? "test@ratulroy.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "local-test-password-123";
const SETUP_KEY = process.env.SETUP_KEY ?? "my-secret-setup-key";
let cookie = "", passed = 0;
const fails = [];
const check = (n, c, i = "") => { c ? passed++ : fails.push(n); console.log(`${c ? "✓" : "✗"} ${n}${c ? "" : " " + JSON.stringify(i)}`); };
async function call(path, { method = "GET", body } = {}) {
  const headers = { Origin: BASE };
  if (body) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const stamp = Date.now();
const a1 = await call("/api/leads", { method: "POST", body: { type: "audit", email: `audit1-${stamp}@example.com`, website: "https://dentist-example.com", page: "/", elapsed_ms: 9000 } });
const a2 = await call("/api/leads", { method: "POST", body: { type: "audit", email: `audit2-${stamp}@example.com`, website: "https://maps.app.goo.gl/abc123", name: "Sam Owner", phone: "+8801712345678", page: "/local-seo-service", elapsed_ms: 9000 } });
await call("/api/leads", { method: "POST", body: { type: "contact", email: `contact-${stamp}@example.com`, name: "Not an audit", message: "hello", page: "/contact", elapsed_ms: 9000 } });
check("audit requests submitted", a1.status === 201 && a2.status === 201);

let r = await call("/api/admin/audits");
check("audits API needs login", r.status === 401);
r = await call("/api/admin/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
if (r.status !== 200) {
  await call("/api/admin/setup", { method: "POST", body: { key: SETUP_KEY, email: EMAIL, password: PASSWORD, name: "Test Owner" } });
  await call("/api/admin/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
}
r = await call(`/api/admin/audits?stage=open&q=${stamp}`);
check("only audit-form leads listed", r.data.audits?.length === 2 && r.data.audits.every((x) => x.email.startsWith("audit")), r.data);
const one = r.data.audits.find((x) => x.email.startsWith("audit1"));
check("new audit is 'to do' with a 48 h deadline", one?.stage === "todo" && Math.abs(Date.parse(one.due_at) - Date.parse(one.created_at) - 48 * 3600_000) < 2000, one);

r = await call(`/api/admin/audits/${one.id}`, { method: "PATCH", body: { stage: "in_progress" } });
check("move to in progress", r.status === 200 && r.data.stage === "in_progress", r.data);
r = await call(`/api/admin/audits/${one.id}`, { method: "PATCH", body: { report_url: "javascript:alert(1)" } });
check("unsafe report link rejected", r.status === 422);
r = await call(`/api/admin/audits/${one.id}`, { method: "PATCH", body: { report_url: "https://docs.google.com/document/d/x", stage: "sent" } });
check("mark sent with report link", r.status === 200 && r.data.sent_at && r.data.report_url.startsWith("https://"), r.data);
r = await call(`/api/admin/leads/${one.id}`);
check("sending moves the lead from new to contacted", r.data.lead?.status === "contacted", r.data.lead?.status);
check("audit progress appears in the lead timeline", r.data.events?.some((e) => e.type === "update" && e.data.includes("audit")), r.data.events);
r = await call(`/api/admin/audits?stage=open&q=${stamp}`);
check("sent audit leaves the open list", r.data.audits.length === 1);
r = await call(`/api/admin/audits?stage=sent&q=${stamp}`);
check("sent filter shows it", r.data.audits.length === 1 && r.data.audits[0].id === one.id);
check("counts returned", typeof r.data.counts?.todo === "number" && r.data.counts.sent >= 1, r.data.counts);
r = await call(`/api/admin/audits/00000000-0000-0000-0000-000000000000`, { method: "PATCH", body: { stage: "sent" } });
check("unknown audit 404", r.status === 404);

console.log(`\n${passed} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
