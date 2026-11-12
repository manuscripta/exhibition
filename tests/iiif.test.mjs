import { describe, expect, it } from "vitest";
import {
  buildCollection,
  canvasSource,
  fixImageService,
  hasDuplicatePaintingIds,
  manuscriptaId,
  normaliseRights,
  prepareExhibition,
  remintIds,
  toPresentation3,
} from "../scripts/lib/iiif.mjs";

const BASE = "https://exhibition.example.org";
const MS_MANIFEST = "https://www.manuscripta.se/iiif/100500/manifest.json";
const SERVICE = "https://iiif.manuscripta.se/iiif/ms-100500/ms-100500_0577.tif";

/** A small manuscripta-style Presentation 2.1 manifest with two canvases. */
function manuscriptaV2({ duplicateAnnotationIds = false } = {}) {
  const canvas = (n) => ({
    "@id": `https://www.manuscripta.se/iiif/100500/canvas/c-${n}.json`,
    "@type": "sc:Canvas",
    label: `f. ${n}r`,
    width: 6200,
    height: 10400,
    images: [
      {
        "@id": duplicateAnnotationIds
          ? "https://www.manuscripta.se/iiif/100500/annotation/.json"
          : `https://www.manuscripta.se/iiif/100500/annotation/img-${n}.json`,
        "@type": "oa:Annotation",
        motivation: "sc:painting",
        on: `https://www.manuscripta.se/iiif/100500/canvas/c-${n}.json`,
        resource: {
          "@id": `https://iiif.manuscripta.se/iiif/ms-100500/img-${n}.tif/full/full/0/default.jpg`,
          "@type": "dctypes:Image",
          format: "image/jpeg",
          width: 6200,
          height: 10400,
          service: {
            "@context": "http://iiif.io/api/image/2/context.json",
            "@id": `https://iiif.manuscripta.se/iiif/ms-100500/img-${n}.tif`,
            profile: "http://iiif.io/api/image/2/level1.json",
          },
        },
      },
    ],
  });
  return {
    "@context": "http://iiif.io/api/presentation/2/context.json",
    "@id": MS_MANIFEST,
    "@type": "sc:Manifest",
    label: "National Library of Sweden, A 148",
    attribution: "National Library of Sweden (Photographer: Per B. Adolphson)",
    license: "https://creativecommons.org/licenses/by/4.0/",
    sequences: [{ "@type": "sc:Sequence", canvases: [canvas(1), canvas(2)] }],
  };
}

/** A canvas as the Manifest Editor's exhibition preset writes it after "Add to exhibition". */
function editorCanvas(id = "https://exhibition.invalid/d/manifest.json/canvas/abc", extra = {}) {
  return {
    id,
    type: "Canvas",
    label: { sv: ["Djävulen"], en: ["The devil"] },
    behavior: ["w-12", "h-8", "left"],
    width: 6200,
    height: 10400,
    items: [
      {
        id: `${id}/page`,
        type: "AnnotationPage",
        items: [
          {
            id: `${id}/page/anno`,
            type: "Annotation",
            motivation: "painting",
            target: id,
            body: {
              id: `${SERVICE}/full/full/0/default.jpg`,
              type: "Image",
              format: "image/jpeg",
              width: 6200,
              height: 10400,
              service: [{ "@id": SERVICE, "@type": "ImageService2", profile: "level1" }],
            },
          },
        ],
      },
    ],
    annotations: [
      {
        id: `${id}/tour`,
        type: "AnnotationPage",
        items: [
          {
            id: `${id}/tour/1`,
            type: "Annotation",
            motivation: "tagging",
            label: { sv: ["Steg 1"], en: ["Step 1"] },
            body: [
              { type: "TextualBody", language: "sv", format: "text/html", value: "<p>Hej</p>" },
              { type: "TextualBody", language: "en", format: "text/html", value: "<p>Hello</p>" },
            ],
            target: {
              type: "SpecificResource",
              source: { id, type: "Canvas" },
              selector: { type: "FragmentSelector", value: "xywh=10,20,300,400" },
            },
          },
        ],
      },
    ],
    ...extra,
  };
}

