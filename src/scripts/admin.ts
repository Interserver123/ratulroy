// Leads dashboard client. Talks only to /api/admin/*. All lead data is escaped before rendering.
type Lead = Record<string, string | number | null>;
type Count = { k: string; n: number };

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const STATUSES = ["new", "contacted", "qualified", "proposal", "won", "lost", "spam"] as const;
const LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
  spam: "Spam",
  open: "Open",
  all: "All",
  audit: "Free audit",
  contact: "Contact",
  "strategy-call": "Strategy call",
};
const money = (cents: unknown) =>
  cents === null || cents === undefined || cents === "" ? "" : `$${(Number(cents) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const when = (iso: unknown) => {
  if (!iso) return "";
  const d = new Date(String(iso));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)} d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const today = () => new Date().toISOString().slice(0, 10);

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/admin/login" && path !== "/api/admin/setup") showLogin();
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data;
}

function toast(msg: string) {
  const t = $("[data-toast]");
  t.textContent = msg;
  t.classList.add("is-on");
  window.setTimeout(() => t.classList.remove("is-on"), 2200);
}

// ---------- views ----------
function showLogin() {
  $("[data-view=app]").hidden = true;
  $("[data-view=setup]").hidden = true;
  $("[data-view=login]").hidden = false;
  $<HTMLInputElement>("[data-login] input[name=email]").focus();
}
function showSetup(configured: boolean) {
  $("[data-view=app]").hidden = true;
  $("[data-view=login]").hidden = true;
  $("[data-view=setup]").hidden = false;
  if (!configured) {
    $("[data-setup-note]").textContent =
      "Almost there: add a secret called SETUP_KEY in Cloudflare (Pages project → Settings → Variables and secrets), redeploy, then reload this page.";
  }
}
async function showApp(user: { email: string; name: string }) {
  $("[data-view=login]").hidden = true;
  $("[data-view=setup]").hidden = true;
  $("[data-view=app]").hidden = false;
  $("[data-user]").textContent = user.name || user.email;
  await Promise.all([loadStats(), loadLeads()]);
}

$<HTMLFormElement>("[data-login]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget as HTMLFormElement;
  const err = $("[data-login-error]");
  err.textContent = "";
  const btn = f.querySelector("button")!;
  btn.disabled = true;
  try {
    const fd = new FormData(f);
    const r = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }) });
    f.reset();
    await showApp(r.user);
  } catch (x) {
    err.textContent = (x as Error).message;
  } finally {
    btn.disabled = false;
  }
});
$<HTMLFormElement>("[data-setup]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget as HTMLFormElement;
  const err = $("[data-setup-error]");
  const fd = new FormData(f);
  err.textContent = "";
  if (fd.get("password") !== fd.get("password2")) {
    err.textContent = "The two passwords don't match.";
    return;
  }
  const btn = f.querySelector("button")!;
  btn.disabled = true;
  try {
    const r = await api("/api/admin/setup", {
      method: "POST",
      body: JSON.stringify({ key: fd.get("key"), name: fd.get("name"), email: fd.get("email"), password: fd.get("password") }),
    });
    f.reset();
    toast("Account created");
    await showApp(r.user);
  } catch (x) {
    err.textContent = (x as Error).message;
  } finally {
    btn.disabled = false;
  }
});
$("[data-logout]").addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" }).catch(() => undefined);
  showLogin();
});

// ---------- stats ----------
function bars(el: HTMLElement, rows: Count[], label = (k: string) => LABEL[k] ?? k) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  el.innerHTML = rows.length
    ? rows.map((r) => `<li><span title="${esc(r.k)}">${esc(label(r.k ?? "unknown"))}</span><b>${r.n}</b><i style="--w:${(r.n / max) * 100}%"></i></li>`).join("")
    : `<li class="adm-muted">No data yet</li>`;
}

function chart(perDay: { d: string; n: number }[]) {
  const days: { d: string; n: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    days.push({ d, n: perDay.find((x) => x.d === d)?.n ?? 0 });
  }
  const max = Math.max(1, ...days.map((x) => x.n));
  const w = 600,
    h = 140,
    bw = w / days.length;
  const rects = days
    .map((x, i) => {
      const bh = x.n ? Math.max(4, (x.n / max) * (h - 24)) : 2;
      return `<rect x="${i * bw + 2}" y="${h - 18 - bh}" width="${bw - 4}" height="${bh}" rx="3" fill="${x.n ? "var(--accent)" : "var(--line)"}"><title>${x.d}: ${x.n}</title></rect>`;
    })
    .join("");
  const ticks = [0, 10, 20, 29]
    .map((i) => `<text x="${i * bw + bw / 2}" y="${h - 3}" font-size="10" text-anchor="middle" fill="var(--muted)">${days[i].d.slice(5)}</text>`)
    .join("");
  $("[data-chart]").innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Leads per day">${rects}${ticks}</svg>`;
  $("[data-chart-total]").textContent = `${days.reduce((a, x) => a + x.n, 0)} leads`;
}

