#!/usr/bin/env node
// Builds a IIIF Collection of every manuscript on manuscripta.se, which the
// editor uses as the starting point of its "Browse IIIF content" picker.
//
// manuscripta.se has no top-level collection or list endpoint yet, so the
// manuscript ids come from one of:
//   - a folder whose sub-folders are named by id (e.g. a checkout of the
//     manuscripta data repository's iiif/ folder), or
//   - a text file with one id per line.
// Labels, dates and thumbnails are always read from the live manifests at
// https://www.manuscripta.se/iiif/{id}/manifest.json, never from the files.
//
//   node scripts/build-manuscripta-collection.mjs ../data/iiif
//   node scripts/build-manuscripta-collection.mjs ids.txt
//
// Output: editor/public/manuscripta-collection.json (commit it).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRESENTATION_3_CONTEXT, labelText, manuscriptaManifestUrl, toPresentation3 } from "./lib/iiif.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(process.argv[2] || path.join(repoRoot, "..", "data", "iiif"));
const outFile = path.join(repoRoot, "editor", "public", "manuscripta-collection.json");
const CONCURRENCY = 6;

async function readIds(from) {
  const stat = await fs.stat(from);
  if (stat.isDirectory()) {
    return (await fs.readdir(from, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
      .map((d) => d.name);
  }
  return (await fs.readFile(from, "utf8"))
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
}

async function fetchManifest(id) {
  const resp = await fetch(manuscriptaManifestUrl(id), { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return toPresentation3(await resp.json());
}

function collectionItem(id, manifest) {
  const metadata = Object.fromEntries((manifest.metadata || []).map((m) => [labelText(m.label), labelText(m.value)]));
  const shelfmark = labelText(manifest.label);
  const title = metadata.Title;
  const date = metadata.Date;
  const firstCanvas = manifest.items?.find((c) => c.thumbnail?.length) || manifest.items?.[0];
  return {
    id: manuscriptaManifestUrl(id),
    type: "Manifest",
    label: { none: [title ? `${shelfmark}: ${title}` : shelfmark] },
    ...(date ? { summary: { none: [date] } } : {}),
    ...(firstCanvas?.thumbnail?.length ? { thumbnail: firstCanvas.thumbnail.slice(0, 1) } : {}),
  };
}

const ids = [...new Set(await readIds(source))].sort();
const items = [];
const skipped = [];
let next = 0;

async function worker() {
  while (next < ids.length) {
    const id = ids[next++];
    try {
      items.push(collectionItem(id, await fetchManifest(id)));
    } catch (e) {
      skipped.push(`${id} (${e.message})`); // No facsimile, unpublished, or unreachable.
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

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
console.log(`Wrote ${items.length} of ${ids.length} manuscripts to ${path.relative(repoRoot, outFile)} (from the live manifests).`);
if (skipped.length) console.warn(`Skipped ${skipped.length}: ${skipped.join(", ")}`);
