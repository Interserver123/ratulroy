// Lead desk client. Talks only to /api/admin/*. All lead data is escaped before rendering.
type Lead = Record<string, string | number | null>;
type Count = { k: string; n: number };

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)];
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
const money = (cents: unknown) => `$${(Number(cents || 0) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
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
const initials = (s: unknown) =>
  String(s ?? "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("") || "?";

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

// ---------- auth views ----------
function showOnly(view: "login" | "setup" | "app") {
  for (const v of ["login", "setup", "app"]) $(`[data-view=${v}]`).hidden = v !== view;
}
function showLogin() {
  showOnly("login");
  $<HTMLInputElement>("[data-login] input[name=email]").focus();
}
function showSetup(configured: boolean) {
  showOnly("setup");
  if (!configured) {
    $("[data-setup-note]").textContent =
      "Almost there: add a secret called SETUP_KEY in Cloudflare (Pages project → Settings → Variables and secrets), redeploy, then reload this page.";
  }
}
async function showApp(user: { email: string; name: string }) {
  showOnly("app");
  const name = user.name || user.email;
  $("[data-user]").textContent = name.split(" ")[0];
  $("[data-first-name]").textContent = name.split(" ")[0];
  $("[data-user-initial]").textContent = initials(name).slice(0, 1).toUpperCase();
  const h = new Date().getHours();
  $("[data-greeting]").textContent = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  await Promise.all([loadStats(), loadRecent(), loadLeads()]);
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

// ---------- tabs ----------
type Tab = "overview" | "leads" | "followups";
function setTab(tab: Tab) {
  $$("[data-tab-btn]").forEach((b) => (b.dataset.tabBtn === tab ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  $("[data-tab=overview]").hidden = tab !== "overview";
  $("[data-tab=leads]").hidden = tab === "overview";
  if (tab === "followups") {
    Object.assign(state, { status: "open", due: true, sort: "followup", page: 1 });
    $("[data-leads-title]").textContent = "Follow-ups";
    $("[data-leads-sub]").textContent = "Open leads with a follow-up date today or earlier.";
  } else if (tab === "leads") {
    if (state.due) Object.assign(state, { due: false, sort: "newest", page: 1 });
    $("[data-leads-title]").textContent = "Leads";
    $("[data-leads-sub]").textContent = "Every enquiry from the website.";
  }
  if (tab !== "overview") {
    syncControls();
    renderPills();
    loadLeads();
  }
  window.scrollTo({ top: 0 });
}
$$("[data-tab-btn]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tabBtn as Tab)));
document.addEventListener("click", (e) => {
  const g = (e.target as HTMLElement).closest<HTMLElement>("[data-goto]");
  if (!g) return;
  const to = g.dataset.goto!;
  if (to === "followups") return setTab("followups");
  Object.assign(state, { due: false, sort: "newest", page: 1, form: "", q: "" });
  state.status = to === "new" ? "new" : to === "pipeline" ? "open" : "open";
  setTab("leads");
});

// ---------- overview ----------
let range = 30;
let statusCounts: Record<string, number> = {};

function bars(el: HTMLElement, rows: Count[], label = (k: string) => LABEL[k] ?? k) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  el.innerHTML = rows.length
    ? rows.map((r) => `<li><span title="${esc(r.k)}">${esc(label(r.k ?? "unknown"))}</span><b>${r.n}</b><i style="--w:${(r.n / max) * 100}%"></i></li>`).join("")
    : `<li class="adm-muted">No data yet</li>`;
}

/** Bucketed bar chart: light bar = all leads, solid bar = contacted or further. */
function chart(perDay: { d: string; n: number; worked: number }[]) {
  const size = range === 7 ? 1 : range === 30 ? 3 : 7;
  const count = Math.ceil(range / size);
  const buckets: { label: string; n: number; w: number }[] = [];
  for (let b = count - 1; b >= 0; b--) {
    let n = 0,
      w = 0;
    let label = "";
    for (let i = size - 1; i >= 0; i--) {
      const d = new Date(Date.now() - (b * size + i) * 86400_000).toISOString().slice(0, 10);
      const row = perDay.find((x) => x.d === d);
      n += row?.n ?? 0;
      w += row?.worked ?? 0;
      if (i === 0) label = d;
    }
    buckets.push({ label, n, w });
  }
  const max = Math.max(4, ...buckets.map((x) => x.n));
  const nice = Math.ceil(max / 4) * 4;
  const W = 640,
    H = 270,
    left = 30,
    bottom = 26,
    top = 8;
  const plotH = H - bottom - top;
  const gap = range === 7 ? 18 : 8;
  const bw = (W - left) / buckets.length;
  const y = (v: number) => top + plotH - (v / nice) * plotH;
  const grid = [0, 1, 2, 3, 4]
    .map((i) => {
      const v = (nice / 4) * i;
      return `<line x1="${left}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-dasharray="${i ? "3 4" : "0"}"/><text x="${left - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`;
    })
    .join("");
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const every = buckets.length > 12 ? 3 : buckets.length > 8 ? 2 : 1;
  const cols = buckets
    .map((b, i) => {
      const x = left + i * bw + gap / 2;
      const w = Math.max(4, bw - gap);
      const h1 = b.n ? Math.max(6, y(0) - y(b.n)) : 3;
      const h2 = b.w ? Math.max(6, y(0) - y(b.w)) : 0;
      const tip = `${fmt(b.label)}: ${b.n} lead${b.n === 1 ? "" : "s"}, ${b.w} contacted`;
      return `<g class="col"><title>${tip}</title>
        <rect class="b1" x="${x}" y="${y(0) - h1}" width="${w}" height="${h1}" rx="${Math.min(10, w / 3)}" fill="${b.n ? "url(#adm-stripe)" : "var(--bg-2)"}"/>
        ${h2 ? `<rect x="${x}" y="${y(0) - h2}" width="${w}" height="${h2}" rx="${Math.min(10, w / 3)}" fill="url(#adm-solid)"/>` : ""}
        ${i % every === 0 ? `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">${fmt(b.label)}</text>` : ""}
      </g>`;
    })
    .join("");
  $("[data-chart]").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Leads per period">
    <defs>
      <pattern id="adm-stripe" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="10" height="10" fill="#f8d3cb"/><rect width="4" height="10" fill="#f3b8ab"/>
      </pattern>
      <linearGradient id="adm-solid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8402f"/><stop offset="1" stop-color="#a3271a"/></linearGradient>
    </defs>${grid}${cols}</svg>`;
}

function sourceIcon(k: string) {
  const s = k.toLowerCase();
  if (s.includes("google") || s.includes("bing"))
    return '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
  if (s.includes("direct"))
    return '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" fill="currentColor"/><circle cx="12" cy="10" r="2.5" fill="#fff"/></svg>';
  if (s.includes("ai"))
    return '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3l1.8 4.8L18.6 9.6 13.8 11.4 12 16.2 10.2 11.4 5.4 9.6 10.2 7.8z" fill="currentColor"/></svg>';
  return '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
}

function promoGrid(level: number) {
  // Tiny geo-grid: greener as the follow-up queue empties.
  let html = "";
  for (let i = 0; i < 25; i++) {
    const d = Math.hypot((i % 5) - 2, Math.floor(i / 5) - 2);
    html += `<i class="${d < level ? "g" : d < level + 1.2 ? "a" : ""}"></i>`;
  }
  $("[data-promo-grid]").innerHTML = html;
}

async function loadStats() {
  const s = await api(`/api/admin/stats?days=${range}`);
  const t = s.totals ?? {};
  const p = s.period ?? {};
  statusCounts = Object.fromEntries((s.byStatus ?? []).map((r: Count) => [r.k, r.n]));

  // headline
  const cur = Number(p.current ?? 0);
  const prev = Number(p.previous ?? 0);
  $("[data-period-count]").textContent = String(cur);
  const delta = $("[data-period-delta]");
  if (!prev) {
    delta.textContent = cur ? "new" : "0%";
    delta.className = "adm-chip adm-chip--flat";
  } else {
    const pct = Math.round(((cur - prev) / prev) * 100);
    delta.textContent = `${pct >= 0 ? "+" : ""}${pct}%`;
    delta.className = `adm-chip${pct < 0 ? " adm-chip--down" : pct === 0 ? " adm-chip--flat" : ""}`;
  }
  delta.title = `vs previous ${range} days (${prev})`;
  chart(s.perDay ?? []);

  // sources
  const src = (s.bySource ?? []) as Count[];
  const total = src.reduce((a, r) => a + r.n, 0) || 1;
  $("[data-sources]").innerHTML = src.length
    ? src
        .slice(0, 2)
        .map(
          (r) => `<div class="ov-tile"><span class="ov-tile__icon">${sourceIcon(r.k)}</span><small>${esc(r.k)}</small>
            <b>${r.n}</b><em>${Math.round((r.n / total) * 100)}% of leads <span aria-hidden="true">↗</span></em></div>`,
        )
        .join("")
    : `<p class="ov-empty">Sources appear once leads arrive.</p>`;

  // win rate
  const won = Number(t.won ?? 0),
    lost = Number(t.lost ?? 0),
    closed = won + lost;
  const wr = closed ? Math.round((won / closed) * 100) : 0;
  $("[data-won]").textContent = String(won);
  $("[data-closed]").textContent = String(closed);
  $("[data-winrate]").textContent = `${wr}%`;
  $("[data-ring]").style.setProperty("--p", String(wr));

  // waiting / contacted
  const fresh = Number(t.fresh ?? 0);
  $("[data-fresh]").textContent = String(fresh);
  const todays = ((s.perDay ?? []) as { d: string; n: number }[]).find((x) => x.d === today())?.n ?? 0;
  $("[data-fresh-chip]").textContent = `${todays} today`;
  const worked = Number(p.worked ?? 0);
  const wp = cur ? Math.round((worked / cur) * 100) : 0;
  $("[data-worked-of]").textContent = `${worked} of ${cur}`;
  $("[data-worked-pct]").textContent = `${wp}%`;
  $("[data-worked-bar]").style.setProperty("--w", `${wp}%`);

  // pipeline
  const pipe = Number(t.pipeline_value ?? 0),
    wonV = Number(t.won_value ?? 0);
  $("[data-pipeline]").textContent = money(pipe);
  $("[data-open-chip]").textContent = `${t.open ?? 0} open`;
  $("[data-won-value]").textContent = money(wonV);
  const share = pipe + wonV ? Math.round((wonV / (pipe + wonV)) * 100) : 0;
  $("[data-won-pct]").textContent = `${share}%`;
  $("[data-won-bar]").style.setProperty("--w", `${share}%`);

  // promo / action card
  const due = Number(t.followUpsDue ?? 0);
  if (due) {
    $("[data-promo-title]").textContent = `${due} follow-up${due === 1 ? "" : "s"} due`;
    $("[data-promo-text]").textContent = "Leads you promised to get back to. Clear these before anything else.";
    $("[data-promo-btn]").textContent = "Open follow-ups";
    $("[data-promo-btn]").dataset.goto = "followups";
    promoGrid(0.8);
  } else if (fresh) {
    $("[data-promo-title]").textContent = `${fresh} new lead${fresh === 1 ? "" : "s"} waiting`;
    $("[data-promo-text]").textContent = "A fast first reply wins most local jobs. Reply while they're warm.";
    $("[data-promo-btn]").textContent = "Reply now";
    $("[data-promo-btn]").dataset.goto = "new";
    promoGrid(1.6);
  } else {
    $("[data-promo-title]").textContent = "You're all caught up";
    $("[data-promo-text]").textContent = "No follow-ups due and no unanswered leads. Nice work.";
    $("[data-promo-btn]").textContent = "View all leads";
    $("[data-promo-btn]").dataset.goto = "leads";
    promoGrid(3);
  }

  // counts in nav + buttons
  $("[data-new-count]").textContent = String(fresh);
  $("[data-badge-new]").textContent = fresh ? String(fresh) : "";
  $("[data-badge-due]").textContent = due ? String(due) : "";

  bars($("[data-by-form]"), s.byForm ?? []);
  bars($("[data-top-pages]"), s.topPages ?? [], (k) => k);
  renderPills();
}

async function loadRecent() {
  const r = await api("/api/admin/leads?status=all&sort=newest&page=1");
  const rows = ((r.leads ?? []) as Lead[]).filter((l) => l.status !== "spam").slice(0, 5);
  $("[data-recent]").innerHTML = rows.length
    ? rows
        .map(
          (l) => `<li><button type="button" data-open="${esc(l.id)}">
            <span class="ov-av">${esc(initials(l.name || l.email))}</span>
            <span><b>${esc(l.name || l.email)}</b><small>${esc(LABEL[String(l.form)] ?? l.form)} · ${esc(l.business || l.website || l.page_path || "")}</small></span>
            <span class="r"><span class="adm-badge adm-badge--${esc(l.status)}">${esc(LABEL[String(l.status)])}</span><small>${esc(when(l.created_at))}</small></span>
          </button></li>`,
        )
        .join("")
    : `<li><p class="ov-empty">New enquiries from the website will show up here.</p></li>`;
}
$("[data-recent]").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-open]");
  if (b) openLead(b.dataset.open!);
});
$<HTMLSelectElement>("[data-range]").addEventListener("change", (e) => {
  range = Number((e.target as HTMLSelectElement).value);
  loadStats();
});

