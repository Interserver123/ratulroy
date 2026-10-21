// Site-wide interactions. Every effect is an enhancement: content is in the HTML
// and readable without this script (and the layout reveals everything if it fails).
declare global {
  interface Window {
    __motion?: boolean;
  }
}
window.__motion = true;

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 1. Reveal on scroll
const revealEls = document.querySelectorAll<HTMLElement>("[data-reveal]");
if (reduce || !("IntersectionObserver" in window)) {
  revealEls.forEach((el) => el.classList.add("is-in"));
} else {
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      }),
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  revealEls.forEach((el) => io.observe(el));
  // Fast flings can skip an element entirely; reveal anything already scrolled past.
  let pending = false;
  const sweep = () => {
    pending = false;
    const limit = window.innerHeight;
    revealEls.forEach((el) => {
      if (!el.classList.contains("is-in") && el.getBoundingClientRect().top < limit) {
        el.classList.add("is-in");
        io.unobserve(el);
      }
    });
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!pending) {
        pending = true;
        setTimeout(sweep, 150);
      }
    },
    { passive: true },
  );
}

// 2. Count-up numbers: <span data-count>1.4M+</span> keeps its real text in HTML.
const countEls = document.querySelectorAll<HTMLElement>("[data-count]");
const animateCount = (el: HTMLElement) => {
  const text = el.textContent ?? "";
  const m = text.match(/^([^\d]*)([\d.,]+)(.*)$/);
  if (!m) return;
  const [, pre, num, post] = m;
  const target = parseFloat(num.replace(/,/g, ""));
  const decimals = (num.split(".")[1] ?? "").length;
  const hasComma = num.includes(",");
  const start = performance.now();
  const dur = 1400;
  const step = (t: number) => {
    const p = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    let v = (target * eased).toFixed(decimals);
    if (hasComma) v = Number(v).toLocaleString("en-US");
    el.textContent = pre + v + post;
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = text;
  };
  requestAnimationFrame(step);
};
if (!reduce && "IntersectionObserver" in window) {
  const co = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          animateCount(e.target as HTMLElement);
          co.unobserve(e.target);
        }
      }),
    { threshold: 0.6 },
  );
  countEls.forEach((el) => co.observe(el));
}

// 3. Rotating words: all words are in the HTML; we just cycle which one is shown.
document.querySelectorAll<HTMLElement>("[data-rotator]").forEach((root) => {
  const words = [...root.querySelectorAll<HTMLElement>("[data-word]")];
  if (words.length < 2 || reduce) return;
  let i = 0;
  root.classList.add("is-live");
  words[0].classList.add("is-on");
  setInterval(() => {
    words[i].classList.remove("is-on");
    words[i].classList.add("is-off");
    const prev = words[i];
    setTimeout(() => prev.classList.remove("is-off"), 600);
    i = (i + 1) % words.length;
    words[i].classList.add("is-on");
  }, 2400);
});

// 4. Scroll-highlighted statement: words darken as the paragraph scrolls through view.
document.querySelectorAll<HTMLElement>("[data-highlight]").forEach((el) => {
  if (reduce) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const spans: HTMLElement[] = [];
  nodes.forEach((node) => {
    const frag = document.createDocumentFragment();
    node.textContent!.split(/(\s+)/).forEach((part) => {
      if (!part.trim()) return frag.append(part);
      const s = document.createElement("span");
      s.className = "hl-word";
      s.textContent = part;
      spans.push(s);
      frag.append(s);
    });
    node.replaceWith(frag);
  });
  el.classList.add("is-live");
  let ticking = false;
  const update = () => {
    ticking = false;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
    const lit = Math.round(p * spans.length);
    spans.forEach((s, i) => s.classList.toggle("on", i < lit));
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
});

// 5. Cursor spotlight on cards (desktop pointers only)
if (!reduce && window.matchMedia("(pointer: fine)").matches) {
  document.querySelectorAll<HTMLElement>("[data-spot]").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });
}

// 6. Header state on scroll
const header = document.querySelector<HTMLElement>(".header");
if (header) {
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

export {};
