// Strategy-call booking widget (book-strategy-call page). Talks to /api/booking/*.
type Pkg = { id: string; name: string; price: string; priceNote: string; minutes: number };
type Config = { packages: Pkg[]; whatsapp: string; email: string; title: string };

const root = document.querySelector<HTMLElement>("[data-booking]");
if (root) init(root);

function init(root: HTMLElement) {
  const cfg = JSON.parse(root.dataset.config ?? "{}") as Config;
  const $ = <T extends HTMLElement = HTMLElement>(s: string, el: ParentNode = root) => el.querySelector<T>(s)!;
  const $$ = <T extends HTMLElement = HTMLElement>(s: string, el: ParentNode = root) => [...el.querySelectorAll<T>(s)];
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const BD = "Asia/Dhaka";

  const state = {
    step: 1,
    pkg: cfg.packages.find((p) => p.id === (root.querySelector<HTMLInputElement>("input[name=package]:checked")?.value ?? "strategy")) ?? cfg.packages[0],
    slots: [] as string[],
    loadedFor: "",
    day: "",
    slot: "",
    month: 0, // offset from the first month with slots
  };

  // ---------- formatting ----------
  const dayKey = (iso: string, zone = tz) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const timeFmt = (iso: string, zone = tz) => new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const longDay = (key: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(key + "T12:00:00Z"));
  const fullWhen = (iso: string) =>
    `${new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso))}, ${timeFmt(iso)}` +
    (tz === BD ? " (Bangladesh time)" : ` (${tz.replace(/_/g, " ")})`);
  const tzLabel = tz === BD ? "Bangladesh time" : tz.replace(/_/g, " ");
  $("[data-tz]").textContent = tzLabel;

  // ---------- host panel (photo + message per step) ----------
  const hostImg: Record<number, string> = { 1: "phone", 2: "laptop", 3: "confident", 4: "confident" };
  function setHost(step: number) {
    document.querySelectorAll<HTMLElement>("[data-host-img]").forEach((im) => im.classList.toggle("is-on", im.dataset.hostImg === hostImg[step]));
    document.querySelectorAll<HTMLElement>("[data-host-say]").forEach((el) => (el.hidden = el.dataset.hostSay !== String(step)));
  }
  function setSummary() {
    const sum = document.querySelector<HTMLElement>("[data-summary]");
    if (!sum) return;
    sum.hidden = state.step < 2;
    document.querySelector("[data-sum-pkg]")!.textContent = `${state.pkg.name} · ${state.pkg.price}`;
    document.querySelector("[data-sum-when]")!.textContent = state.slot ? fullWhen(state.slot) : "Pick a time";
  }

  // ---------- steps ----------
  function go(step: number) {
    state.step = step;
    $$("[data-step]").forEach((p) => (p.hidden = p.dataset.step !== String(step)));
    $$("[data-step-tab]").forEach((t) => {
      const n = Number(t.dataset.stepTab);
      if (n === step) t.setAttribute("aria-current", "step");
      else t.removeAttribute("aria-current");
      t.classList.toggle("is-done", n < step);
    });
    setHost(step);
    setSummary();
    if (step === 2) loadSlots();
    if (step > 1) {
      const top = root.getBoundingClientRect().top + scrollY - 90;
      if (Math.abs(scrollY - top) > 200) scrollTo({ top, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  }
  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-next]")) go(state.step + 1);
    if (t.closest("[data-back]")) go(state.step - 1);
  });

  // ---------- step 1: package ----------
  function pickPackage(id: string) {
    const p = cfg.packages.find((x) => x.id === id);
    if (!p) return;
    state.pkg = p;
    const input = root.querySelector<HTMLInputElement>(`input[name=package][value="${id}"]`);
    if (input) input.checked = true;
    if (state.loadedFor !== id) {
      state.slot = "";
      state.day = "";
    }
    setSummary();
  }
  $$<HTMLInputElement>("input[name=package]").forEach((r) => r.addEventListener("change", () => pickPackage(r.value)));
  document.querySelectorAll<HTMLAnchorElement>("[data-pick]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      pickPackage(a.dataset.pick!);
      history.replaceState(null, "", `?package=${a.dataset.pick}#book`);
      go(2);
    }),
  );

  // ---------- step 2: calendar ----------
  const nextBtn2 = $<HTMLButtonElement>('[data-step="2"] [data-next]');
  const slotMsg = $("[data-slot-msg]");

  async function loadSlots(force = false) {
    if (!force && state.loadedFor === state.pkg.id && state.slots.length) return render();
    slotMsg.textContent = "Loading open times…";
    $("[data-days]").innerHTML = "";
    $("[data-times]").innerHTML = "";
    try {
      const res = await fetch(`/api/booking/slots?package=${encodeURIComponent(state.pkg.id)}`, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load times");
      state.slots = data.slots as string[];
      state.loadedFor = state.pkg.id;
      slotMsg.textContent = state.slots.length ? "" : "No open times in the next 30 days. Message me on WhatsApp and I'll find one.";
      if (state.slot && !state.slots.includes(state.slot)) state.slot = "";
      if (!state.day || !state.slots.some((s) => dayKey(s) === state.day)) state.day = state.slots[0] ? dayKey(state.slots[0]) : "";
      state.month = 0;
      render();
    } catch {
      slotMsg.innerHTML = `Couldn't load the calendar right now. <a href="${cfg.whatsapp}" target="_blank" rel="noopener">Book on WhatsApp instead</a>.`;
    }
  }

  function render() {
    const byDay = new Map<string, string[]>();
    for (const s of state.slots) {
      const k = dayKey(s);
      byDay.set(k, [...(byDay.get(k) ?? []), s]);
    }
    const keys = [...byDay.keys()].sort();
    const first = keys[0] ?? dayKey(new Date().toISOString());
    const last = keys[keys.length - 1] ?? first;
    const [fy, fm] = first.split("-").map(Number);
    const [ly, lm] = last.split("-").map(Number);
    const months = (ly - fy) * 12 + (lm - fm) + 1;
    state.month = Math.min(Math.max(0, state.month), months - 1);
    const y = fy + Math.floor((fm - 1 + state.month) / 12);
    const m = ((fm - 1 + state.month) % 12) + 1;

    $("[data-month-label]").textContent = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
    $<HTMLButtonElement>('[data-month="-1"]').disabled = state.month === 0;
    $<HTMLButtonElement>('[data-month="1"]').disabled = state.month >= months - 1;

    const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells: string[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(`<span></span>`);
    for (let dnum = 1; dnum <= daysIn; dnum++) {
      const k = `${y}-${String(m).padStart(2, "0")}-${String(dnum).padStart(2, "0")}`;
      const n = byDay.get(k)?.length ?? 0;
      cells.push(
        n
          ? `<button type="button" class="bk-day" data-open data-day="${k}" aria-pressed="${k === state.day}" aria-label="${longDay(k)}, ${n} open time${n > 1 ? "s" : ""}">${dnum}</button>`
          : `<span class="bk-day" aria-hidden="true">${dnum}</span>`,
      );
    }
    $("[data-days]").innerHTML = cells.join("");

    const list = $("[data-times]");
    const times = byDay.get(state.day) ?? [];
    $("[data-day-label]").textContent = state.day ? longDay(state.day) : "Choose a day";
    list.innerHTML = times
      .map(
        (s) =>
          `<button type="button" class="bk-time" role="option" data-slot="${s}" aria-selected="${s === state.slot}"><b>${timeFmt(s)}</b>${tz === BD ? "" : `<small>${timeFmt(s, BD)} BD</small>`}</button>`,
      )
      .join("");
    nextBtn2.disabled = !state.slot;
  }

  $("[data-calendar]").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const nav = t.closest<HTMLElement>("[data-month]");
    if (nav) {
      state.month += Number(nav.dataset.month);
      return render();
    }
    const day = t.closest<HTMLElement>("[data-day]");
    if (day) {
      state.day = day.dataset.day!;
      render();
    }
  });
  $("[data-times]").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-slot]");
    if (!b) return;
    state.slot = b.dataset.slot!;
    render();
    setSummary();
  });

  // ---------- step 3: submit ----------
  const form = $<HTMLFormElement>("[data-booking-form]");
  const formMsg = $("[data-form-msg]");

  function attribution(): Record<string, string> {
    const out: Record<string, string> = {};
    let stored: Record<string, string> = {};
    try {
      stored = JSON.parse(sessionStorage.getItem("rr_attr") || "{}");
    } catch {
      /* storage blocked */
    }
    const params = new URLSearchParams(location.search);
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      const v = stored[k] || params.get(k);
      if (v) out[k] = v.slice(0, 200);
    }
    out.referrer = (stored.referrer || document.referrer || "").slice(0, 500);
    return out;
  }
  const opened = Date.now();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formMsg.textContent = "";
    $$<HTMLInputElement>("input", form).forEach((i) => i.removeAttribute("aria-invalid"));
    const fd = new FormData(form);
    const missing = ["name", "email", "phone"].filter((k) => !String(fd.get(k) ?? "").trim());
    if (missing.length) {
      missing.forEach((k) => form.querySelector(`[name=${k}]`)?.setAttribute("aria-invalid", "true"));
      formMsg.textContent = "Please add your name, email and WhatsApp / phone number.";
      form.querySelector<HTMLInputElement>(`[name=${missing[0]}]`)?.focus();
      return;
    }
    if (!state.slot) return go(2);

    const body = {
      package: state.pkg.id,
      start: state.slot,
      timezone: tz,
      name: fd.get("name"),
      email: fd.get("email"),
      phone: fd.get("phone"),
      website: fd.get("website"),
      business: fd.get("business"),
      message: fd.get("message"),
      platform: fd.get("platform"),
      focus: fd.getAll("focus"),
      company_website: fd.get("company_website"),
      elapsed_ms: Date.now() - opened,
      page: location.pathname,
      ...attribution(),
    };
    const btn = form.querySelector<HTMLButtonElement>("[type=submit]")!;
    btn.disabled = true;
    try {
      const res = await fetch("/api/booking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        state.slot = "";
        await loadSlots(true);
        go(2);
        slotMsg.textContent = "Sorry, that time was just taken. Please pick another one.";
        return;
      }
      if (res.status === 422 && data.fields) {
        for (const k of Object.keys(data.fields)) form.querySelector(`[name=${k}]`)?.setAttribute("aria-invalid", "true");
        formMsg.textContent = Object.values(data.fields).join(". ");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      done(String(fd.get("name") ?? ""), String(fd.get("platform") ?? ""));
    } catch {
      const text = `Hi Ratul, I'd like to book a ${state.pkg.name} on ${fullWhen(state.slot)}. My name is ${fd.get("name")} (${fd.get("email")}).`;
      formMsg.innerHTML = `The booking system didn't respond. <a href="${cfg.whatsapp}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Send this booking on WhatsApp</a> instead.`;
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- step 4: confirmation ----------
  function done(name: string, platform: string) {
    const start = new Date(state.slot);
    const end = new Date(start.getTime() + state.pkg.minutes * 60_000);
    const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const title = `${state.pkg.name} with Ratul Roy (Local SEO)`;
    const details = `${state.pkg.name} (${state.pkg.price}). Ratul will confirm and send the ${platform.replace("-", " ")} link. WhatsApp: ${cfg.whatsapp}`;
    $<HTMLAnchorElement>("[data-gcal]").href =
      `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${stamp(start)}/${stamp(end)}&details=${encodeURIComponent(details)}`;
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//ratulroy.com//Strategy call//EN",
      "BEGIN:VEVENT",
      `UID:${stamp(start)}-${Math.random().toString(36).slice(2)}@ratulroy.com`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${details.replace(/[,;]/g, (c) => "\\" + c)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    $<HTMLAnchorElement>("[data-ics]").href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    $<HTMLAnchorElement>("[data-wa]").href = `${cfg.whatsapp}?text=${encodeURIComponent(`Hi Ratul, I just booked a ${state.pkg.name} for ${fullWhen(state.slot)}.`)}`;
    $("[data-done-text]").textContent =
      `Thanks${name ? `, ${name.split(" ")[0]}` : ""}! You asked for a ${state.pkg.name} on ${fullWhen(state.slot)}. ` +
      `I'll confirm on WhatsApp or email within a few hours${["intro", "done-for-you"].includes(state.pkg.id) ? "" : ", together with the payment link"}.`;
    go(4);
    $$("[data-step-tab]").forEach((t) => {
      t.classList.add("is-done");
      t.removeAttribute("aria-current");
    });
    $<HTMLElement>('[data-step="4"]').focus();
  }

  // A link like ?package=strategy#book opens straight on the calendar for that package.
  const fromUrl = new URLSearchParams(location.search).get("package");
  if (fromUrl && cfg.packages.some((p) => p.id === fromUrl)) {
    pickPackage(fromUrl);
    if (location.hash === "#book") return go(2);
  }
  setHost(1);
}