// ---------- leads list ----------
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
function syncControls() {
  $<HTMLInputElement>("[data-q]").value = state.q;
  $<HTMLSelectElement>("[data-form]").value = state.form;
  $<HTMLSelectElement>("[data-sort]").value = state.sort;
  $<HTMLInputElement>("[data-due]").checked = state.due;
}

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
            <td><div class="adm-lead"><span class="ov-av">${esc(initials(l.name || l.email))}</span>
              <span><b>${esc(l.name || l.email)}</b><small>${esc(l.business || l.website || l.email)}</small></span>
              ${l.priority === "high" ? '<span class="adm-badge adm-badge--high">High</span>' : ""}</div></td>
            <td>${esc(LABEL[String(l.form)] ?? l.form)}</td>
            <td><span class="adm-badge adm-badge--${esc(l.status)}">${esc(LABEL[String(l.status)])}</span></td>
            <td>${esc(l.utm_source || l.page_path || "")}</td>
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
      <button class="adm-iconbtn" type="button" data-close aria-label="Close">✕</button>
    </div>
    <div class="adm-actions">
      <a class="adm-btn adm-btn--pill adm-btn--dark" href="mailto:${esc(l.email)}">Email</a>
      ${wa ? `<a class="adm-btn adm-btn--pill" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
      ${l.phone ? `<a class="adm-btn adm-btn--pill" href="tel:${esc(String(l.phone).replace(/[^\d+]/g, ""))}">Call</a>` : ""}
      ${site ? `<a class="adm-btn adm-btn--pill" href="${esc(site)}" target="_blank" rel="noopener noreferrer nofollow">Website ↗</a>` : ""}
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

    <h3>Where they came from</h3>
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

async function refreshAll() {
  await Promise.all([loadLeads(), loadStats(), loadRecent()]);
}
async function patch(body: Record<string, unknown>, msg: string) {
  if (!current) return;
  try {
    await api(`/api/admin/leads/${current}`, { method: "PATCH", body: JSON.stringify(body) });
    toast(msg);
    const id = current;
    await Promise.all([openLead(id), refreshAll()]);
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
      await refreshAll();
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
