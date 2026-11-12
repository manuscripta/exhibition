// Helpers for turning an exhibition manifest exported from the Manifest Editor
// into a published, self-contained IIIF Presentation 3 manifest.
//
// Everything here is pure (no file system access) so it can be unit tested;
// network access goes through the injected `fetchJson` function.

import { upgrade } from "@iiif/parser/upgrader";

export const PRESENTATION_3_CONTEXT = "http://iiif.io/api/presentation/3/context.json";
export const MANUSCRIPTA_ORIGIN = "https://www.manuscripta.se";
export const LANGUAGES = ["sv", "en"];

// Resources that belong to the exhibition itself and get ids under the
// exhibition's base URL. Content resources (images, video, text bodies) and
// services are external and keep their ids.
const OWN_TYPES = ["Manifest", "Canvas", "AnnotationPage", "Annotation", "Range", "AnnotationCollection"];

// Properties whose values point at other resources rather than containing
// resources owned by the exhibition.
const REFERENCE_PROPS = ["partOf", "homepage", "seeAlso", "rendering", "start", "source", "within", "target"];

/** Upgrade a Presentation 2.x manifest to 3.0; 3.0 manifests pass through. */
export function toPresentation3(json) {
  const context = [].concat(json["@context"] || []);
  if (context.some((c) => String(c).includes("/presentation/3/"))) return json;
  const upgraded = upgrade(json);
  // The upgrader drops v2 `license`; keep it as v3 `rights` (canonical http:// form).
  const license = [].concat(json.license || [])[0];
  if (!upgraded.rights && typeof license === "string") upgraded.rights = normaliseRights(license);
  return upgraded;
}

