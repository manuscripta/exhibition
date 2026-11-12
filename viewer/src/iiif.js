export { localised, prepareForViewer, selectLanguage } from "../../shared/viewer-manifest.js";

const BASE = import.meta.env.BASE_URL;

export const collectionUrl = () => `${BASE}iiif/collection.json`;
export const manifestUrl = (slug) => `${BASE}iiif/${encodeURIComponent(slug)}/manifest.json`;

/** Slug of a published exhibition from its manifest id (…/iiif/{slug}/manifest.json). */
export function slugFromId(id) {
  const m = String(id).match(/\/iiif\/([^/]+)\/manifest\.json$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Strip HTML from a summary for use in plain-text contexts (cards, meta tags). */
export function plainText(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || "";
}

export async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.json();
}