let statusCounts: Record<string, number> = {};
async function loadStats() {
  const s = await api("/api/admin/stats");
  const t = s.totals ?? {};
  const total = Number(t.total ?? 0);
  const won = Number(t.won ?? 0);
  const kpis: [string, string | number, string?][] = [
    ["Total leads", total],
    ["New, not contacted", t.fresh ?? 0, "accent"],
    ["Last 7 days", t.week ?? 0],
    ["Open pipeline", t.open ?? 0],
    ["Won", won, "good"],
    ["Win rate", total ? `${Math.round((won / total) * 100)}%` : "0%"],
    ["Pipeline value", money(t.pipeline_value ?? 0) || "$0"],
    ["Follow-ups due", t.followUpsDue ?? 0, t.followUpsDue ? "accent" : undefined],
  ];
  $("[data-kpis]").innerHTML = kpis.map(([l, v, tone]) => `<div class="adm-kpi${tone ? ` adm-kpi--${tone}` : ""}"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join("");
  chart(s.perDay ?? []);
  bars($("[data-by-form]"), s.byForm ?? []);
  bars($("[data-by-source]"), s.bySource ?? [], (k) => k);
  bars($("[data-top-pages]"), s.topPages ?? [], (k) => k);
  statusCounts = Object.fromEntries((s.byStatus ?? []).map((r: Count) => [r.k, r.n]));
  renderPills();
}

// ---------- list ----------
const state = { status: "open", form: "", q: "", sort: "newest", due: false, page: 1 };
const query = (extra: Record<string, string | number> = {}) => {
  const p = new URLSearchParams();
  p.set("status", state.status);
  if (state.form) p.set("form", state.form);
  if (state.q) p.set("q", state.q);
  if (state.due) p.set("due", "1");
  p.set("sort", state.sort);
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  return p.toString();
};

function renderPills() {
  const open = ["new", "contacted", "qualified", "proposal"].reduce((a, k) => a + (statusCounts[k] ?? 0), 0);
  const all = Object.values(statusCounts).reduce((a, n) => a + n, 0);
  const pills: [string, number][] = [["open", open], ...STATUSES.map((s) => [s, statusCounts[s] ?? 0] as [string, number]), ["all", all]];
  $("[data-status-pills]").innerHTML = pills
    .map(([k, n]) => `<button type="button" class="adm-pill" role="tab" aria-selected="${state.status === k}" data-status="${k}">${LABEL[k]}<small>${n}</small></button>`)
    .join("");
}
$("[data-status-pills]").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-status]");
  if (!b) return;
  state.status = b.dataset.status!;
  state.page = 1;
  renderPills();
  loadLeads();
});

async function loadLeads() {
  const r = await api(`/api/admin/leads?${query({ page: state.page })}`);
  const rows = r.leads as Lead[];
  const t = today();
  $("[data-rows]").innerHTML = rows.length
    ? rows
        .map((l) => {
          const overdue = l.next_follow_up && String(l.next_follow_up) <= t && !["won", "lost", "spam"].includes(String(l.status));
          return `<tr tabindex="0" data-id="${esc(l.id)}">
            <td><b>${esc(l.name || l.email)}</b><span class="adm-muted">${esc(l.business || l.website || l.email)}</span>
              ${l.priority === "high" ? ' <span class="adm-badge adm-badge--high">High</span>' : ""}</td>
            <td>${esc(LABEL[String(l.form)] ?? l.form)}</td>
            <td><span class="adm-badge adm-badge--${esc(l.status)}">${esc(LABEL[String(l.status)])}</span></td>
            <td>${esc(l.utm_source || (l.page_path ?? ""))}</td>
            <td class="${overdue ? "adm-overdue" : ""}">${esc(l.next_follow_up ?? "")}</td>
            <td title="${esc(l.created_at)}">${esc(when(l.created_at))}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="6" class="adm-empty">No leads match these filters.</td></tr>`;
  $("[data-pager]").innerHTML = `<span class="adm-muted">${r.total} lead${r.total === 1 ? "" : "s"} · page ${r.page} of ${r.pages}</span>
    <span><button class="adm-btn" data-page="${r.page - 1}" ${r.page <= 1 ? "disabled" : ""}>Previous</button>
    <button class="adm-btn" data-page="${r.page + 1}" ${r.page >= r.pages ? "disabled" : ""}>Next</button></span>`;
  $<HTMLAnchorElement>("[data-export]").href = `/api/admin/export?${query()}`;
}
$("[data-pager]").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-page]");
  if (!b || b.disabled) return;
  state.page = Number(b.dataset.page);
  loadLeads();
});
let qTimer = 0;
$<HTMLInputElement>("[data-q]").addEventListener("input", (e) => {
  window.clearTimeout(qTimer);
  qTimer = window.setTimeout(() => {
    state.q = (e.target as HTMLInputElement).value.trim();
    state.page = 1;
    loadLeads();
  }, 250);
});
$<HTMLSelectElement>("[data-form]").addEventListener("change", (e) => {
  state.form = (e.target as HTMLSelectElement).value;
  state.page = 1;
  loadLeads();
});
$<HTMLSelectElement>("[data-sort]").addEventListener("change", (e) => {
  state.sort = (e.target as HTMLSelectElement).value;
  loadLeads();
});
$<HTMLInputElement>("[data-due]").addEventListener("change", (e) => {
  state.due = (e.target as HTMLInputElement).checked;
  state.page = 1;
  loadLeads();
});
const openFromRow = (e: Event) => {
  const tr = (e.target as HTMLElement).closest<HTMLElement>("tr[data-id]");
  if (tr) openLead(tr.dataset.id!);
};
$("[data-rows]").addEventListener("click", openFromRow);
$("[data-rows]").addEventListener("keydown", (e) => {
  if ((e as KeyboardEvent).key === "Enter") openFromRow(e);
});

// ---------- drawer ----------
let current: string | null = null;
function closeDrawer() {
  $("[data-drawer]").hidden = true;
  $("[data-scrim]").hidden = true;
  current = null;
}
$("[data-scrim]").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && current) closeDrawer();
});

const waLink = (phone: unknown) => {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? `https://wa.me/${digits}` : "";
};
const safeHref = (url: unknown) => {
  const s = String(url ?? "").trim();
  if (!s) return "";
  const u = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:" ? p.href : "";
  } catch {
    return "";
  }
};