/** Creative Commons and RightsStatements.org URIs use http:// in their canonical form. */
export function normaliseRights(uri) {
  return uri.replace(/^https:\/\/(creativecommons\.org|rightsstatements\.org)\//, "http://$1/");
}

/**
 * Manuscripta manuscript id for a manifest/canvas/image URL, or null.
 * Recognises manuscripta.se IIIF and HTML URLs and iiif.manuscripta.se image paths.
 */
export function manuscriptaId(url) {
  if (typeof url !== "string") return null;
  const m =
    url.match(/^https?:\/\/(?:www\.)?manuscripta\.se\/(?:iiif|ms)\/(\d+)(?:[/.#?]|$)/) ||
    url.match(/^https?:\/\/iiif\.manuscripta\.se\/iiif\/ms-(\d+)(?:%2F|\/)/i);
  return m ? m[1] : null;
}

export function manuscriptaManifestUrl(id) {
  return `${MANUSCRIPTA_ORIGIN}/iiif/${id}/manifest.json`;
}

/**
 * iiif.manuscripta.se runs IIPImage with IIIF_VERSION=3, but the v2.1
 * manifests describe it as an Image API 2 service. Describe it as what it
 * actually serves so viewers request the right info.json and URL syntax.
 */
export function fixImageService(service) {
  const id = service?.id || service?.["@id"];
  if (!id || !/^https?:\/\/iiif\.manuscripta\.se\//.test(id)) return service;
  const { "@id": _a, "@type": _b, "@context": _c, ...rest } = service;
  return { ...rest, id, type: "ImageService3", profile: "level1" };
}

/**
 * Deep map over a JSON value. `fn(value, ctx)` returns a replacement or undefined.
 * ctx.prop is the name of the property the value sits in (array elements
 * inherit the array's property), ctx.parent the containing object, and
 * ctx.inReference whether we are inside a reference property.
 */
function walk(value, fn, ctx = { prop: null, parent: null, inReference: false, isRoot: true }) {
  const replaced = fn(value, ctx);
  if (replaced !== undefined) value = replaced;
  if (Array.isArray(value)) return value.map((v) => walk(v, fn, { ...ctx, isRoot: false }));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = walk(v, fn, {
        prop: k,
        parent: value,
        inReference: ctx.inReference || REFERENCE_PROPS.includes(k),
        isRoot: false,
      });
    }
    return out;
  }
  return value;
}

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

/**
 * Give every resource the exhibition owns a stable, dereferenceable id under
 * `${baseUrl}/iiif/${slug}/` and rewrite every reference to the old ids
 * (annotation targets, `start`, selectors given as `id#xywh=...`).
 *
 * New ids are assigned per occurrence, so resources that wrongly share an id
 * in the source (as in some manuscripta manifests) end up with distinct ids.
 * Running it on its own output gives the same ids again.
 */
export function remintIds(manifest, { baseUrl, slug }) {
  const root = `${baseUrl.replace(/\/$/, "")}/iiif/${slug}`;
  const counters = {};
  const mapping = new Map(); // old id -> new id (first occurrence)
  const duplicates = new Set();

  const minted = walk(manifest, (value, ctx) => {
    if (!isObject(value) || ctx.inReference || !OWN_TYPES.includes(value.type) || typeof value.id !== "string") return undefined;
    let newId;
    if (ctx.isRoot) newId = `${root}/manifest.json`;
    else {
      const t = value.type.toLowerCase();
      counters[t] = (counters[t] || 0) + 1;
      newId = `${root}/${t}/${counters[t]}`;
    }
    if (mapping.has(value.id)) duplicates.add(value.id);
    else mapping.set(value.id, newId);
    return { ...value, id: newId, __minted: true };
  });

  const rewriteRef = (s) => {
    if (mapping.has(s)) return mapping.get(s);
    const hash = s.indexOf("#");
    if (hash > 0 && mapping.has(s.slice(0, hash))) return mapping.get(s.slice(0, hash)) + s.slice(hash);
    return undefined;
  };

  const rewritten = walk(minted, (value, ctx) => {
    if (typeof value !== "string") return undefined;
    if (ctx.prop === "id" && ctx.parent?.__minted) return undefined;
    // Only rewrite strings in places that hold resource references.
    if (ctx.prop === "id" || ctx.inReference) return rewriteRef(value);
    return undefined;
  });

  const clean = walk(rewritten, (value) => {
    if (!isObject(value) || !value.__minted) return undefined;
    const { __minted, ...rest } = value;
    return rest;
  });

  return { manifest: clean, mapping, duplicates: [...duplicates] };
}

/** Content resources of an annotation (unwraps SpecificResource bodies). */
function bodies(annotation) {
  return [].concat(annotation?.body || []).map((b) => (b?.type === "SpecificResource" ? b.source : b));
}

function paintingAnnotations(canvas) {
  return (canvas.items || [])
    .flatMap((page) => page.items || [])
    .filter((a) => [].concat(a.motivation || []).includes("painting"));
}

/** Source manuscripta manuscript of a canvas: from partOf, its own id, or its image URLs. */
export function canvasSource(canvas) {
  for (const p of [].concat(canvas.partOf || [])) {
    const id = manuscriptaId(p?.id);
    if (id) return { manuscriptId: id, manifestId: p.id };
  }
  const candidates = [canvas.id];
  for (const anno of paintingAnnotations(canvas)) {
    for (const body of bodies(anno)) {
      candidates.push(body?.id);
      for (const s of [].concat(body?.service || [])) candidates.push(s?.id || s?.["@id"]);
    }
  }
  for (const c of candidates) {
    const id = manuscriptaId(c);
    if (id) return { manuscriptId: id, manifestId: manuscriptaManifestUrl(id) };
  }
  return null;
}

function hasPainting(canvas) {
  return paintingAnnotations(canvas).some((a) => bodies(a).some(Boolean));
}

function isInfoBlock(canvas) {
  return [].concat(canvas.behavior || []).includes("info");
}

export function hasDuplicatePaintingIds(manifest) {
  const seen = new Set();
  for (const canvas of manifest.items || []) {
    for (const anno of paintingAnnotations(canvas)) {
      if (seen.has(anno.id)) return true;
      seen.add(anno.id);
    }
  }
  return false;
}

function languagesOf(value) {
  return isObject(value) ? Object.keys(value).filter((k) => (value[k] || []).some((s) => String(s).trim())) : [];
}

export function labelText(value, preferred = LANGUAGES) {
  if (!isObject(value)) return typeof value === "string" ? value : "";
  for (const lang of [...preferred, "none", ...Object.keys(value)]) if (value[lang]?.length) return value[lang].join(" ");
  return "";
}

function checkLanguages(where, prop, value, warnings) {
  const langs = languagesOf(value);
  if (langs.length === 0 || (langs.length === 1 && langs[0] === "none")) return;
  const missing = LANGUAGES.filter((l) => !langs.includes(l));
  if (missing.length) warnings.push(`${where}: ${prop} is missing language(s): ${missing.join(", ")}`);
}

/**
 * Texts written in the editor (info blocks, tour steps) are annotations with
 * one TextualBody per language. Warn when a text exists in only some languages.
 */
function checkTextBodies(where, canvas, warnings) {
  const pages = [...(canvas.items || []), ...(canvas.annotations || [])];
  for (const [i, anno] of pages.flatMap((p) => p.items || []).entries()) {
    const texts = [].concat(anno.body || []).filter((b) => b?.type === "TextualBody" && String(b.value || "").trim());
    if (texts.length === 0) continue;
    const langs = texts.map((b) => b.language).filter(Boolean);
    const missing = LANGUAGES.filter((l) => !langs.includes(l));
    if (missing.length && langs.length) {
      const name = labelText(anno.label) || (anno.motivation === "painting" ? "text block" : `text ${i + 1}`);
      warnings.push(`${where}: “${name}” is missing language(s): ${missing.join(", ")}`);
    }
  }
}

/**
 * Normalise one exhibition. Returns { manifest, warnings, errors }.
 *
 * @param {object} input  Manifest JSON as exported by the editor.
 * @param {object} options
 * @param {string} options.slug
 * @param {string} options.baseUrl  Public base URL of the viewer site.
 * @param {string} [options.collectionId]  Id of the collection listing all exhibitions.
 * @param {(url: string) => Promise<object>} [options.fetchJson]  Network access; omit for offline mode.
 */
export async function prepareExhibition(input, { slug, baseUrl, fetchJson, collectionId } = {}) {
  const warnings = [];
  const errors = [];

  if (!isObject(input) || input.type !== "Manifest") {
    const found = input?.type ?? input?.["@type"];
    return { manifest: null, warnings, errors: [`${slug}: not a IIIF Presentation 3 Manifest (type: ${found})`] };
  }
  if (!labelText(input.label)) errors.push(`${slug}: the exhibition has no title (label)`);

  const manifestCache = new Map();
  const fetchManifest = (url) => {
    if (!fetchJson) return Promise.reject(new Error("offline"));
    if (!manifestCache.has(url)) manifestCache.set(url, Promise.resolve(fetchJson(url)).then(toPresentation3));
    return manifestCache.get(url);
  };

  // 1. Per slide, with the ids as the editor wrote them: embed missing
  //    canvases, fill in provenance and links back to manuscripta.
  const items = [];
  for (const [index, original] of (input.items || []).entries()) {
    let canvas = original;
    const where = `${slug}, slide ${index + 1}${labelText(canvas.label) ? ` (“${labelText(canvas.label)}”)` : ""}`;
    const source = canvasSource(canvas);
    let sourceManifest = null;
    if (source) {
      try {
        sourceManifest = await fetchManifest(source.manifestId);
      } catch (e) {
        if (fetchJson) warnings.push(`${where}: could not fetch ${source.manifestId} (${e.message})`);
      }
    }

    if (!isInfoBlock(canvas) && !hasPainting(canvas)) {
      const found = sourceManifest?.items?.find((c) => c.id === canvas.id);
      if (found) {
        // Only a reference to a manuscripta canvas: copy the canvas in.
        canvas = {
          ...canvas,
          width: found.width,
          height: found.height,
          items: found.items,
          thumbnail: canvas.thumbnail || found.thumbnail,
          label: canvas.label || found.label,
        };
      } else if (source && !sourceManifest) {
        errors.push(`${where}: has no image, and ${source.manifestId} could not be fetched to copy it in`);
      } else if (source) {
        errors.push(`${where}: canvas ${canvas.id} was not found in ${source.manifestId}`);
      } else if (![].concat(canvas.behavior || []).includes("multi-image")) {
        warnings.push(`${where}: has no image`);
      }
    }

    if (source) {
      canvas = {
        ...canvas,
        partOf: canvas.partOf?.length
          ? canvas.partOf
          : [{ id: source.manifestId, type: "Manifest", ...(sourceManifest?.label ? { label: sourceManifest.label } : {}) }],
        homepage: canvas.homepage?.length
          ? canvas.homepage
          : [
              {
                id: `${MANUSCRIPTA_ORIGIN}/ms/${source.manuscriptId}`,
                type: "Text",
                format: "text/html",
                label: { sv: ["Visa hela handskriften på manuscripta.se"], en: ["View the whole manuscript on manuscripta.se"] },
              },
            ],
        ...(canvas.requiredStatement || !sourceManifest?.requiredStatement ? {} : { requiredStatement: sourceManifest.requiredStatement }),
        ...(canvas.rights || !sourceManifest?.rights ? {} : { rights: sourceManifest.rights }),
      };
      if (sourceManifest && hasDuplicatePaintingIds(sourceManifest)) {
        warnings.push(
          `${where}: manuscript ${source.manuscriptId} has duplicate image annotation ids in its IIIF manifest, ` +
            `so the editor may have picked the wrong image; check that the right page is shown`,
        );
      }
    }

    if (!isInfoBlock(canvas) && !(canvas.width > 0 && canvas.height > 0)) errors.push(`${where}: missing width/height`);
    checkLanguages(where, "label", canvas.label, warnings);
    checkLanguages(where, "summary", canvas.summary, warnings);
    checkTextBodies(where, canvas, warnings);
    items.push(canvas);
  }
  if (items.length === 0) errors.push(`${slug}: the exhibition has no slides`);
  checkLanguages(slug, "label", input.label, warnings);
  checkLanguages(slug, "summary", input.summary, warnings);

  // 2. Stable ids under the exhibition's own URL.
  const { manifest: minted, duplicates } = remintIds({ ...input, items }, { baseUrl, slug });
  if (duplicates.length) warnings.push(`${slug}: ${duplicates.length} resource id(s) occurred more than once and were given distinct ids`);

  // 3. Every annotation must target a slide in this exhibition.
  const canvasIds = new Set((minted.items || []).map((c) => c.id));
  for (const canvas of minted.items || []) {
    for (const page of [...(canvas.items || []), ...(canvas.annotations || [])]) {
      for (const anno of page.items || []) {
        for (const t of [].concat(anno.target || [])) {
          const raw = typeof t === "string" ? t : t?.source?.id || t?.source || t?.id;
          const targetId = typeof raw === "string" ? raw.split("#")[0] : null;
          if (targetId && !canvasIds.has(targetId)) {
            errors.push(`${slug}: annotation ${anno.id} targets ${targetId}, which is not a slide in this exhibition`);
          }
        }
      }
    }
  }

  // 4. Describe image services correctly.
  const fixed = walk(minted, (value, ctx) =>
    ctx.prop === "service" && Array.isArray(value) ? value.map(fixImageService) : undefined,
  );

  const { "@context": _ctx, partOf: _partOf, ...rest } = fixed;
  const manifest = {
    "@context": PRESENTATION_3_CONTEXT,
    ...rest,
    ...(collectionId ? { partOf: [{ id: collectionId, type: "Collection" }] } : {}),
  };
  return { manifest, warnings, errors };
}

/** A thumbnail for a manifest: its own, or one built from the first image service. */
export function thumbnailFor(manifest) {
  if (manifest.thumbnail?.length) return manifest.thumbnail;
  // Prefer a size that suits a card in the exhibition list over the small
  // canvas thumbnails (90px wide in manuscripta's manifests).
  for (const canvas of manifest.items || []) {
    for (const anno of paintingAnnotations(canvas)) {
      for (const body of bodies(anno)) {
        const service = [].concat(body?.service || [])[0];
        const serviceId = service?.id || service?.["@id"];
        if (serviceId) return [{ id: `${serviceId}/full/400,/0/default.jpg`, type: "Image", format: "image/jpeg", service: [service] }];
        if (body?.type === "Image" && body.id) return [{ id: body.id, type: "Image", format: body.format }];
      }
    }
  }
  return (manifest.items || []).find((c) => c.thumbnail?.length)?.thumbnail;
}

/** A IIIF Collection listing all published exhibitions. */
export function buildCollection(manifests, { baseUrl, label, summary }) {
  const root = baseUrl.replace(/\/$/, "");
  return {
    "@context": PRESENTATION_3_CONTEXT,
    id: `${root}/iiif/collection.json`,
    type: "Collection",
    label,
    ...(summary ? { summary } : {}),
    items: manifests.map((m) => {
      const thumbnail = thumbnailFor(m);
      return {
        id: m.id,
        type: "Manifest",
        label: m.label,
        ...(m.summary ? { summary: m.summary } : {}),
        ...(thumbnail ? { thumbnail } : {}),
      };
    }),
  };
}
