import { describe, expect, it } from "vitest";
import { localised, prepareForViewer, selectLanguage } from "../shared/viewer-manifest.js";

describe("localised", () => {
  it("prefers the requested language, then none, sv, en", () => {
    expect(localised({ sv: ["Hej"], en: ["Hello"] }, "en")).toBe("Hello");
    expect(localised({ none: ["A 148"], en: ["x"] }, "sv")).toBe("A 148");
    expect(localised({ de: ["Hallo"] }, "sv")).toBe("Hallo");
    expect(localised("plain", "sv")).toBe("plain");
    expect(localised(undefined, "sv")).toBe("");
  });
});

describe("selectLanguage", () => {
  it("keeps only the chosen language in language maps that have it", () => {
    expect(selectLanguage({ label: { sv: ["A"], en: ["B"] } }, "en")).toEqual({ label: { en: ["B"] } });
    expect(selectLanguage({ label: { none: ["A 148"] } }, "en")).toEqual({ label: { none: ["A 148"] } });
    expect(selectLanguage({ label: { sv: ["Bara svenska"] } }, "en")).toEqual({ label: { sv: ["Bara svenska"] } });
  });

  it("keeps only the matching text body when there is one", () => {
    const body = [
      { type: "TextualBody", language: "sv", value: "Hej" },
      { type: "TextualBody", language: "en", value: "Hello" },
    ];
    expect(selectLanguage({ body }, "sv")).toEqual({ body: [body[0]] });
    expect(selectLanguage({ body }, "de")).toEqual({ body });
  });

  it("does not mistake other objects for language maps", () => {
    const service = [{ id: "https://x", type: "ImageService3", profile: "level1" }];
    expect(selectLanguage({ service }, "sv")).toEqual({ service });
    expect(selectLanguage({ behavior: ["w-6", "h-8"] }, "sv")).toEqual({ behavior: ["w-6", "h-8"] });
  });
});

describe("prepareForViewer", () => {
  const homepage = [{ id: "https://www.manuscripta.se/ms/100500", type: "Text", label: { sv: ["Visa hela"], en: ["View all"] } }];

  it("adds a link to the whole manuscript to the slide's summary, per language", () => {
    const manifest = {
      id: "m",
      type: "Manifest",
      items: [{ id: "c", type: "Canvas", homepage, summary: { sv: ["<p>Text</p>"], en: ["<p>Text</p>"] } }],
    };
    const en = prepareForViewer(manifest, "en").items[0].summary;
    expect(en).toEqual({
      en: ['<p>Text</p><p class="exhibition-homepage-link"><a href="https://www.manuscripta.se/ms/100500">View all →</a></p>'],
    });
    expect(prepareForViewer(manifest, "sv").items[0].summary.sv[0]).toMatch(/Visa hela →/);
    // The published manifest is not modified.
    expect(manifest.items[0].summary.en).toEqual(["<p>Text</p>"]);
  });

  it("adds the link to slides without a summary and leaves slides without a homepage alone", () => {
    const prepared = prepareForViewer({ id: "m", type: "Manifest", items: [{ id: "a", homepage }, { id: "b" }] }, "sv");
    expect(prepared.items[0].summary.sv[0]).toMatch(/^<p class="exhibition-homepage-link">/);
    expect(prepared.items[1].summary).toBeUndefined();
  });

  it("escapes the link", () => {
    const evil = [{ id: 'https://x.invalid/"><script>', label: { en: ["<b>"] } }];
    const html = prepareForViewer({ id: "m", items: [{ id: "a", homepage: evil, summary: { en: [""] } }] }, "en").items[0].summary.en[0];
    expect(html).not.toMatch(/<script>|<b>/);
  });
});
