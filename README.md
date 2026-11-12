# manuscripta exhibitions

Stand-alone IIIF exhibitions built from the manuscripts on [manuscripta.se](https://www.manuscripta.se).

- **Viewer** (`viewer/`): the public site. It lists the exhibitions and shows each one as a scrolling exhibition, a slideshow or a presentation, in Swedish or English. It is built on Digirati's [`exhibition-viewer`](https://www.npmjs.com/package/exhibition-viewer).
- **Editor** (`editor/`): where curators build exhibitions in the browser. It is the open-source [Manifest Editor](https://github.com/digirati-co-uk/iiif-manifest-editor) with its exhibition preset.
- **Exhibitions** (`exhibitions/*.json`): one IIIF Presentation 3 manifest per exhibition, as saved from the editor.

Nothing here runs inside the manuscripta eXist app. Both apps are static sites that read manuscripta's public IIIF over HTTP. Its manifests are at `https://www.manuscripta.se/iiif/{id}/manifest.json`, and its images come from `iiif.manuscripta.se`, `data.kb.se` and `alvin-portal.org`. All of these send `Access-Control-Allow-Origin: *`.

```
 curator ──► editor (browser) ──► download {slug}.json ──► exhibitions/ ──► CI
                │  picks pages from manuscripta IIIF                       │
                ▼                                                          ▼
        preview in viewer (postMessage)      scripts/prepare-exhibitions.mjs
                                                   │  fetch source manifests, check, normalise
                                                   ▼
                              viewer/public/iiif/{slug}/manifest.json + collection.json
                                                   │
                                                   ▼
                                   viewer (static) ──► images from iiif.manuscripta.se etc.
```

## Getting started

Node 22.12+ (24 recommended, see `.nvmrc`).

```sh
npm run setup          # installs root, viewer/ and editor/ (three separate npm projects)
npm run dev:viewer     # prepares exhibitions/, then http://localhost:5173
                       # (re-prepares and reloads when a file in exhibitions/ changes)
npm run dev:editor     # http://localhost:5174
npm test               # unit tests (vitest)
npm run test:e2e       # builds both apps and runs Playwright against them
```

The viewer and the editor are separate npm projects on purpose. Each needs exactly one copy of React and of the IIIF libraries (`react-iiif-vault`, `@iiif/helpers`), but the two apps need different versions of those libraries. Putting them in one npm workspace mixes the copies.

## How a curator makes an exhibition

1. Open the editor and choose **Ny utställning**.
2. **Add new slide** → paste a manuscripta manifest link, e.g. `https://www.manuscripta.se/iiif/100500/manifest.json`. You can also use **Open IIIF Browser** → 🏠, which lists every manuscripta manuscript and lets you search them. Open a page and choose **Add to exhibition**.
3. Write the title and texts in Swedish and English, choose a layout, and draw tour steps on the image.
4. **Förhandsgranska** opens the real viewer with the draft. It updates as you edit.
5. **Ladda ner för publicering** downloads `{slug}.json`. Commit it to `exhibitions/`, for example by uploading it through GitHub's web interface. The file name becomes the exhibition's URL (`?e={slug}`).

Drafts are kept in the curator's browser (IndexedDB) and are never sent anywhere. Clearing the browser's site data deletes them. Published exhibitions can be reopened from the editor's start page.

## Publishing

`scripts/prepare-exhibitions.mjs` turns `exhibitions/*.json` into `viewer/public/iiif/{slug}/manifest.json` and a `collection.json` listing them all. For each slide it:

- **Fills in provenance.** It fetches the source manuscript's manifest (v2.1 or v3), copies `requiredStatement` and `rights` onto the slide, and adds `partOf` (the source manifest) and `homepage` (`https://www.manuscripta.se/ms/{id}`). The viewer shows `homepage` as a "view the whole manuscript" link.
- **Embeds missing canvases.** A slide that only references a manuscripta canvas gets that canvas copied in. Manuscripta's canvas ids can't be fetched, so a reference alone would not work.
- **Gives every resource a stable id** under `EXHIBITION_BASE_URL/iiif/{slug}/`, and rewrites tour-step targets and other references to match.
- **Describes the image service correctly.** `iiif.manuscripta.se` is labelled as what it is: Image API 3, `level1`.
- **Checks the exhibition.** Missing images or sizes, and tour steps pointing outside the exhibition, are errors. Texts missing Swedish or English are warnings.

Options:
- `--strict` treats warnings as errors.
- `--offline` skips fetching manuscripta. Provenance is not checked and `rights` is not filled in.

Build for production (CI does this in the `build` job):

```sh
EXHIBITION_BASE_URL=https://www.manuscripta.se/exhibition node scripts/prepare-exhibitions.mjs
VITE_BASE=/exhibition/ npm run build --prefix viewer          # → viewer/dist
VITE_BASE=/exhibition/editor/ npm run build --prefix editor   # → editor/dist
```

Serve `viewer/dist` at `/exhibition/` and `editor/dist` at `/exhibition/editor/`.

Every push to `main` is deployed to GitHub Pages by the CI workflow: the viewer at https://manuscripta.github.io/exhibition/ and the editor at https://manuscripta.github.io/exhibition/editor/. To move the site, set the repository variables `EXHIBITION_BASE_URL` and `EXHIBITION_SITE_PATH`. That changes the published IIIF ids.

| Variable | App | Purpose |
|---|---|---|
| `EXHIBITION_BASE_URL` | script | Public URL of the viewer; used for IIIF ids. |
| `VITE_BASE` | both | Path the app is served from. |
| `VITE_VIEWER_URL` | editor | Viewer location. The default is `../`, i.e. the editor lives under the viewer. |
| `VITE_EDITOR_ORIGINS` | viewer | Comma-separated origins allowed to send drafts to the preview. The viewer's own origin is always allowed. |

On hosting:
- The two apps need no server-side code.
- Serve `iiif/*.json` with `Access-Control-Allow-Origin: *` so other IIIF viewers can open the exhibitions.
- Restrict access to the editor if it should not be public. It cannot publish anything by itself, but it does not need to be indexed.

### Browse collection for the editor

manuscripta.se does not publish a top-level IIIF Collection yet. Until it does, the editor's image browser starts from `editor/public/manuscripta-collection.json`, which is built from a checkout of the manuscripta data repository:

```sh
node scripts/build-manuscripta-collection.mjs ../data/iiif
```

Re-run it when manuscripts are added.

## Repository layout

```
exhibitions/                 exhibition manifests saved from the editor (the source of truth)
scripts/prepare-exhibitions.mjs
scripts/build-manuscripta-collection.mjs
scripts/lib/iiif.mjs         normalisation and checks (pure, unit tested)
shared/viewer-manifest.js    display helpers shared by the viewer and the editor's preview
viewer/                      public site (Vite + React 19 + exhibition-viewer 1.0.14)
editor/                      curator app (Vite + React 19 + manifest-editor 2.3.0)
tests/                       vitest unit tests; tests/e2e Playwright tests
```

## Things worth knowing

**Workarounds for `exhibition-viewer` 1.0.14**, all in `viewer/src`:
- The package declares React 18, but it is developed and tested on React 19 with Atlas 3.2.3 and `react-reconciler` 0.33. With React 18 it fails at runtime, so those versions are pinned.
- The stylesheet to import is `dist/index.css`, not `lib.css`. Its utility classes are scoped as `.exhibition-viewer .x`, so the components are wrapped in an `.exhibition-viewer` element. A small button reset replaces Tailwind's missing base reset.
- `DelftPresentation` ignores the `language` prop, and `DelftSlideshow` doesn't apply it to every text. The viewer therefore reduces each manifest to the chosen language before rendering (`shared/viewer-manifest.js`).
- `seeAlso` is shown in only one view, so the link to the manuscript is appended to each slide's text instead.
- Some interface text is hard-coded English: "Exhibition", "Read more" and the button labels.

**Manifest Editor:**
- The editor's interface is in English; the package ships only English and Dutch. Content is written in Swedish and English.
- npm installs several copies of `iiif-browser`, and `editor/vite.config.js` makes the bundle use just one.
- When curators add a manuscripta page, the editor copies in its size, image service, attribution and metadata.

**Issues in manuscripta's IIIF.** These belong in the manuscripta repositories (mostly `stylesheets/tei2iiif.xsl`):
1. **Every painting annotation gets the same id** (`/annotation/.json`) when the images are not on iiif.manuscripta.se (Alvin, data.kb.se). IIIF tools that store resources by id then show the same image for every page, which affects the editor's page picker. `prepare-exhibitions` warns about slides from these manuscripts.
2. **The v2.1 manifests describe iiif.manuscripta.se as Image API 2**, but it serves Image API 3.
3. **The licence is lost when manifests are converted to Presentation 3.** The v2 `license` is dropped by the IIIF upgrader, so the editor loses it. The v3 XSLT (`49c801e`) emits `rights` directly.
4. **100298 (B 59) points at the wrong images.** In the live manifest, canvas "f. 1r" shows a binding image from data.kb.se, so the page numbering looks offset.
5. **There is no top-level IIIF Collection and no list endpoint**, so the editor relies on `manuscripta-collection.json` here.
6. **Canvas ids cannot be fetched**; only `manifest.json` can.

**Security.** The viewer renders exhibition texts as HTML, as IIIF allows:
- Exhibitions are only published through a reviewed commit to `exhibitions/`.
- The preview only accepts drafts from configured editor origins.
- The editor sanitises summary HTML, but texts in tour steps are not re-sanitised when exhibitions are prepared. Consider adding an allow-list sanitiser to `prepare-exhibitions` if contributors are not trusted.
