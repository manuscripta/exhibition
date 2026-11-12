# Stand-alone IIIF exhibition viewer and editor for manuscripta

> **Status (2026-11-12):** The first test and version 1 are implemented. See README.md for how to use it. What the test showed:
> - The editor imports manuscripta's v2.1 manifests directly.
> - "Add to exhibition" embeds the full canvas: size, image service, attribution and metadata. It does not set `partOf` on the canvas or keep `rights`, so `prepare-exhibitions` adds both.
> - Deep zoom works against iiif.manuscripta.se and data.kb.se.
> - Previews work through postMessage to the viewer.
>
> Changes from the plan below:
> - The editor isn't published as a static app upstream (Digirati's own is Next.js on Cloudflare), so `editor/` is our own small Vite app around the npm packages.
> - The viewer runs on React 19, the version `exhibition-viewer` is actually tested with.
> - The two apps are separate npm projects instead of one workspace.
> - Publishing follows option A: download the JSON, commit it to `exhibitions/`, and CI checks and builds it.
>
> Data issues found in manuscripta's IIIF are listed in README.md.

## Context
manuscripta.se publishes about 250 manuscripts as IIIF. Each has a Presentation manifest at `https://www.manuscripta.se/iiif/{msID}/manifest.json`, and the images are served from `iiif.manuscripta.se` (IIPImage), `data.kb.se` and `alvin-portal.org`. The site has no exhibition or guided-viewing feature: Mirador only shows one manuscript at a time. The goal is a **separate** exhibition app in this repo, `manuscripta/exhibition`. It reads manuscripta's IIIF over HTTP and changes nothing in the eXist app.

**Curators must be able to create exhibitions in a graphical editor, without writing any files by hand.**

Findings that shape the plan:
- **Production serves Presentation 2.1** and sends `Access-Control-Allow-Origin: *` on manifests and images (checked live with curl). Fetching from the browser of another domain therefore works.
- **The editor has a 3.0 generator, but it is not merged yet.** It is `editor-develop/stylesheets/tei2iiif.xsl`, commit `49c801e`, on a feature branch and not on `develop`.
- **The ids inside the manifests cannot be fetched.** Only `manifest.json` resolves; canvas ids like `/iiif/{id}/canvas/c-N.json` return nothing. Exhibitions therefore have to **embed** each canvas (its dimensions and image service) instead of pointing to it.
- **There are no Collections, ranges or annotations** in manuscripta's IIIF. Metadata labels are English only.

## Recommended approach
Use two Digirati tools, one to create exhibitions and one to show them. They share a single format: **an exhibition is an IIIF Presentation 3 manifest**:
- Each canvas carries a `label`/`summary` text block.
- Layout comes from `behavior` hints (`w-6`, `h-8`, `left`, `info`, …).
- Guided tour steps are annotation pages on the canvas.

| Role | Tool | Package |
|---|---|---|
| Create (curators) | **Manifest Editor** with the exhibition preset | `digirati-co-uk/iiif-manifest-editor`, `@manifest-editor/exhibition-preset` (MIT, v2.3.0, Nov 2026) |
| Show (public) | **Exhibition Viewer** (came out of the TU Delft heritage site) | `exhibition-viewer` on npm (MIT according to the README, React) |

Any IIIF viewer, Mirador included, can still open the exhibitions; it just ignores the layout hints. Other tools I looked at and set aside:
- Storiiies: only one image per story.
- Canopy and Telar: you write in Markdown or YAML files, which is too technical for the curators.
- Spotlight: needs Rails and Solr, too heavy.
- Annona, Wax and Panel Truck: no longer actively maintained.
- Exhibit.so: closed SaaS.

### Workflow
```
Curator, in the browser (editor.exhibition…/)
  1. Create an exhibition (exhibition preset), title and intro in sv + en
  2. Add images: paste a manuscripta manifest link, pick canvases
  3. Write texts, choose a layout per item, draw tour regions on the image
  4. Export / save the exhibition manifest (JSON)
        │
        ▼
Publishing step  (see open decision below)
        │
        ▼
scripts/prepare-exhibition.mjs   (CI: normalise and validate)
        │
        ▼
public/iiif/{slug}/manifest.json + public/iiif/collection.json  →  static viewer site
```

### Repo layout
```
exhibition/
  package.json                    workspaces: viewer + editor
  viewer/                         Vite + React 18 + exhibition-viewer
    src/main.jsx                  routes: / (list of exhibitions), /{slug}?mode=scroll|slides|presentation
  editor/                         self-hosted build of the Manifest Editor, exhibition preset only
    src/main.jsx                  config: sv/en languages, manuscripta as a suggested source, export
  exhibitions/{slug}.json         exhibition manifests exported from the editor (source)
  scripts/prepare-exhibition.mjs  normalise + validate → public/iiif/
  tests/                          vitest for the script; Playwright smoke test for the viewer and editor
```

