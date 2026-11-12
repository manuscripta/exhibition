// Shared by the viewer and the editor's preview: prepares a published
// exhibition manifest for the exhibition-viewer components.

/** Text of a IIIF language map in the preferred language, falling back sensibly. */
export function localised(value, lang) {
  if (!value) return "";
  if (typeof value === "string") return value;
  const order = [lang, "none", "sv", "en", ...Object.keys(value)];
  for (const l of order) if (value[l]?.length) return value[l].join(" ");
  return "";
}

const LANGUAGE_KEY = /^(none|[a-z]{2,3}(-[A-Za-z0-9]+)*)$/;

function isLanguageMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([k, v]) => LANGUAGE_KEY.test(k) && Array.isArray(v) && v.every((s) => typeof s === "string"));
}

/**
 * Reduce a manifest to one language: language maps keep only `lang` (when
 * present) and multilingual text bodies keep only the matching body.
 *
 * Not every exhibition-viewer component honours its `language` prop (in
 * 1.0.14 DelftPresentation ignores it and DelftSlideshow has no language
 * provider), so give them content with nothing else to choose from.
 */
export function selectLanguage(value, lang) {
  if (Array.isArray(value)) {
    const items = value.map((v) => selectLanguage(v, lang));
    const isTextBodies = items.length > 1 && items.every((b) => b && b.type === "TextualBody");
    if (isTextBodies && items.some((b) => b.language === lang)) {
      return items.filter((b) => b.language === lang || !b.language);
    }
    return items;
  }
  if (isLanguageMap(value)) {
    return value[lang]?.length ? { [lang]: value[lang] } : value;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, selectLanguage(v, lang)]));
  }
  return value;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * Append a link to the slide's `homepage` (the whole manuscript on
 * manuscripta.se) to its summary. exhibition-viewer 1.0.14 renders `seeAlso`
 * only in one view, but renders summaries as HTML in all of them.
 */
function withHomepageLink(canvas) {
  const homepage = canvas.homepage?.[0];
  if (!homepage?.id || !/^https?:\/\//.test(homepage.id)) return canvas;
  const summary = canvas.summary && Object.keys(canvas.summary).length ? canvas.summary : { sv: [""], en: [""] };
  const linked = {};
  for (const [lang, values] of Object.entries(summary)) {
    const text = localised(homepage.label, lang) || "manuscripta.se";
    const link = `<p class="exhibition-homepage-link"><a href="${escapeHtml(homepage.id)}">${escapeHtml(text)} →</a></p>`;
    linked[lang] = [`${(values || []).join("")}${link}`];
  }
  return { ...canvas, summary: linked };
}

/**
 * Prepare a published exhibition manifest for display: link each slide to
 * its manuscript and reduce everything to the chosen language.
 * The published manifest itself is unchanged.
 */
export function prepareForViewer(manifest, lang) {
  const withLinks = { ...manifest, items: (manifest.items || []).map(withHomepageLink) };
  return selectLanguage(withLinks, lang);
}