async function openLead(id: string) {
  current = id;
  const r = await api(`/api/admin/leads/${id}`);
  const l = r.lead as Lead;
  const tags: string[] = JSON.parse(String(l.tags || "[]"));
  const site = safeHref(l.website);
  const wa = waLink(l.phone);
  const row = (k: string, v: unknown, html?: string) => (v ? `<dt>${k}</dt><dd>${html ?? esc(v)}</dd>` : "");
  $("[data-drawer-body]").innerHTML = `
    <div class="adm-dhead">
      <div><p class="adm-kicker"><span class="adm-pin"></span>${esc(LABEL[String(l.form)] ?? l.form)} · ${esc(when(l.created_at))}</p>
      <h2>${esc(l.name || l.email)}</h2><p class="adm-muted">${esc(l.business || "")}</p></div>
      <button class="adm-btn" type="button" data-close aria-label="Close">✕</button>
    </div>
    <div class="adm-actions">
      <a class="adm-btn adm-btn--dark" href="mailto:${esc(l.email)}">Email</a>
      ${wa ? `<a class="adm-btn" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
      ${l.phone ? `<a class="adm-btn" href="tel:${esc(String(l.phone).replace(/[^\d+]/g, ""))}">Call</a>` : ""}
      ${site ? `<a class="adm-btn" href="${esc(site)}" target="_blank" rel="noopener noreferrer nofollow">Open website</a>` : ""}
    </div>

    <h3>Status</h3>
    <div class="adm-pipeline" data-pipeline>
      ${STATUSES.map((s) => `<button type="button" class="adm-btn" data-set-status="${s}" aria-pressed="${l.status === s}">${LABEL[s]}</button>`).join("")}
    </div>

    <h3>Deal</h3>
    <form class="adm-fields" data-deal>
      <label>Priority<select name="priority">${["low", "normal", "high"].map((p) => `<option value="${p}" ${l.priority === p ? "selected" : ""}>${p[0].toUpperCase() + p.slice(1)}</option>`).join("")}</select></label>
      <label>Value (USD)<input name="value" type="number" min="0" step="1" value="${l.value_estimate ? Number(l.value_estimate) / 100 : ""}" /></label>
      <label>Next follow-up<input name="follow" type="date" value="${esc(l.next_follow_up ?? "")}" /></label>
      <label>Tags (comma separated)<input name="tags" value="${esc(tags.join(", "))}" /></label>
      <label class="full">Lost reason<input name="lost" value="${esc(l.lost_reason ?? "")}" placeholder="Only if lost" /></label>
      <div class="full"><button class="adm-btn adm-btn--dark" type="submit">Save</button></div>
    </form>

    <h3>Enquiry</h3>
    <dl class="adm-dl">
      ${row("Email", l.email)}${row("Phone", l.phone)}${row("Website", l.website, site ? `<a href="${esc(site)}" target="_blank" rel="noopener noreferrer nofollow">${esc(l.website)}</a>` : esc(l.website))}
      ${row("Service area", l.service_area)}${row("Goal", l.goal)}${row("Preferred time", l.preferred_time)}${row("Message", l.message)}
    </dl>

    <h3>Attribution</h3>
    <dl class="adm-dl">
      ${row("Page", l.page_path)}${row("Referrer", l.referrer)}${row("UTM source", l.utm_source)}${row("UTM medium", l.utm_medium)}
      ${row("UTM campaign", l.utm_campaign)}${row("UTM term", l.utm_term)}${row("UTM content", l.utm_content)}
      ${row("Location", [l.city, l.country].filter(Boolean).join(", "))}${row("Spam score", l.spam_score ? `${l.spam_score}/100` : "")}
      ${row("Received", new Date(String(l.created_at)).toLocaleString())}
    </dl>

    <h3>Notes</h3>
    <div class="adm-notes">${(r.notes as Lead[]).map((n) => `<div class="adm-note"><small>${esc(n.author)} · ${esc(when(n.created_at))}</small>${esc(n.body)}</div>`).join("") || '<p class="adm-muted">No notes yet.</p>'}</div>
    <form class="adm-newnote" data-note>
      <textarea name="body" rows="3" placeholder="Call summary, quote sent, next step…" required></textarea>
      <div><button class="adm-btn adm-btn--dark" type="submit">Add note</button></div>
    </form>

    <h3>Activity</h3>
    <ul class="adm-timeline">${(r.events as Lead[]).map((ev) => `<li><small>${esc(when(ev.created_at))} · ${esc(ev.actor)}</small>${esc(describe(ev))}</li>`).join("")}</ul>

    <h3>Danger zone</h3>
    <button class="adm-btn adm-btn--danger" type="button" data-delete>Delete lead permanently</button>
  `;
  $("[data-drawer]").hidden = false;
  $("[data-scrim]").hidden = false;
  $("[data-drawer] [data-close]").focus();
}

function describe(ev: Lead): string {
  const d = JSON.parse(String(ev.data || "{}"));
  if (ev.type === "created") return `Submitted the ${LABEL[d.form] ?? d.form} form${d.page ? ` on ${d.page}` : ""}`;
  if (ev.type === "status") return `Status: ${LABEL[d.from] ?? d.from} → ${LABEL[d.to] ?? d.to}`;
  if (ev.type === "note") return "Added a note";
  return `Updated ${Object.keys(d).join(", ").replace(/_/g, " ")}`;
}

async function patch(body: Record<string, unknown>, msg: string) {
  if (!current) return;
  try {
    await api(`/api/admin/leads/${current}`, { method: "PATCH", body: JSON.stringify(body) });
    toast(msg);
    const id = current;
    await Promise.all([openLead(id), loadLeads(), loadStats()]);
  } catch (x) {
    toast((x as Error).message);
  }
}

$("[data-drawer]").addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;
  if (t.closest("[data-close]")) return closeDrawer();
  const s = t.closest<HTMLButtonElement>("[data-set-status]");
  if (s) return patch({ status: s.dataset.setStatus }, `Marked as ${LABEL[s.dataset.setStatus!]}`);
  if (t.closest("[data-delete]") && current && confirm("Delete this lead and its notes permanently?")) {
    try {
      await api(`/api/admin/leads/${current}`, { method: "DELETE" });
      closeDrawer();
      toast("Lead deleted");
      await Promise.all([loadLeads(), loadStats()]);
    } catch (x) {
      toast((x as Error).message);
    }
  }
});
$("[data-drawer]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target as HTMLFormElement;
  const fd = new FormData(f);
  if (f.matches("[data-deal]")) {
    const value = String(fd.get("value") ?? "").trim();
    return patch(
      {
        priority: fd.get("priority"),
        value_estimate: value === "" ? null : Math.round(Number(value) * 100),
        next_follow_up: fd.get("follow") || null,
        tags: String(fd.get("tags") ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        lost_reason: fd.get("lost") || null,
      },
      "Saved",
    );
  }
  if (f.matches("[data-note]") && current) {
    try {
      await api(`/api/admin/leads/${current}/notes`, { method: "POST", body: JSON.stringify({ body: fd.get("body") }) });
      toast("Note added");
      await openLead(current);
    } catch (x) {
      toast((x as Error).message);
    }
  }
});

// ---------- boot ----------
api("/api/admin/me")
  .then((r) => showApp(r.user))
  .catch(async (x) => {
    if (x instanceof ApiError && x.status === 503) {
      showLogin();
      $("[data-login-error]").textContent = "The database isn't connected yet. Finish the Cloudflare setup steps, then reload.";
      return;
    }
    try {
      const s = await api("/api/admin/setup");
      if (s.needed) return showSetup(Boolean(s.configured));
    } catch {
      /* fall through to login */
    }
    showLogin();
  });
