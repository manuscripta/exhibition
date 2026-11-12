import { DelftExhibition, DelftPresentation, DelftSlideshow } from "exhibition-viewer";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Vault } from "@iiif/helpers";
import { LanguageProvider, VaultProvider } from "react-iiif-vault";
import { LANGUAGES, strings } from "./i18n.js";
import { collectionUrl, fetchJson, localised, manifestUrl, plainText, prepareForViewer, slugFromId } from "./iiif.js";

const MODES = ["grid", "slideshow", "presentation"];
const LANGUAGE_KEY = "exhibition-language";

// --- URL state: ?e={slug}&mode={mode}&lang={sv|en} -------------------------

function readLocation() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  return {
    slug: params.get("e"),
    preview: params.get("preview") === "1",
    mode: MODES.includes(mode) ? mode : "grid",
    lang: LANGUAGES.includes(params.get("lang")) ? params.get("lang") : null,
  };
}

function hrefFor({ slug, preview, mode, lang }) {
  const params = new URLSearchParams();
  if (preview) params.set("preview", "1");
  else if (slug) params.set("e", slug);
  if ((slug || preview) && mode && mode !== "grid") params.set("mode", mode);
  if (lang) params.set("lang", lang);
  const query = params.toString();
  return `${import.meta.env.BASE_URL}${query ? `?${query}` : ""}`;
}

function initialLanguage(fromUrl) {
  if (fromUrl) return fromUrl;
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (LANGUAGES.includes(stored)) return stored;
  } catch {
    // Storage may be unavailable (private mode); fall through to the default.
  }
  return "sv";
}

export function App() {
  const [location, setLocation] = useState(readLocation);
  const [lang, setLang] = useState(() => initialLanguage(location.lang));
  const t = strings[lang];

  useEffect(() => {
    const onPop = () => setLocation(readLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANGUAGE_KEY, lang);
    } catch {
      // Ignore: the language still works for this page view.
    }
  }, [lang]);

  const navigate = useCallback(
    (next) => {
      const target = { ...location, ...next };
      window.history.pushState(null, "", hrefFor({ ...target, lang }));
      setLocation(target);
      window.scrollTo(0, 0);
    },
    [location, lang],
  );

  const toggleLanguage = () => {
    const next = lang === "sv" ? "en" : "sv";
    setLang(next);
    window.history.replaceState(null, "", hrefFor({ ...location, lang: next }));
  };

  const onLinkClick = (e, next) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(next);
  };

  return (
    <div className={`app app--${location.slug || location.preview ? "exhibition" : "home"}`}>
      <header className="site-header">
        <a
          className="site-header__brand"
          href={hrefFor({ lang })}
          onClick={(e) => onLinkClick(e, { slug: null, preview: false, mode: "grid" })}
        >
          <span className="site-header__owner">{t.siteOwner}</span>
          <span className="site-header__title">{t.siteTitle}</span>
        </a>
        <nav className="site-header__tools" aria-label={t.modeLabel}>
          {location.slug || location.preview ? (
            <div className="mode-switch" role="group" aria-label={t.modeLabel}>
              {MODES.map((mode) => (
                <a
                  key={mode}
                  href={hrefFor({ ...location, mode, lang })}
                  aria-current={location.mode === mode ? "page" : undefined}
                  onClick={(e) => onLinkClick(e, { mode })}
                >
                  {t.modes[mode]}
                </a>
              ))}
            </div>
          ) : null}
          <button type="button" className="language-toggle" onClick={toggleLanguage} lang={lang === "sv" ? "en" : "sv"}>
            {t.language}
          </button>
        </nav>
      </header>
      <main>
        {location.preview ? (
          <PreviewPage mode={location.mode} lang={lang} t={t} />
        ) : location.slug ? (
          <ExhibitionPage key={location.slug} slug={location.slug} mode={location.mode} lang={lang} t={t} />
        ) : (
          <HomePage lang={lang} t={t} onOpen={(slug) => navigate({ slug, mode: "grid" })} />
        )}
      </main>
    </div>
  );
}

// --- Start page: the IIIF collection of all exhibitions --------------------

