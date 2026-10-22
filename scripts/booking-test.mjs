#!/usr/bin/env node
// End-to-end test of the strategy-call booking API against a running local server.
//   BASE=http://127.0.0.1:8788 node scripts/booking-test.mjs
const BASE = process.env.BASE ?? "http://127.0.0.1:8788";
const EMAIL = process.env.ADMIN_EMAIL ?? "test@ratulroy.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "local-test-password-123";
const SETUP_KEY = process.env.SETUP_KEY ?? "my-secret-setup-key";
let passed = 0;
const fails = [];
let cookie = "";
const check = (name, cond, info = "") => {
  cond ? passed++ : fails.push(name);
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : " " + JSON.stringify(info)}`);
};
async function call(path, { method = "GET", body } = {}) {
  const headers = { Origin: BASE };
  if (body) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const person = (n) => ({ name: `Booker ${n}`, email: `booker${n}-${Date.now()}@example.com`, phone: "+8801700000000", website: "https://example.com", elapsed_ms: 9000, platform: "google-meet", timezone: "Europe/London", focus: ["Google Maps ranking"] });

let r = await call("/api/booking/slots?package=nope");
check("unknown package rejected", r.status === 400);
r = await call("/api/booking/slots?package=strategy");
const slots = r.data.slots ?? [];
check("strategy slots returned", r.status === 200 && slots.length > 50, r.data);
const BD = 6 * 3600_000;
const ok = slots.every((s) => {
  const d = new Date(Date.parse(s) + BD);
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return d.getUTCDay() !== 5 && mins >= 600 && mins + 60 <= 1200;
});
check("slots are Sat–Thu, 10 AM–8 PM Bangladesh time, no Fridays", ok);
check("slots respect 12h minimum notice", slots.every((s) => Date.parse(s) > Date.now() + 11.9 * 3600_000));

const slot = slots[3];
r = await call("/api/booking", { method: "POST", body: { ...person(1), package: "strategy", start: slot } });
check("booking accepted (201)", r.status === 201 && r.data.booking?.label?.includes("Bangladesh time"), r.data);

r = await call("/api/booking", { method: "POST", body: { ...person(2), package: "strategy", start: slot } });
check("same slot cannot be booked twice (409)", r.status === 409, r.data);

r = await call("/api/booking/slots?package=intro");
const intro = r.data.slots;
const blocked = intro.filter((s) => Date.parse(s) > Date.parse(slot) - 45 * 60_000 && Date.parse(s) < Date.parse(slot) + 75 * 60_000);
check("overlapping slots (incl. 15-min buffer) hidden for other packages", blocked.length === 0, blocked);

r = await call("/api/booking", { method: "POST", body: { ...person(3), package: "strategy", start: "2020-01-01T04:00:00.000Z" } });
check("past / invalid time rejected", r.status === 409, r.data);
r = await call("/api/booking", { method: "POST", body: { ...person(4), email: "bad", package: "strategy", start: slots[10] } });
check("invalid email rejected (422)", r.status === 422 && r.data.fields?.email, r.data);
r = await call("/api/booking", { method: "POST", body: { ...person(5), phone: "", package: "strategy", start: slots[10] } });
check("phone required (422)", r.status === 422 && r.data.fields?.phone, r.data);
r = await fetch(BASE + "/api/booking", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: "{}" });
check("cross-origin booking blocked (403)", r.status === 403);

// The lead appears in admin with the booking details.
r = await call("/api/admin/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
if (r.status !== 200) {
  await call("/api/admin/setup", { method: "POST", body: { key: SETUP_KEY, email: EMAIL, password: PASSWORD, name: "Test Owner" } });
  r = await call("/api/admin/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
}
r = await call("/api/admin/leads?form=strategy-call&q=booker1");
const lead = r.data.leads?.[0];
check("booking saved as a strategy-call lead", lead?.form === "strategy-call", r.data);
r = await call(`/api/admin/leads/${lead?.id}`);
check("lead has package, Bangladesh time and platform", r.data.lead?.goal === "Strategy Session" && /Strategy Session/.test(r.data.lead?.message) && /Bangladesh time/.test(r.data.lead?.message) && /Google Meet/.test(r.data.lead?.message), r.data.lead?.message);

// Marking the lead lost frees the slot again.
await call(`/api/admin/leads/${lead?.id}`, { method: "PATCH", body: { status: "lost" } });
r = await call("/api/booking/slots?package=strategy");
check("slot is free again after the lead is marked lost", r.data.slots.includes(slot));

console.log(`\n${passed} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
