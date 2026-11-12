import { DelftExhibition, DelftPresentation, DelftSlideshow } from "exhibition-viewer";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Vault } from "@iiif/helpers";
import { LanguageProvider, VaultProvider } from "react-iiif-vault";
import { LANGUAGES, strings } from "./i18n.js";
import { collectionUrl, fetchJson, localised, manifestUrl, plainText, prepareForViewer, slugFromId } from "./iiif.js";

const MODES = ["grid", "slideshow", "presentation"];
const MANUSCRIPTA = "https://www.manuscripta.se";
const ACCESSIBILITY_STATEMENT =
  "https://www.kb.se/om-oss/tillganglighet-pa-kbs-webbplatser-och-digitala-tjanster.html#item_125b5507eb18cedffd1a436125_45b5507eb18cedffd1a43227b";
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
      <nav className="navbar" aria-label={t.mainNavigation}>
        <div className="navbar__inner">
          <a className="navbar-brand" href={MANUSCRIPTA}>
            {t.nav.home}
          </a>
          <ul className="navbar-nav">
            <li>
              <a href={`${MANUSCRIPTA}/search`}>{t.nav.search}</a>
            </li>
            <li className="active">
              <a
                href={hrefFor({ lang })}
                aria-current={location.slug || location.preview ? undefined : "page"}
                onClick={(e) => onLinkClick(e, { slug: null, preview: false, mode: "grid" })}
              >
                {t.siteTitle}
              </a>
            </li>
            <li>
              <a href={`${MANUSCRIPTA}/contact`}>{t.nav.contact}</a>
            </li>
          </ul>
          <div className="navbar-right">
            {location.slug || location.preview ? (
              <div className="btn-group" role="group" aria-label={t.modeLabel}>
                {MODES.map((mode) => (
                  <a
                    key={mode}
                    className="btn btn-default btn-sm"
                    href={hrefFor({ ...location, mode, lang })}
                    aria-current={location.mode === mode ? "page" : undefined}
                    onClick={(e) => onLinkClick(e, { mode })}
                  >
                    {t.modes[mode]}
                  </a>
                ))}
              </div>
            ) : null}
            <button type="button" className="navbar-link" onClick={toggleLanguage} lang={lang === "sv" ? "en" : "sv"}>
              {t.language}
            </button>
          </div>
        </div>
      </nav>
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
    <div className="container">
      <h1 className="page-header">
        {t.siteOwner} <small>{t.siteTitle}</small>
      </h1>
      <p className="lead">{t.intro}</p>
      {state.status === "loading" ? <p className="status">{t.loading}</p> : null}
      {state.status === "error" ? (
        <p className="status status--error" role="alert">
          {t.listFailed}
        </p>
      ) : null}
      {state.status === "ready" && !state.collection.items?.length ? <p className="status">{t.empty}</p> : null}
      {state.status === "ready" ? (
        <ul className="panels">
          {state.collection.items.map((item) => {
            const slug = slugFromId(item.id);
            if (!slug) return null;
            const title = localised(item.label, lang);
            const thumb = item.thumbnail?.[0]?.id;
            const href = hrefFor({ slug, lang });
            const open = (e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              onOpen(slug);
            };
            return (
              <li key={item.id} className="panel">
                <div className="panel-heading">
                  <h2 className="panel-title">
                    <a href={href} onClick={open}>
                      {title}
                    </a>
                  </h2>
                </div>
                <div className="panel-body">
                  {thumb ? (
                    <a href={href} onClick={open} tabIndex={-1} aria-hidden="true" className="panel-image">
                      <img src={thumb} alt="" loading="lazy" />
                    </a>
                  ) : null}
                  {item.summary ? <p>{plainText(localised(item.summary, lang))}</p> : null}
                  <a href={href} onClick={open}>
                    {t.open} →
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      <footer className="footer">
        <div className="footer__logo">
          <img src={`${import.meta.env.BASE_URL}manuscripta/logo_kb.svg`} alt={t.kbLogoAlt} />
        </div>
        <ul className="footer__links">
          <li>
            <a href={ACCESSIBILITY_STATEMENT}>{t.accessibility}</a>
          </li>
          <li>
            <a href={collectionUrl()}>{t.iiif}</a>
          </li>
        </ul>
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