function exhibition(items, extra = {}) {
  return {
    "@context": "http://iiif.io/api/presentation/3/context.json",
    id: "https://exhibition.invalid/d/manifest.json",
    type: "Manifest",
    label: { sv: ["Utställning"], en: ["Exhibition"] },
    items,
    ...extra,
  };
}

const fetchFrom = (map) => async (url) => {
  if (!(url in map)) throw new Error(`HTTP 404 for ${url}`);
  return structuredClone(map[url]);
};

describe("toPresentation3", () => {
  it("upgrades a manuscripta v2.1 manifest and keeps its license as rights", () => {
    const m = toPresentation3(manuscriptaV2());
    expect(m.type).toBe("Manifest");
    expect(m.items).toHaveLength(2);
    expect(m.rights).toBe("http://creativecommons.org/licenses/by/4.0/");
    expect(m.requiredStatement.value.none[0]).toMatch(/Adolphson/);
  });

  it("passes Presentation 3 through unchanged", () => {
    const v3 = exhibition([]);
    expect(toPresentation3(v3)).toBe(v3);
  });

  it("normalises CC and RightsStatements URIs to http://", () => {
    expect(normaliseRights("https://creativecommons.org/publicdomain/mark/1.0/")).toBe(
      "http://creativecommons.org/publicdomain/mark/1.0/",
    );
    expect(normaliseRights("https://example.org/x")).toBe("https://example.org/x");
  });
});

describe("manuscriptaId", () => {
  it.each([
    ["https://www.manuscripta.se/iiif/100500/manifest.json", "100500"],
    ["https://www.manuscripta.se/iiif/100500/canvas/c-11.json", "100500"],
    ["https://www.manuscripta.se/ms/101178", "101178"],
    ["https://iiif.manuscripta.se/iiif/ms-100500/ms-100500_0011.tif", "100500"],
    ["https://iiif.manuscripta.se/iiif/ms-100001%2Fuub-gr-001_0007_001r.tif", "100001"],
    ["https://data.kb.se/iiif/3/dark-29469860%2Fx.jp2", null],
    [undefined, null],
  ])("%s -> %s", (url, id) => {
    expect(manuscriptaId(url)).toBe(id);
  });
});

describe("fixImageService", () => {
  it("describes iiif.manuscripta.se as Image API 3 level 1", () => {
    expect(fixImageService({ "@id": SERVICE, "@type": "ImageService2", profile: "level1", width: 1 })).toEqual({
      id: SERVICE,
      type: "ImageService3",
      profile: "level1",
      width: 1,
    });
  });

  it("leaves other image servers alone", () => {
    const alvin = { "@id": "https://www.alvin-portal.org/iipsrv/x", "@type": "ImageService2", profile: "level1" };
    expect(fixImageService(alvin)).toBe(alvin);
  });
});

