import { Vault } from "@iiif/helpers";
import { exhibitionEditorPreset } from "manifest-editor/exhibition-preset";
import * as manifestPreset from "manifest-editor/manifest-preset";
import { AppProvider, Layout, ManifestPaginationNavigation, PluginProvider, ShellProvider, useSaveVault } from "manifest-editor/shell";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useManifest, VaultProvider } from "react-iiif-vault";
import { editorConfig, PREVIEW_MESSAGE, VIEWER_URL } from "./config.js";
import { getDraft, saveDraft } from "./drafts.js";
import { downloadJson, localised, slugify } from "./helpers.js";

const timeFormat = new Intl.DateTimeFormat("sv-SE", { timeStyle: "short" });

export function EditorPage({ draftId }) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getDraft(draftId).then(
      (draft) => {
        if (cancelled) return;
        if (!draft) return setState({ status: "missing" });
        const vault = new Vault();
        const loaded = vault.loadManifestSync(draft.manifest.id, draft.manifest);
        if (!loaded) return setState({ status: "invalid" });
        setState({ status: "ready", draft, vault, resource: { id: loaded.id, type: "Manifest" } });
      },
      (error) => !cancelled && setState({ status: "error", error }),
    );
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  if (state.status === "loading") return <p className="page-status">Laddar utkastet …</p>;
  if (state.status !== "ready") {
    return (
      <div className="page-status" role="alert">
        <p>
          {state.status === "missing"
            ? "Utkastet finns inte i den här webbläsaren."
            : state.status === "invalid"
              ? "Utkastet kunde inte läsas som ett IIIF-manifest."
              : `Något gick fel: ${state.error?.message}`}
        </p>
        <a href="#/">Till startsidan</a>
      </div>
    );
  }
  return <Editor draft={state.draft} vault={state.vault} resource={state.resource} />;
}

function Editor({ draft, vault, resource }) {
  const [lastSaved, setLastSaved] = useState(new Date(draft.updated));
  const [saveError, setSaveError] = useState(null);
  const preview = usePreviewWindow();

  const currentManifest = useCallback(() => vault.toPresentation3(resource), [vault, resource]);

  const onVaultChange = useCallback(() => {
    const manifest = currentManifest();
    saveDraft(draft.id, manifest).then(
      (saved) => {
        setLastSaved(new Date(saved.updated));
        setSaveError(null);
      },
      (e) => setSaveError(e.message),
    );
    preview.update(manifest);
  }, [currentManifest, draft.id, preview]);

  // Autosave to the browser one second after the last change.
  useSaveVault(vault, onVaultChange, 1000, true);

  const app = useMemo(() => exhibitionEditorPreset, []);

  const header = (
    <EditorHeader
      lastSaved={lastSaved}
      saveError={saveError}
      onPreview={() => preview.open(currentManifest())}
      onDownload={() => {
        const manifest = currentManifest();
        const fileName = draft.fileName || `${slugify(localised(manifest.label, "sv"))}.json`;
        downloadJson(manifest, fileName);
      }}
    />
  );

  return (
    <div className="editor">
      <VaultProvider vault={vault}>
        <PluginProvider plugins={manifestPreset.plugins || []}>
          <AppProvider appId="manifest-editor" definition={app} instanceId={draft.id}>
            <VaultProvider vault={vault}>
              <ShellProvider resource={resource} config={editorConfig}>
                <Layout header={header} />
              </ShellProvider>
            </VaultProvider>
          </AppProvider>
        </PluginProvider>
      </VaultProvider>
    </div>
  );
}

function EditorHeader({ lastSaved, saveError, onPreview, onDownload }) {
  const manifest = useManifest();
  const title = localised(manifest?.label, "sv") || "Namnlös utställning";

  return (
    <header className="editor-header">
      <a href="#/" className="editor-header__back" title="Alla utkast">
        ← Utkast
      </a>
      <span className="editor-header__title" title={title}>
        {title}
      </span>
      <ManifestPaginationNavigation className="editor-header__pagination" />
      <span className={`editor-header__status ${saveError ? "editor-header__status--error" : ""}`} role="status">
        {saveError ? `Kunde inte spara: ${saveError}` : `Sparat i webbläsaren ${timeFormat.format(lastSaved)}`}
      </span>
      <button type="button" className="button" onClick={onPreview}>
        Förhandsgranska
      </button>
      <button type="button" className="button button--primary" onClick={onDownload}>
        Ladda ner för publicering
      </button>
    </header>
  );
}

/**
 * Opens the public viewer in preview mode in another window and keeps it in
 * sync with the draft over postMessage (the viewer only accepts preview
 * messages from allowed editor origins).
 */
function usePreviewWindow() {
  const windowRef = useRef(null);
  const latest = useRef(null);
  const viewerOrigin = new URL(VIEWER_URL).origin;

  useEffect(() => {
    function onMessage(event) {
      if (event.origin !== viewerOrigin || event.source !== windowRef.current) return;
      if (event.data?.type === `${PREVIEW_MESSAGE}:ready` && latest.current) {
        windowRef.current.postMessage({ type: PREVIEW_MESSAGE, manifest: latest.current }, viewerOrigin);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [viewerOrigin]);

  return useMemo(
    () => ({
      open(manifest) {
        latest.current = manifest;
        const url = new URL(VIEWER_URL);
        url.searchParams.set("preview", "1");
        const existing = windowRef.current;
        if (existing && !existing.closed) {
          existing.postMessage({ type: PREVIEW_MESSAGE, manifest }, viewerOrigin);
          existing.focus();
        } else {
          windowRef.current = window.open(url.href, "manuscripta-exhibition-preview");
        }
      },
      update(manifest) {
        latest.current = manifest;
        const w = windowRef.current;
        if (w && !w.closed) w.postMessage({ type: PREVIEW_MESSAGE, manifest }, viewerOrigin);
      },
    }),
    [viewerOrigin],
  );
}
