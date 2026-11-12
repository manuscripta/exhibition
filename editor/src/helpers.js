export { localised } from "../../shared/viewer-manifest.js";

/** URL-safe file name from an exhibition title: "Ur manuscriptas samlingar" -> "ur-manuscriptas-samlingar". */
export function slugify(text) {
  return (
    String(text || "")
      .toLowerCase()
      .replace(/[åä]/g, "a")
      .replace(/ö/g, "o")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "utstallning"
  );
}

/** A new, empty exhibition manifest. Ids are placeholders; publishing gives them their final form. */
export function blankExhibition(draftId) {
  return {
    "@context": "http://iiif.io/api/presentation/3/context.json",
    id: `https://exhibition.invalid/${draftId}/manifest.json`,
    type: "Manifest",
    label: { sv: ["Ny utställning"], en: ["New exhibition"] },
    summary: { sv: [""], en: [""] },
    items: [],
  };
}

export function downloadJson(json, fileName) {
  const blob = new Blob([`${JSON.stringify(json, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function navigate(hash) {
  window.location.hash = hash;
}