describe("remintIds", () => {
  it("gives owned resources ids under the exhibition and rewrites references", () => {
    const { manifest } = remintIds(exhibition([editorCanvas()], { start: { id: editorCanvas().id, type: "Canvas" } }), {
      baseUrl: `${BASE}/`,
      slug: "demo",
    });
    const canvas = manifest.items[0];
    expect(manifest.id).toBe(`${BASE}/iiif/demo/manifest.json`);
    expect(canvas.id).toBe(`${BASE}/iiif/demo/canvas/1`);
    expect(canvas.items[0].items[0].target).toBe(canvas.id);
    expect(canvas.annotations[0].items[0].target.source.id).toBe(canvas.id);
    expect(manifest.start.id).toBe(canvas.id);
    // Content resources and services keep their ids.
    expect(canvas.items[0].items[0].body.id).toBe(`${SERVICE}/full/full/0/default.jpg`);
  });

  it("rewrites string targets with media fragments", () => {
    const c = editorCanvas();
    c.annotations[0].items[0].target = `${c.id}#xywh=1,2,3,4`;
    const { manifest } = remintIds(exhibition([c]), { baseUrl: BASE, slug: "demo" });
    expect(manifest.items[0].annotations[0].items[0].target).toBe(`${BASE}/iiif/demo/canvas/1#xywh=1,2,3,4`);
  });

  it("gives resources that share an id distinct ids", () => {
    const a = editorCanvas("https://x.invalid/c1");
    const b = editorCanvas("https://x.invalid/c2");
    b.items[0].items[0].id = a.items[0].items[0].id;
    const { manifest, duplicates } = remintIds(exhibition([a, b]), { baseUrl: BASE, slug: "demo" });
    expect(duplicates).toEqual([a.items[0].items[0].id]);
    expect(manifest.items[0].items[0].items[0].id).not.toBe(manifest.items[1].items[0].items[0].id);
  });

  it("is idempotent", () => {
    const once = remintIds(exhibition([editorCanvas()]), { baseUrl: BASE, slug: "demo" }).manifest;
    const twice = remintIds(once, { baseUrl: BASE, slug: "demo" }).manifest;
    expect(twice).toEqual(once);
  });

  it("does not treat partOf references as owned resources", () => {
    const c = editorCanvas(undefined, { partOf: [{ id: MS_MANIFEST, type: "Manifest" }] });
    const { manifest } = remintIds(exhibition([c]), { baseUrl: BASE, slug: "demo" });
    expect(manifest.items[0].partOf[0].id).toBe(MS_MANIFEST);
  });
});

describe("canvasSource", () => {
  it("prefers partOf, then falls back to image URLs", () => {
    expect(canvasSource(editorCanvas(undefined, { partOf: [{ id: MS_MANIFEST, type: "Manifest" }] }))).toEqual({
      manuscriptId: "100500",
      manifestId: MS_MANIFEST,
    });
    expect(canvasSource(editorCanvas())).toEqual({ manuscriptId: "100500", manifestId: MS_MANIFEST });
    expect(canvasSource({ id: "https://x.invalid/c", type: "Canvas", items: [] })).toBeNull();
  });
});