### The editor (`editor/`)
- Our own small build of the Manifest Editor that loads only `@manifest-editor/exhibition-preset`. This follows the static-hosting and GitHub Pages guide in the editor's documentation.
- Configuration:
  - the languages are `sv` and `en`, so the editor fields offer both;
  - adding images from manuscripta should be as simple as possible, ideally with the manuscript number or link pre-filled. Check which configuration hooks the editor exposes.
- **Saving:** the editor saves drafts in the browser. To be checked in the spike: whether storage is local only, and how export works.

### Publishing (open decision, to settle after the spike)
| Option | For the curator | Effort |
|---|---|---|
| **A. Export JSON → upload via GitHub's web interface** to `exhibitions/`; CI publishes | Upload a file in the browser | Low; recommended to start with |
| B. A "Publish" button in the editor that saves through a small endpoint, e.g. a GitHub App or serverless function | One click | Medium; needs authentication |
| C. Save into eXist (`/db/data/exhibitions/`) | One click | Couples the app to the eXist app, which the stand-alone goal rules out |

### Normalisation (`scripts/prepare-exhibition.mjs`, runs in CI)
A safety net between the editor and publication, so curators don't have to get the IIIF details right themselves:
1. **Embed canvases:** if a canvas only points to a manuscripta canvas id (which cannot be fetched), the script fetches the source manifest, upgrading v2.1 to v3 with `@iiif/parser`. It then copies in `width`/`height` and the image `service`.
2. **Ids:** gives every resource in the exhibition its own id (`{base}/iiif/{slug}/…`).
3. **Links back to manuscripta:** adds `partOf` (the source manifest) and `homepage` (`https://www.manuscripta.se/ms/{id}`) to each canvas, and copies `requiredStatement`/`rights` from the source.
4. **Collection:** writes `collection.json` listing all exhibitions, used for the viewer's start page.
5. **Validation:** checks the output against the v3 schema, with a clear error message on a missing image or text, or on missing language versions.

### The viewer (`viewer/`)
- Thin React shell around the components in `exhibition-viewer`. Offers grid/scroll, slideshow and presentation modes.
- An sv/en toggle. Default is `sv`.
- Every item gets a "View the whole manuscript" link to manuscripta.se/ms/{id}.
- `base` is configurable (`VITE_BASE`), so the viewer can be deployed at `exhibition.manuscripta.se`, at `manuscripta.se/exhibition/` or on GitHub Pages. The output is fully static.

### Spike first (before the full build)
1. **Editor + manuscripta:** in a local build of the Manifest Editor with the exhibition preset:
   - paste `https://www.manuscripta.se/iiif/100001/manifest.json` (v2.1) and check that the import works;
   - pick 3 canvases, plus one from a data.kb.se manuscript;
   - write sv + en texts and draw a tour region;
   - export, and **check whether the canvases are embedded in full** or only point to their ids.
2. **Viewer:** load the exported manifest in `exhibition-viewer` and check:
   - deep zoom and tiles work with `iiif.manuscripta.se` (Image API 3 `level1`);
   - the tour steps;
   - the language switching.
3. **Saving:** how drafts are stored (local only or not) and what the export format looks like. This decides the publishing option.
4. **License:** check whether `exhibition-viewer` has a LICENSE file. If it doesn't, ask Digirati to add one.

If the editor cannot handle the v2.1 manifests, either add an import helper (a small proxy or build step that serves v3 versions of manuscripta's manifests), or speed up the move to v3 on manuscripta. If the viewer fails, the editor's format still works in other IIIF viewers, and we can build our own layout on OpenSeadragon.

## Possible later changes on the manuscripta side (not required)
- Merge the v3 `tei2iiif.xsl` into `develop`. This makes the editor import simpler.
- Add `sv` to the metadata language maps.
- Make canvas ids resolvable. The normalisation step can then be simplified.
- Link from the manuscript pages to the exhibitions where the manuscript appears.

## Verification
- **Spike:** the full chain works by hand. A curator creates an exhibition in the editor, exports it, and it appears in the viewer.
- **`npm run prepare`:**
  - vitest covers: a v2 source, a v3 source, a canvas that only points to its id (gets embedded), a missing canvas (clear error), and tour regions given as `xywh`;
  - the output passes the IIIF Presentation Validator and opens in manuscripta's Mirador.
- **Playwright:**
  - editor: start a new exhibition and add an image from manuscripta;
  - viewer: the start page lists the exhibitions, each layout renders, tiles load from iiif.manuscripta.se, tour steps work, the sv/en toggle works, and the "whole manuscript" link works.
- **User test:** a curator creates a small exhibition without help, and we note where they get stuck.
