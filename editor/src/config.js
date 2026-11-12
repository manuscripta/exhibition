const BASE = new URL(import.meta.env.BASE_URL, window.location.href);

/** Where the public exhibition viewer runs. Used to open published exhibitions and for previews. */
export const VIEWER_URL = new URL(
  import.meta.env.VITE_VIEWER_URL || (import.meta.env.DEV ? "http://localhost:5173/" : "../"),
  BASE,
).href;

/** IIIF Collection of all manuscripta.se manuscripts (see scripts/build-manuscripta-collection.mjs). */
export const MANUSCRIPTA_COLLECTION_URL = new URL("manuscripta-collection.json", BASE).href;

export const PREVIEW_MESSAGE = "manuscripta-exhibition-preview";

/** Manifest Editor configuration (see Config in @manifest-editor/shell). */
export const editorConfig = {
  // Content is written in Swedish and English; Swedish first.
  i18n: {
    defaultLanguage: "sv",
    availableLanguages: ["sv", "en"],
    advancedLanguageMode: false,
  },
  creators: {
    // "Browse IIIF content" starts at the list of manuscripta manuscripts.
    "@manifest-editor/iiif-browser-creator": {
      defaultCollection: MANUSCRIPTA_COLLECTION_URL,
    },
  },
  // Previews are opened with our own button (the viewer app in preview mode).
  previews: [],
};
