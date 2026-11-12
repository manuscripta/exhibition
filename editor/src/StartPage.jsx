import { useEffect, useRef, useState } from "react";
import { VIEWER_URL } from "./config.js";
import { deleteDraft, listDrafts, newDraftId, saveDraft } from "./drafts.js";
import { blankExhibition, localised, navigate, readJsonFile } from "./helpers.js";

const dateFormat = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

export function StartPage() {
  const [drafts, setDrafts] = useState(null);
  const [published, setPublished] = useState({ status: "loading", items: [] });
  const [error, setError] = useState(null);
  const fileInput = useRef(null);

  const refresh = () => listDrafts().then(setDrafts, (e) => setError(`Kunde inte läsa utkasten: ${e.message}`));

  useEffect(() => {
    document.title = "Utställningsredigeraren – manuscripta.se";
    refresh();
    fetch(new URL("iiif/collection.json", VIEWER_URL))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((c) => setPublished({ status: "ready", items: c.items || [] }))
      .catch(() => setPublished({ status: "error", items: [] }));
  }, []);

  async function openNew(manifest, extra = {}) {
    if (manifest?.type !== "Manifest") {
      setError("Filen är inte ett IIIF Presentation 3-manifest.");
      return;
    }
    const id = newDraftId();
    await saveDraft(id, manifest, extra);
    navigate(`/edit/${id}`);
  }

  async function createBlank() {
    const id = newDraftId();
    await saveDraft(id, blankExhibition(id));
    navigate(`/edit/${id}`);
  }

  async function openFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await openNew(await readJsonFile(file), { fileName: file.name });
    } catch (e) {
      setError(`Kunde inte läsa filen: ${e.message}`);
    }
  }

  async function openPublished(item) {
    try {
      // Resolve against the viewer we are talking to, whatever base URL the ids were published with.
      const slug = item.id.match(/\/iiif\/([^/]+)\/manifest\.json$/)?.[1];
      if (!slug) throw new Error("okänd adress");
      const resp = await fetch(new URL(`iiif/${slug}/manifest.json`, VIEWER_URL));
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await openNew(await resp.json(), { fileName: `${slug}.json` });
    } catch (e) {
      setError(`Kunde inte öppna utställningen: ${e.message}`);
    }
  }

  async function remove(draft) {
    if (!window.confirm(`Ta bort utkastet ”${localised(draft.manifest?.label, "sv") || draft.id}”? Det går inte att ångra.`)) return;
    await deleteDraft(draft.id);
    refresh();
  }

  return (
    <div className="start">
      <header className="start__header">
        <span className="start__brand">manuscripta.se</span>
        <span>Utställningsredigeraren</span>
        <a className="start__viewer-link" href={VIEWER_URL} target="_blank" rel="noreferrer">
          Visa utställningarna ↗
        </a>
      </header>

      <main className="start__main">
        <h1>Utställningar</h1>
        <p className="start__lead">
          Skapa en utställning med bilder från manuscripta.se. Arbetet sparas automatiskt i den här webbläsaren. När
          utställningen är klar laddar du ner den och lämnar den för publicering.
        </p>

        {error ? (
          <p className="start__error" role="alert">
            {error}{" "}
            <button type="button" className="link" onClick={() => setError(null)}>
              Stäng
            </button>
          </p>
        ) : null}

        <div className="start__actions">
          <button type="button" className="button button--primary" onClick={createBlank}>
            Ny utställning
          </button>
          <button type="button" className="button" onClick={() => fileInput.current?.click()}>
            Öppna fil …
          </button>
          <input ref={fileInput} type="file" accept=".json,application/json,application/ld+json" hidden onChange={openFile} />
        </div>

        <section>
          <h2>Mina utkast</h2>
          {drafts === null ? <p className="muted">Laddar …</p> : null}
          {drafts?.length === 0 ? <p className="muted">Inga utkast i den här webbläsaren ännu.</p> : null}
          {drafts?.length ? (
            <ul className="list">
              {drafts.map((d) => (
                <li key={d.id} className="list__item">
                  <a href={`#/edit/${d.id}`} className="list__title">
                    {localised(d.manifest?.label, "sv") || "Namnlös utställning"}
                  </a>
                  <span className="muted">
                    {d.manifest?.items?.length ?? 0} bilder · ändrad {dateFormat.format(new Date(d.updated))}
                  </span>
                  <button type="button" className="link link--danger" onClick={() => remove(d)}>
                    Ta bort
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section>
          <h2>Publicerade utställningar</h2>
          <p className="muted">Öppna en publicerad utställning för att ändra i den. Ändringarna blir ett nytt utkast.</p>
          {published.status === "loading" ? <p className="muted">Laddar …</p> : null}
          {published.status === "error" ? <p className="muted">Kunde inte hämta listan från {VIEWER_URL}.</p> : null}
          {published.items.length ? (
            <ul className="list">
              {published.items.map((item) => (
                <li key={item.id} className="list__item">
                  <span className="list__title">{localised(item.label, "sv")}</span>
                  <button type="button" className="link" onClick={() => openPublished(item)}>
                    Redigera
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="start__help">
          <h2>Så publiceras en utställning</h2>
          <ol>
            <li>
              Välj <strong>Ladda ner för publicering</strong> i redigeraren. Du får en JSON-fil.
            </li>
            <li>
              Lägg filen i mappen <code>exhibitions/</code> i utställningsrepot (eller skicka den till den som publicerar).
              Filnamnet blir utställningens adress.
            </li>
            <li>Utställningen kontrolleras automatiskt och publiceras.</li>
          </ol>
        </section>
      </main>
    </div>
  );
}
