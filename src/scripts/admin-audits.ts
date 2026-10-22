// Audits tab of the lead desk: free-audit requests with a 48-hour reply deadline.
type Api = <T = any>(path: string, opts?: RequestInit) => Promise<T>;
type Helpers = { api: Api; toast: (m: string) => void; esc: (v: unknown) => string; when: (iso: unknown) => string; openLead: (id: string) => Promise<void> };
type Audit = {
  id: string;
  created_at: string;
  status: string;
  name: string | null;
  email: string;
  phone: string | null;
  business: string | null;
  website: string | null;
  page_path: string | null;
  message: string | null;
  stage: "todo" | "in_progress" | "sent";
  report_url: string | null;
  sent_at: string | null;
  due_at: string;
};

const $ = <T extends HTMLElement = HTMLElement>(s: string, el: ParentNode = document) => el.querySelector<T>(s)!;
const STAGE: Record<Audit["stage"], string> = { todo: "To do", in_progress: "In progress", sent: "Sent" };

export function mountAudits({ api, toast, esc, when, openLead }: Helpers) {
  let stage = "open";
  let q = "";
  let rows: Audit[] = [];

  const href = (u: string | null) => {
    if (!u) return null;
    const v = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    try {
      return new URL(v).href;
    } catch {
      return null;
    }
  };
  const isMaps = (u: string | null) => !!u && /(google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|g\.page|maps\.google)/i.test(u);
  const host = (u: string | null) => {
    try {
      return new URL(href(u)!).hostname.replace(/^www\./, "");
    } catch {
      return u ?? "";
    }
  };

  function dueChip(a: Audit) {
    if (a.stage === "sent") return `<span class="au-due au-due--done">Sent ${esc(when(a.sent_at))}</span>`;
    const h = (Date.parse(a.due_at) - Date.now()) / 3600_000;
    if (h < 0) return `<span class="au-due au-due--late">Overdue by ${Math.ceil(-h)} h</span>`;
    return `<span class="au-due ${h < 12 ? "au-due--soon" : ""}">Due in ${Math.max(1, Math.floor(h))} h</span>`;
  }

  function emailLink(a: Audit) {
    const first = (a.name ?? "").split(" ")[0];
    const subject = "Your free Local SEO audit";
    const body = [
      `Hi${first ? " " + first : ""},`,
      "",
      `Thanks for requesting a free audit of ${a.website ? host(a.website) : "your business"}. ${a.report_url ? `Here are the results: ${a.report_url}` : "Here is what I found:"}`,
      "",
      "Happy to walk you through it on a quick call: https://ratulroy.com/book-strategy-call",
      "",
      "Ratul Roy",
      "Local SEO Expert in Bangladesh",
    ].join("\n");
    return `mailto:${encodeURIComponent(a.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  const waLink = (p: string | null) => {
    const d = (p ?? "").replace(/[^\d]/g, "");
    return d.length >= 8 ? `https://wa.me/${d}` : null;
  };

  function render() {
    const list = $("[data-au-list]");
    if (!rows.length) {
      list.innerHTML = `<li class="ov-empty">${stage === "open" ? "No audits waiting. Nice work." : "Nothing here."}</li>`;
      return;
    }
    list.innerHTML = rows
      .map((a) => {
        const site = href(a.website);
        const wa = waLink(a.phone);
        return `<li class="au-item au-item--${a.stage}" data-id="${esc(a.id)}">
          <div class="au-main">
            <span class="au-ico ${isMaps(a.website) ? "au-ico--maps" : ""}" aria-hidden="true">${isMaps(a.website) ? "📍" : esc(host(a.website).slice(0, 1).toUpperCase() || "?")}</span>
            <div class="au-who">
              ${site ? `<a class="au-site" href="${esc(site)}" target="_blank" rel="noopener noreferrer">${esc(isMaps(a.website) ? "Google Maps link" : host(a.website))} ↗</a>` : `<b class="au-site">No link given</b>`}
              <small>${esc(a.name ? `${a.name} · ` : "")}${esc(a.email)}${a.phone ? ` · ${esc(a.phone)}` : ""}</small>
              <small class="au-meta">Requested ${esc(when(a.created_at))}${a.page_path ? ` on ${esc(a.page_path)}` : ""}</small>
            </div>
            ${dueChip(a)}
          </div>
          <div class="au-ctrl">
            <div class="au-seg" role="group" aria-label="Audit stage">
              ${(["todo", "in_progress", "sent"] as const).map((s) => `<button type="button" data-stage="${s}" aria-pressed="${a.stage === s}">${STAGE[s]}</button>`).join("")}
            </div>
            <label class="au-report"><span class="sr-only">Report link</span><input type="url" placeholder="Report link (Google Doc, Loom, PDF…)" value="${esc(a.report_url ?? "")}" data-report /></label>
            <div class="au-acts">
              <a class="adm-btn adm-btn--pill" href="${emailLink(a)}" data-email>Email results</a>
              ${wa ? `<a class="adm-btn adm-btn--pill" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
              <button class="adm-link" type="button" data-open>Details</button>
            </div>
          </div>
        </li>`;
      })
      .join("");
  }

  async function load() {
    const r = await api(`/api/admin/audits?stage=${stage}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
    rows = r.audits;
    const c = r.counts;
    $("[data-au-todo]").textContent = String(c.todo);
    $("[data-au-progress]").textContent = String(c.in_progress);
    $("[data-au-overdue]").textContent = String(c.overdue);
    $("[data-au-sent]").textContent = String(c.sent);
    $("[data-au-overdue]").closest(".au-kpi")!.classList.toggle("is-bad", c.overdue > 0);
    setBadge(c.todo + c.in_progress, c.overdue);
    render();
  }

  function setBadge(open: number, overdue: number) {
    const b = $("[data-badge-audits]");
    b.textContent = open ? String(open) : "";
    b.classList.toggle("is-calm", !overdue);
  }

  async function patch(id: string, body: Record<string, unknown>, msg: string) {
    try {
      await api(`/api/admin/audits/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast(msg);
      await load();
    } catch (x) {
      toast((x as Error).message);
    }
  }

  // events
  $("[data-au-list]").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const item = t.closest<HTMLElement>("[data-id]");
    if (!item) return;
    const id = item.dataset.id!;
    const st = t.closest<HTMLElement>("[data-stage]");
    if (st) return void patch(id, { stage: st.dataset.stage }, st.dataset.stage === "sent" ? "Marked as sent" : `Moved to ${STAGE[st.dataset.stage as Audit["stage"]]}`);
    if (t.closest("[data-open]")) return void openLead(id);
    if (t.closest("[data-email]")) {
      const a = rows.find((x) => x.id === id);
      if (a && a.stage === "todo") patch(id, { stage: "in_progress" }, "Moved to In progress");
    }
  });
  $("[data-au-list]").addEventListener("change", (e) => {
    const input = (e.target as HTMLElement).closest<HTMLInputElement>("[data-report]");
    const id = input?.closest<HTMLElement>("[data-id]")?.dataset.id;
    if (input && id) patch(id, { report_url: input.value.trim() || null }, "Report link saved");
  });
  $("[data-au-filter]").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-f]");
    if (!b) return;
    stage = b.dataset.f!;
    document.querySelectorAll("[data-au-filter] [data-f]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    load().catch((x) => toast((x as Error).message));
  });
  let t = 0;
  $<HTMLInputElement>("[data-au-q]").addEventListener("input", (e) => {
    clearTimeout(t);
    t = window.setTimeout(() => {
      q = (e.target as HTMLInputElement).value.trim();
      load().catch(() => undefined);
    }, 250);
  });

  return {
    load,
    async badge() {
      try {
        const r = await api("/api/admin/audits?stage=open");
        setBadge(r.counts.todo + r.counts.in_progress, r.counts.overdue);
      } catch {
        /* optional */
      }
    },
  };
}
