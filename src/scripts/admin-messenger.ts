// Messenger tab of the lead desk. Talks only to /api/admin/messenger/*.
// Secrets are write-only: the server returns "set / not set" and the last 4 characters.
type Api = <T = any>(path: string, opts?: RequestInit) => Promise<T>;
type Helpers = { api: Api; toast: (m: string) => void; esc: (v: unknown) => string; when: (iso: unknown) => string };

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

export function mountMessenger({ api, toast, esc, when }: Helpers) {
  let status: any = null;
  let filter = "all";
  let current: string | null = null;
  let poll = 0;
  let logLevel = "";
  let sub = "inbox";

  const setPill = (group: string, attr: string, value: string) => $$(`${group} [${attr}]`).forEach((b) => b.setAttribute("aria-selected", String(b.getAttribute(attr) === value)));

  // ---------- status ----------
  async function loadStatus() {
    status = await api("/api/admin/messenger/settings");
    const s = status.settings;
    const sec = status.secrets;
    const on = s.bot_enabled === "1";
    const power = $("[data-mc-power]");
    power.setAttribute("aria-checked", String(on));
    $("[data-mc-power-label]").textContent = on ? "AI replies on" : "AI replies off";

    const pageCard = $("[data-mc-page]").parentElement!;
    $("[data-mc-page]").textContent = s.meta_page_name || (sec.meta_page_token.set ? "Token saved" : "Not connected");
    $("[data-mc-page-sub]").textContent = !sec.meta_page_token.set
      ? "Add your Page token in Settings"
      : !sec.meta_app_secret.set
        ? "App secret missing: events will be rejected"
        : s.meta_page_name
          ? `Page ID ${s.meta_page_id}`
          : "Run “Test connection” in Settings";
    pageCard.classList.toggle("is-ok", !!s.meta_page_name && sec.meta_app_secret.set);
    pageCard.classList.toggle("is-bad", !sec.meta_page_token.set || !sec.meta_app_secret.set);

    const aiCard = $("[data-mc-model]").parentElement!;
    $("[data-mc-model]").textContent = s.ai_model || "–";
    $("[data-mc-model-sub]").textContent = sec.openrouter_key.set ? `OpenRouter key ${sec.openrouter_key.hint}` : "OpenRouter key missing";
    aiCard.classList.toggle("is-ok", sec.openrouter_key.set);
    aiCard.classList.toggle("is-bad", !sec.openrouter_key.set);

    const kb = status.kb;
    const kbCard = $("[data-mc-kb]").parentElement!;
    $("[data-mc-kb]").textContent = `${kb.pages ?? 0} pages`;
    $("[data-mc-kb-sub]").textContent = kb.lastScanAt ? `${kb.chunks} sections · scanned ${when(kb.lastScanAt)}` : "Never scanned: open Knowledge & test";
    kbCard.classList.toggle("is-ok", kb.pages > 0);
    kbCard.classList.toggle("is-bad", !kb.pages);

    const c = status.counts ?? {};
    $("[data-mc-human]").textContent = String(c.human ?? 0);
    $("[data-mc-human-sub]").textContent = `${c.unread ?? 0} unread · ${c.errors24h ?? 0} errors today`;
    badge(c.human ?? 0);
    fillSettings();
    renderScans(kb.scans ?? []);
  }

  function badge(n: number) {
    $("[data-badge-mc]").textContent = n ? String(n) : "";
  }

  $("[data-mc-power]").addEventListener("click", async () => {
    const on = $("[data-mc-power]").getAttribute("aria-checked") !== "true";
    if (on && status) {
      const sec = status.secrets;
      const missing = [!sec.meta_page_token.set && "Page access token", !sec.meta_app_secret.set && "App secret", !sec.openrouter_key.set && "OpenRouter key", !status.kb.pages && "a website scan"].filter(Boolean);
      if (missing.length) return toast(`Add ${missing.join(", ")} first`);
    }
    try {
      await api("/api/admin/messenger/settings", { method: "PUT", body: JSON.stringify({ bot_enabled: on }) });
      toast(on ? "AI replies are on" : "AI replies paused");
      await loadStatus();
    } catch (x) {
      toast((x as Error).message);
    }
  });

  // ---------- sub tabs ----------
  function setSub(name: string) {
    sub = name;
    setPill(".mc-subtabs", "data-mc-sub", name);
    $$("[data-mc-panel]").forEach((p) => (p.hidden = p.dataset.mcPanel !== name));
    if (name === "inbox") loadConvs();
    if (name === "logs") loadLogs();
  }
  $$("[data-mc-sub]").forEach((b) => b.addEventListener("click", () => setSub(b.dataset.mcSub!)));

  // ---------- inbox ----------
  async function loadConvs() {
    const r = await api(`/api/admin/messenger/conversations?filter=${filter}`);
    const ul = $("[data-mc-convs]");
    const rows = r.conversations as any[];
    ul.innerHTML = rows.length
      ? rows
          .map(
            (c) => `<li><button type="button" data-psid="${esc(c.psid)}" aria-current="${c.psid === current}">
        <span class="ov-av">${esc((c.name || "?").slice(0, 1))}</span>
        <span><b>${esc(c.name || "Messenger user")}</b><small>${esc(c.last_preview ?? "")}</small></span>
        <span class="r"><small>${esc(when(c.last_message_at))}</small>${c.mode === "human" ? '<span class="adm-badge adm-badge--new">You</span>' : '<span class="adm-badge adm-badge--qualified">AI</span>'}${c.unread ? `<span class="mc-unread">${c.unread}</span>` : ""}</span>
      </button></li>`,
          )
          .join("")
      : `<li class="ov-empty">${filter === "all" ? "No messages yet. When someone messages your Page they appear here." : "Nothing here."}</li>`;
  }
  $("[data-mc-filter]").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-f]");
    if (!b) return;
    filter = b.dataset.f!;
    setPill("[data-mc-filter]", "data-f", filter);
    loadConvs();
  });
  $("[data-mc-convs]").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-psid]");
    if (b) openThread(b.dataset.psid!);
  });

  const SOURCE: Record<string, string> = { user: "Customer", ai: "AI", human: "You", page_inbox: "You (Facebook inbox)", system: "Automatic" };
  const WINDOW: Record<string, string> = {
    open: "Reply window open (24 h)",
    human_agent: "Over 24 h: sent with the Human Agent tag (needs Meta approval)",
    closed: "Over 7 days: wait for them to message again",
  };

  async function openThread(psid: string, keepScroll = false) {
    current = psid;
    const r = await api(`/api/admin/messenger/conversations/${psid}`);
    const c = r.conversation;
    const box = $("[data-mc-thread]");
    const prev = box.querySelector(".mc-msgs")?.scrollTop;
    const draft = box.querySelector<HTMLTextAreaElement>("textarea")?.value ?? "";
    box.innerHTML = `
      <div class="mc-thead">
        <div><h2>${esc(c.name || "Messenger user")}</h2><small class="adm-muted">${c.mode === "human" ? `You're handling this${c.handoff_reason ? ` · ${esc(c.handoff_reason)}` : ""}` : "AI is replying"} · ${esc(WINDOW[r.window])}</small></div>
        <button class="adm-btn adm-btn--pill" type="button" data-mc-mode="${c.mode === "human" ? "ai" : "human"}">${c.mode === "human" ? "Let AI reply again" : "Take over"}</button>
      </div>
      <div class="mc-msgs">${(r.messages as any[])
        .map((m) => {
          const meta = JSON.parse(m.meta || "{}");
          const cls = m.direction === "in" ? "mc-msg--in" : `mc-msg--out ${m.source === "ai" ? "mc-msg--ai" : m.source === "system" ? "mc-msg--system" : ""} ${m.status === "failed" ? "mc-msg--failed" : ""}`;
          const src = meta.sources?.length
            ? `<details><summary>Based on ${meta.sources.length} page${meta.sources.length > 1 ? "s" : ""}</summary>${meta.sources.map((s: any) => `<div><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}${s.heading ? ` › ${esc(s.heading)}` : ""}</a></div>`).join("")}</details>`
            : "";
          const att = (meta.attachments ?? []).filter((a: any) => a.url).map((a: any) => `<div><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">Open ${esc(a.type)}</a></div>`).join("");
          const failed = m.status === "failed" ? `<small>Not delivered: ${esc(meta.error ?? "error")}</small>` : "";
          return `<div class="mc-msg ${cls}">${esc(m.text ?? "")}${att}${src}${failed}<small>${esc(SOURCE[m.source] ?? m.source)} · ${esc(when(m.created_at))}${meta.tag ? " · Human Agent tag" : ""}</small></div>`;
        })
        .join("")}</div>
      <form class="mc-reply" data-mc-reply>
        <textarea name="text" rows="3" placeholder="${r.window === "closed" ? "Meta doesn't allow a reply until they write again" : "Write a reply. Sending it pauses the AI in this chat."}" ${r.window === "closed" ? "disabled" : ""} required></textarea>
        <div class="mc-reply__row"><small class="adm-muted">Sent from your Page through Messenger.</small><button class="adm-btn adm-btn--dark" type="submit" ${r.window === "closed" ? "disabled" : ""}>Send</button></div>
      </form>`;
    const msgs = $(".mc-msgs", box);
    msgs.scrollTop = keepScroll && prev !== undefined ? prev : msgs.scrollHeight;
    if (draft) $<HTMLTextAreaElement>("textarea", box).value = draft;
    $$("[data-mc-convs] [data-psid]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.psid === psid)));
    if (!keepScroll && window.innerWidth < 900) box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("[data-mc-thread]").addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-mc-mode]");
    if (!b || !current) return;
    try {
      await api(`/api/admin/messenger/conversations/${current}`, { method: "PATCH", body: JSON.stringify({ mode: b.dataset.mcMode }) });
      toast(b.dataset.mcMode === "ai" ? "AI will reply in this chat" : "You've taken over this chat");
      await Promise.all([openThread(current), loadConvs(), loadStatus()]);
    } catch (x) {
      toast((x as Error).message);
    }
  });
  $("[data-mc-thread]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    if (!f.matches("[data-mc-reply]") || !current) return;
    const btn = f.querySelector("button")!;
    btn.disabled = true;
    try {
      const r = await api(`/api/admin/messenger/conversations/${current}`, { method: "POST", body: JSON.stringify({ text: new FormData(f).get("text") }) });
      f.reset();
      toast(r.tag ? "Sent with the Human Agent tag" : "Sent");
      await Promise.all([openThread(current), loadConvs()]);
    } catch (x) {
      toast((x as Error).message);
      btn.disabled = false;
    }
  });

  // ---------- knowledge base ----------
  function renderScans(scans: any[]) {
    $("[data-mc-scans]").innerHTML = scans.length
      ? scans
          .map(
            (s) =>
              `<tr><td>${esc(when(s.started_at))}</td><td>${s.trigger === "schedule" ? "Daily" : "Manual"}</td><td><span class="adm-badge ${s.status === "done" ? "adm-badge--won" : s.status === "failed" ? "adm-badge--new" : "adm-badge--contacted"}">${esc(s.status)}</span>${s.error ? ` <small class="adm-muted">${esc(s.error)}</small>` : ""}</td><td>${s.pages_ok}/${s.total}${s.pages_failed ? ` <small class="adm-overdue">${s.pages_failed} failed</small>` : ""}</td><td>${s.chunks}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="adm-empty">No scans yet. Press “Rescan website”.</td></tr>`;
  }

  $("[data-mc-scan]").addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const bar = $("[data-mc-progress]");
    btn.disabled = true;
    bar.hidden = false;
    try {
      let r = await api("/api/admin/messenger/kb", { method: "POST", body: JSON.stringify({ action: "start" }) });
      for (let i = 0; i < 60 && r.scan.status === "running"; i++) {
        $("span", bar).style.setProperty("--w", `${Math.round((r.scan.done / r.scan.total) * 100)}%`);
        $("[data-mc-progress-label]").textContent = `Reading pages ${r.scan.done} of ${r.scan.total}…`;
        r = await api("/api/admin/messenger/kb", { method: "POST", body: JSON.stringify({ action: "step" }) });
      }
      $("span", bar).style.setProperty("--w", "100%");
      $("[data-mc-progress-label]").textContent =
        r.scan.status === "done" ? `Done: ${r.scan.total - r.scan.failed} pages, ${r.scan.chunks} sections indexed` : `Scan failed: ${r.scan.error ?? "see Activity log"}`;
      await loadStatus();
    } catch (x) {
      $("[data-mc-progress-label]").textContent = (x as Error).message;
    } finally {
      btn.disabled = false;
    }
  });

  $("[data-mc-search]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = String(new FormData(e.target as HTMLFormElement).get("q") ?? "").trim();
    if (!q) return;
    const r = await api(`/api/admin/messenger/kb?q=${encodeURIComponent(q)}`);
    $("[data-mc-hits]").innerHTML = (r.hits ?? []).length
      ? r.hits
          .map((h: any) => `<li><b>${esc(h.title)}${h.heading ? ` › ${esc(h.heading)}` : ""}</b>${esc(h.content.slice(0, 220))}…<br /><a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.url)}</a></li>`)
          .join("")
      : `<li>No match. The assistant would say it doesn't know and offer you.</li>`;
  });

  $("[data-mc-test]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const out = $("[data-mc-test-out]");
    const btn = f.querySelector("button")!;
    btn.disabled = true;
    out.innerHTML = `<p class="adm-muted">Thinking…</p>`;
    try {
      const r = await api("/api/admin/messenger/test-ai", { method: "POST", body: JSON.stringify({ message: new FormData(f).get("message") }) });
      const hand = r.handoff === "now" ? "Hands over to you" : r.handoff === "suggest" ? "Offers a “Talk to Ratul” button" : "Answers on its own";
      out.innerHTML = `<div class="mc-answer">${esc(r.reply)}</div>
        <p class="mc-meta">${esc(hand)} · language: ${esc(r.lang)} · ${esc(r.model)} · ${(r.ms / 1000).toFixed(1)} s<br />Searched for: “${esc(r.search)}”${r.guarded ? `<br /><b class="adm-overdue">${esc(r.guarded)}</b>` : ""}</p>
        <ul class="mc-hits">${(r.sources ?? []).map((s: any) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}${s.heading ? ` › ${esc(s.heading)}` : ""}</a></li>`).join("")}</ul>`;
    } catch (x) {
      out.innerHTML = `<p class="mc-result is-bad">${esc((x as Error).message)}</p>`;
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- settings ----------
  const form = $<HTMLFormElement>("[data-mc-settings]");
  function fillSettings() {
    if (!status) return;
    const s = status.settings;
    $<HTMLInputElement>("[data-mc-webhook]").value = status.webhookUrl;
    $<HTMLInputElement>("[data-mc-verify]").value = status.verifyToken;
    $("[data-mc-nokey]").hidden = status.canEncrypt;
    for (const el of $$<HTMLInputElement | HTMLTextAreaElement>("[name]", form)) {
      if (el.name.startsWith("secret:") || el === document.activeElement) continue;
      if (el instanceof HTMLInputElement && el.type === "checkbox") el.checked = s[el.name] === "1";
      else if (el.name in s) el.value = s[el.name] ?? "";
    }
    for (const tag of $$("[data-secret]", form)) {
      const st = status.secrets[tag.dataset.secret!];
      tag.textContent = st.source === "env" ? `Set in Cloudflare ${st.hint}` : st.set ? `Saved ${st.hint}` : st.source === "unreadable" ? "Re-enter (key changed)" : "Not set";
      tag.className = `mc-secret ${st.set ? "is-set" : st.source === "unreadable" ? "is-bad" : ""}`;
      const input = form.querySelector<HTMLInputElement>(`[name="secret:${tag.dataset.secret}"]`)!;
      input.disabled = st.source === "env";
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body: Record<string, unknown> = { secrets: {} };
    for (const el of $$<HTMLInputElement | HTMLTextAreaElement>("[name]", form)) {
      if (el.name.startsWith("secret:")) {
        if (el.value.trim()) (body.secrets as Record<string, string>)[el.name.slice(7)] = el.value.trim();
      } else if (el instanceof HTMLInputElement && el.type === "checkbox") body[el.name] = el.checked;
      else body[el.name] = el.value;
    }
    const btn = form.querySelector<HTMLButtonElement>("[type=submit]")!;
    btn.disabled = true;
    try {
      await api("/api/admin/messenger/settings", { method: "PUT", body: JSON.stringify(body) });
      $$<HTMLInputElement>("[name^='secret:']", form).forEach((i) => (i.value = ""));
      toast("Settings saved");
      await loadStatus();
    } catch (x) {
      toast((x as Error).message);
    } finally {
      btn.disabled = false;
    }
  });

  $$("[data-mc-conn]").forEach((b) =>
    b.addEventListener("click", async () => {
      const out = $("[data-mc-conn-out]");
      out.className = "mc-result";
      out.textContent = "Asking Meta…";
      try {
        const r = await api("/api/admin/messenger/connection", { method: "POST", body: JSON.stringify({ action: b.dataset.mcConn }) });
        const list = r.subscribedApps as any[] | null;
        const apps = list ? list.map((a) => `${a.name} (${(a.subscribed_fields ?? []).join(", ") || "no fields"})`).join("; ") : null;
        out.className = "mc-result is-ok";
        out.textContent =
          `Connected to ${r.page.name} (Page ID ${r.page.id}).` +
          (r.scopes ? `\nPermissions: ${r.scopes.join(", ")}` : "") +
          (apps === null ? "" : `\nApps receiving this Page's messages: ${apps || "none yet: press “Subscribe Page to webhook”"}`);
        await loadStatus();
      } catch (x) {
        out.className = "mc-result is-bad";
        out.textContent = (x as Error).message;
      }
    }),
  );

  $("[data-mc-models-btn]").addEventListener("click", async () => {
    const out = $("[data-mc-models-out]");
    out.className = "mc-result";
    out.textContent = "Loading the OpenRouter model list…";
    try {
      const r = await api("/api/admin/messenger/test-ai");
      const ids = (r.models as { id: string }[]).map((m) => m.id);
      $("[data-mc-models]").innerHTML = ids.map((id) => `<option value="${esc(id)}"></option>`).join("");
      const want = $<HTMLInputElement>("[name=ai_model]", form).value.trim();
      const ok = ids.includes(want);
      out.className = `mc-result ${ok ? "is-ok" : "is-bad"}`;
      out.textContent = ok ? `“${want}” is available on OpenRouter.` : `“${want}” was not found. Start typing in the Model box to pick one of ${ids.length} models.`;
    } catch (x) {
      out.className = "mc-result is-bad";
      out.textContent = (x as Error).message;
    }
  });

  document.addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-copy]");
    if (!b) return;
    const v = $<HTMLInputElement>(b.dataset.copy!).value;
    try {
      await navigator.clipboard.writeText(v);
      toast("Copied");
    } catch {
      $<HTMLInputElement>(b.dataset.copy!).select();
    }
  });

  // ---------- logs ----------
  async function loadLogs() {
    const r = await api(`/api/admin/messenger/logs${logLevel ? `?level=${logLevel}` : ""}`);
    $("[data-mc-logs]").innerHTML = (r.logs as any[]).length
      ? r.logs
          .map(
            (l: any) =>
              `<li><span class="mc-lv mc-lv--${esc(l.level)}">${esc(l.level)}</span><time>${esc(when(l.created_at))}</time><span><b>${esc(l.scope)}</b> · ${esc(l.message)}</span>${l.data ? `<pre>${esc(l.data)}</pre>` : ""}</li>`,
          )
          .join("")
      : `<li class="ov-empty">Nothing logged yet.</li>`;
  }
  $("[data-mc-loglevel]").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-l]");
    if (!b) return;
    logLevel = b.dataset.l!;
    setPill("[data-mc-loglevel]", "data-l", logLevel);
    loadLogs();
  });
  $("[data-mc-logs-refresh]").addEventListener("click", loadLogs);

  // ---------- lifecycle ----------
  return {
    async open() {
      await loadStatus();
      setSub(sub);
      window.clearInterval(poll);
      poll = window.setInterval(() => {
        if (document.hidden || $("[data-tab=messenger]").hidden) return;
        if (sub === "inbox") {
          loadConvs();
          if (current && !$<HTMLTextAreaElement>("[data-mc-reply] textarea").value) openThread(current, true);
        }
      }, 15000);
    },
    close() {
      window.clearInterval(poll);
    },
    async badge() {
      try {
        const r = await api("/api/admin/messenger/conversations?filter=human");
        badge(r.conversations.length);
      } catch {
        /* the tab still works without the badge */
      }
    },
  };
}