function HomePage({ lang, t, onOpen }) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchJson(collectionUrl())
      .then((collection) => !cancelled && setState({ status: "ready", collection }))
      .catch((error) => !cancelled && setState({ status: "error", error }));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.title = `${t.siteTitle} – ${t.siteOwner}`;
  }, [t]);

  return (
    <div className="home">
      <section className="home__intro">
        <h1>{t.siteTitle}</h1>
        <p>{t.intro}</p>
      </section>
      {state.status === "loading" ? <p className="status">{t.loading}</p> : null}
      {state.status === "error" ? (
        <p className="status status--error" role="alert">
          {t.listFailed}
        </p>
      ) : null}
      {state.status === "ready" && !state.collection.items?.length ? <p className="status">{t.empty}</p> : null}
      {state.status === "ready" ? (
        <ul className="cards">
          {state.collection.items.map((item) => {
            const slug = slugFromId(item.id);
            if (!slug) return null;
            const title = localised(item.label, lang);
            const thumb = item.thumbnail?.[0]?.id;
            return (
              <li key={item.id} className="card">
                <a
                  href={hrefFor({ slug, lang })}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    onOpen(slug);
                  }}
                >
                  <div className="card__image">{thumb ? <img src={thumb} alt="" loading="lazy" /> : null}</div>
                  <div className="card__body">
                    <h2>{title}</h2>
                    {item.summary ? <p>{plainText(localised(item.summary, lang))}</p> : null}
                    <span className="card__cta">{t.open} →</span>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
      <footer className="home__footer">
        <a href={collectionUrl()}>{t.iiif}</a>
      </footer>
    </div>
  );
}

// --- One exhibition, in the chosen viewer mode -----------------------------

function ExhibitionPage({ slug, mode, lang, t }) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchJson(manifestUrl(slug))
      .then((manifest) => !cancelled && setState({ status: "ready", manifest }))
      .catch((error) => !cancelled && setState({ status: "error", error }));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state.status === "loading") return <p className="status">{t.loading}</p>;
  if (state.status === "error") {
    return (
      <p className="status status--error" role="alert">
        {t.loadFailed}
      </p>
    );
  }
  return <ExhibitionView manifest={state.manifest} mode={mode} lang={lang} t={t} />;
}

// --- Preview of an unpublished draft, sent from the editor -----------------

// Only these origins may send drafts to preview. The viewer renders HTML from
// the manifest, so accepting messages from any page would let other sites put
// arbitrary content on this site.
const PREVIEW_ORIGINS = new Set(
  [
    window.location.origin,
    ...(import.meta.env.VITE_EDITOR_ORIGINS || "").split(","),
    ...(import.meta.env.DEV ? ["http://localhost:5174"] : []),
  ]
    .map((o) => o.trim())
    .filter(Boolean),
);
const PREVIEW_MESSAGE = "manuscripta-exhibition-preview";

function PreviewPage({ mode, lang, t }) {
  const [manifest, setManifest] = useState(null);

  useEffect(() => {
    function onMessage(event) {
      if (!PREVIEW_ORIGINS.has(event.origin)) return;
      if (event.data?.type !== PREVIEW_MESSAGE || event.data.manifest?.type !== "Manifest") return;
      setManifest(event.data.manifest);
    }
    window.addEventListener("message", onMessage);
    // Tell the editor that opened this window that we are ready for the draft.
    window.opener?.postMessage({ type: `${PREVIEW_MESSAGE}:ready` }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <>
      <p className="preview-banner" role="status">
        {t.previewBanner}
      </p>
      {manifest ? <ExhibitionView manifest={manifest} mode={mode} lang={lang} t={t} /> : <p className="status">{t.previewWaiting}</p>}
    </>
  );
}

// --- Rendering with exhibition-viewer ----------------------------------------

let viewRevision = 0;

function ExhibitionView({ manifest: published, mode, lang, t }) {
  const title = localised(published.label, lang);
  useEffect(() => {
    if (title) document.title = `${title} – ${t.siteTitle} – ${t.siteOwner}`;
  }, [title, t]);

  const content = useMemo(() => ({ exhibition: t.exhibition, tableOfContents: t.tableOfContents }), [t]);
  const manifest = useMemo(() => prepareForViewer(published, lang), [published, lang]);
  // The vault caches resources by id, so every language (and every new
  // preview of a draft) gets its own vault.
  const { vault, revision } = useMemo(() => ({ vault: new Vault(), revision: ++viewRevision }), [manifest]);

  // Re-mount the viewer when the content or language changes so every text block updates.
  const key = `${mode}-${revision}`;

  let viewer;
  if (mode === "slideshow") {
    viewer = <DelftSlideshow key={key} manifest={manifest} language={lang} viewObjectLinks={[]} content={content} />;
  } else if (mode === "presentation") {
    viewer = (
      <DelftPresentation
        key={key}
        manifest={manifest}
        customVault={vault}
        language={lang}
        viewObjectLinks={[]}
        options={{ cutCorners: false }}
      />
    );
  } else {
    viewer = (
      <DelftExhibition
        key={key}
        manifest={manifest}
        customVault={vault}
        language={lang}
        viewObjectLinks={[]}
        content={content}
        options={{ cutCorners: false, fullTitleBar: false }}
      />
    );
  }

  return (
    // The viewer's stylesheet scopes its utilities as `.exhibition-viewer .x`,
    // so the components need an `.exhibition-viewer` ancestor to lay out.
    <div className={`viewer exhibition-viewer ${mode === "grid" ? "viewer--grid" : "viewer--fill"}`}>
      {/* Not every viewer component applies its `language` prop to all of its texts. */}
      <VaultProvider key={key} vault={vault}>
        <LanguageProvider language={lang}>{viewer}</LanguageProvider>
      </VaultProvider>
    </div>
  );
}