describe("prepareExhibition", () => {
  const fetchJson = fetchFrom({ [MS_MANIFEST]: manuscriptaV2() });

  it("publishes an editor export with provenance, rights and links back to manuscripta", async () => {
    const { manifest, errors, warnings } = await prepareExhibition(exhibition([editorCanvas()]), {
      slug: "demo",
      baseUrl: BASE,
      collectionId: `${BASE}/iiif/collection.json`,
      fetchJson,
    });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    const canvas = manifest.items[0];
    expect(manifest["@context"]).toBe("http://iiif.io/api/presentation/3/context.json");
    expect(manifest.partOf).toEqual([{ id: `${BASE}/iiif/collection.json`, type: "Collection" }]);
    expect(canvas.partOf[0].id).toBe(MS_MANIFEST);
    expect(canvas.homepage[0].id).toBe("https://www.manuscripta.se/ms/100500");
    expect(canvas.rights).toBe("http://creativecommons.org/licenses/by/4.0/");
    expect(canvas.requiredStatement.value.none[0]).toMatch(/Adolphson/);
    expect(canvas.items[0].items[0].body.service[0]).toEqual({ id: SERVICE, type: "ImageService3", profile: "level1" });
  });

  it("embeds a canvas that only references a manuscripta canvas", async () => {
    const ref = { id: "https://www.manuscripta.se/iiif/100500/canvas/c-2.json", type: "Canvas", label: { sv: ["A"], en: ["A"] } };
    const { manifest, errors } = await prepareExhibition(exhibition([ref]), { slug: "demo", baseUrl: BASE, fetchJson });
    expect(errors).toEqual([]);
    const canvas = manifest.items[0];
    expect(canvas.width).toBe(6200);
    expect(canvas.items[0].items[0].target).toBe(canvas.id);
    expect(canvas.items[0].items[0].body.id).toMatch(/img-2\.tif/);
  });

  it("reports a canvas missing from its manuscript", async () => {
    const ref = { id: "https://www.manuscripta.se/iiif/100500/canvas/c-99.json", type: "Canvas" };
    const { errors } = await prepareExhibition(exhibition([ref]), { slug: "demo", baseUrl: BASE, fetchJson });
    expect(errors.join("\n")).toMatch(/c-99\.json was not found/);
  });

  it("reports annotations that target something outside the exhibition", async () => {
    const c = editorCanvas();
    c.annotations[0].items[0].target.source.id = "https://elsewhere.invalid/canvas";
    const { errors } = await prepareExhibition(exhibition([c]), { slug: "demo", baseUrl: BASE, fetchJson });
    expect(errors.join("\n")).toMatch(/not a slide in this exhibition/);
  });

  it("rejects things that are not exhibitions", async () => {
    expect((await prepareExhibition({ type: "Collection" }, { slug: "x", baseUrl: BASE })).errors[0]).toMatch(/not a IIIF/);
    expect((await prepareExhibition(exhibition([], { label: {} }), { slug: "x", baseUrl: BASE })).errors.join()).toMatch(
      /no title.*|no slides/,
    );
  });

  it("warns about texts that are missing a language", async () => {
    const c = editorCanvas();
    c.label = { en: ["Untitled"] };
    c.annotations[0].items[0].body = [{ type: "TextualBody", language: "en", value: "<p>Only English</p>" }];
    const { warnings } = await prepareExhibition(exhibition([c]), { slug: "demo", baseUrl: BASE, fetchJson });
    expect(warnings.join("\n")).toMatch(/label is missing language\(s\): sv/);
    expect(warnings.join("\n")).toMatch(/“Steg 1” is missing language\(s\): sv/);
  });

  it("warns when the source manuscript has duplicate image annotation ids", async () => {
    const { warnings } = await prepareExhibition(exhibition([editorCanvas()]), {
      slug: "demo",
      baseUrl: BASE,
      fetchJson: fetchFrom({ [MS_MANIFEST]: manuscriptaV2({ duplicateAnnotationIds: true }) }),
    });
    expect(warnings.join("\n")).toMatch(/duplicate image annotation ids/);
  });

  it("works offline, without provenance checks", async () => {
    const { manifest, errors } = await prepareExhibition(exhibition([editorCanvas()]), { slug: "demo", baseUrl: BASE });
    expect(errors).toEqual([]);
    expect(manifest.items[0].homepage[0].id).toBe("https://www.manuscripta.se/ms/100500");
    expect(manifest.items[0].rights).toBeUndefined();
  });

  it("gives the same output when run on its own output", async () => {
    const options = { slug: "demo", baseUrl: BASE, fetchJson };
    const once = (await prepareExhibition(exhibition([editorCanvas()]), options)).manifest;
    const twice = (await prepareExhibition(once, options)).manifest;
    expect(twice).toEqual(once);
  });
});

describe("hasDuplicatePaintingIds", () => {
  it("detects manuscripta's shared annotation ids", () => {
    expect(hasDuplicatePaintingIds(toPresentation3(manuscriptaV2({ duplicateAnnotationIds: true })))).toBe(true);
    expect(hasDuplicatePaintingIds(toPresentation3(manuscriptaV2()))).toBe(false);
  });
});

describe("buildCollection", () => {
  it("lists exhibitions with a card-sized thumbnail from the first image service", async () => {
    const { manifest } = await prepareExhibition(exhibition([editorCanvas()]), { slug: "demo", baseUrl: BASE });
    const collection = buildCollection([manifest], { baseUrl: BASE, label: { sv: ["Utställningar"] } });
    expect(collection.id).toBe(`${BASE}/iiif/collection.json`);
    expect(collection.items[0]).toMatchObject({ id: manifest.id, type: "Manifest", label: manifest.label });
    expect(collection.items[0].thumbnail[0].id).toBe(`${SERVICE}/full/400,/0/default.jpg`);
  });
});
