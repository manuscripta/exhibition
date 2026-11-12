#!/usr/bin/env node
// Turns the exhibition manifests saved from the editor (exhibitions/*.json)
// into published IIIF manifests plus a collection listing them all:
//
//   viewer/public/iiif/{slug}/manifest.json
//   viewer/public/iiif/collection.json
//
// Usage: node scripts/prepare-exhibitions.mjs [--offline] [--strict]
//   EXHIBITION_BASE_URL  public URL of the viewer site (default http://localhost:5173)
//   --offline            do not fetch manuscripta manifests (no provenance checks)
//   --strict             treat warnings as errors

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCollection, prepareExhibition } from "./lib/iiif.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(repoRoot, "exhibitions");
const outDir = path.join(repoRoot, "viewer", "public", "iiif");

const args = new Set(process.argv.slice(2));
const offline = args.has("--offline");
const strict = args.has("--strict");
const baseUrl = (process.env.EXHIBITION_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
const collectionId = `${baseUrl}/iiif/collection.json`;

const COLLECTION_LABEL = { sv: ["Utställningar"], en: ["Exhibitions"] };
const COLLECTION_SUMMARY = {
  sv: ["Utställningar med handskrifter från manuscripta.se"],
  en: ["Exhibitions of manuscripts from manuscripta.se"],
};

async function fetchJson(url) {
  const resp = await fetch(url, { headers: { Accept: "application/ld+json, application/json" } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

const files = (await fs.readdir(sourceDir)).filter((f) => f.endsWith(".json")).sort();
const published = [];
let errorCount = 0;
let warningCount = 0;

// Files are overwritten in place rather than deleting the output folder first:
// a running Vite dev server loses track of public files if their folder is
// removed and recreated under it. Stale exhibitions are removed at the end.
await fs.mkdir(outDir, { recursive: true });

for (const file of files) {
  const slug = path.basename(file, ".json");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    console.error(`✗ ${file}: file names must be lower-case letters, digits and hyphens (it becomes the exhibition's URL)`);
    errorCount++;
    continue;
  }

  let input;
  try {
    input = JSON.parse(await fs.readFile(path.join(sourceDir, file), "utf8"));
  } catch (e) {
    console.error(`✗ ${file}: not valid JSON (${e.message})`);
    errorCount++;
    continue;
  }

  const { manifest, warnings, errors } = await prepareExhibition(input, {
    slug,
    baseUrl,
    collectionId,
    fetchJson: offline ? undefined : fetchJson,
  });
  for (const w of warnings) console.warn(`  ⚠ ${w}`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  warningCount += warnings.length;
  errorCount += errors.length;

  if (manifest && errors.length === 0) {
    await fs.mkdir(path.join(outDir, slug), { recursive: true });
    await fs.writeFile(path.join(outDir, slug, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    published.push(manifest);
    console.log(`✓ ${slug} (${manifest.items.length} slides)`);
  }
}

// Remove exhibitions that are no longer published (deleted or now failing).
const publishedSlugs = new Set(published.map((m) => m.id.match(/\/iiif\/([^/]+)\/manifest\.json$/)[1]));
for (const entry of await fs.readdir(outDir, { withFileTypes: true })) {
  if (entry.isDirectory() && !publishedSlugs.has(entry.name)) {
    await fs.rm(path.join(outDir, entry.name), { recursive: true, force: true });
  }
}

const collection = buildCollection(published, { baseUrl, label: COLLECTION_LABEL, summary: COLLECTION_SUMMARY });
await fs.writeFile(path.join(outDir, "collection.json"), `${JSON.stringify(collection, null, 2)}\n`);
console.log(`\n${published.length} exhibition(s) published to ${path.relative(repoRoot, outDir)}/, ${warningCount} warning(s), ${errorCount} error(s).`);

if (errorCount > 0 || (strict && warningCount > 0)) process.exit(1);
