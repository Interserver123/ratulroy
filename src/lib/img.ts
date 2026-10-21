import type { ImageMetadata } from "astro";

// All site images under src/assets/img, keyed by their path inside that folder,
// e.g. img("results/website/website-result-1.png"). Astro optimizes them at build time.
const all = import.meta.glob<{ default: ImageMetadata }>(
  "../assets/img/**/*.{png,jpg,jpeg,webp,svg}",
  { eager: true },
);

export function img(path: string): ImageMetadata {
  const hit = all[`../assets/img/${path}`];
  if (!hit) throw new Error(`Image not found: src/assets/img/${path}`);
  return hit.default;
}
