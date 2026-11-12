#!/usr/bin/env node
// Builds a IIIF Collection of every manuscript on manuscripta.se, which the
// editor uses as the starting point of its "Browse IIIF content" picker.
//
// manuscripta.se does not (yet) publish a top-level collection, so this reads
// the manifest snapshot in a checkout of the manuscripta data repository:
//
//   node scripts/build-manuscripta-collection.mjs ../data/iiif
//
// Output: editor/public/manuscripta-collection.json (commit it).
// Ids, labels and thumbnails point at the live manifests on www.manuscripta.se.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRESENTATION_3_CONTEXT, labelText, manuscriptaManifestUrl, toPresentation3 } from "./lib/iiif.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.resolve(process.argv[2] || path.join(repoRoot, "..", "data", "iiif"));
const outFile = path.join(repoRoot, "editor", "public", "manuscripta-collection.json");

const ids = (await fs.readdir(dataDir, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
  .map((d) => d.name);

const items = [];
for (const id of ids) {
  let manifest;
  try {
    manifest = toPresentation3(JSON.parse(await fs.readFile(path.join(dataDir, id, "manifest.json"), "utf8")));
  } catch {
    continue; // No manifest (manuscript without facsimile) or unreadable.
  }
  const metadata = Object.fromEntries((manifest.metadata || []).map((m) => [labelText(m.label), labelText(m.value)]));
  const shelfmark = labelText(manifest.label);
  const title = metadata.Title;
  const date = metadata.Date;
  const firstCanvas = manifest.items?.find((c) => c.thumbnail?.length) || manifest.items?.[0];
  items.push({
    id: manuscriptaManifestUrl(id),
    type: "Manifest",
    label: { none: [title ? `${shelfmark}: ${title}` : shelfmark] },
    ...(date ? { summary: { none: [date] } } : {}),
    ...(firstCanvas?.thumbnail?.length ? { thumbnail: firstCanvas.thumbnail.slice(0, 1) } : {}),
  });
}

items.sort((a, b) => labelText(a.label).localeCompare(labelText(b.label), "sv", { numeric: true }));

const collection = {
  "@context": PRESENTATION_3_CONTEXT,
  id: "https://www.manuscripta.se/iiif/collection.json",
  type: "Collection",
  label: { sv: ["Handskrifter på manuscripta.se"], en: ["Manuscripts on manuscripta.se"] },
  summary: {
    sv: [`${items.length} handskrifter med digitaliserade bilder.`],
    en: [`${items.length} manuscripts with digitised images.`],
  },
  items,
};

await fs.mkdir(path.dirname(outFile), { recursive: true });
await fs.writeFile(outFile, `${JSON.stringify(collection, null, 2)}\n`);
console.log(`Wrote ${items.length} manuscripts to ${path.relative(repoRoot, outFile)}`);
