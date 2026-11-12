import { expect, test } from "@playwright/test";

const VIEWER = "http://localhost:4173";

// Fail any test in which the page throws an uncaught error.
const pageErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page), "uncaught page errors").toEqual([]);
});

test("start page lists the published exhibitions", async ({ page }) => {
  await page.goto(`${VIEWER}/?lang=sv`);
  await expect(page.getByRole("heading", { level: 1, name: "manuscripta.se Utställningar" })).toBeVisible();
  const card = page.getByRole("link", { name: /Ur manuscriptas samlingar/ });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\?e=ur-samlingarna/);
  await expect(page).toHaveTitle(/Ur manuscriptas samlingar/);
});

test("exhibition renders in all three modes, in Swedish and English", async ({ page }) => {
  await page.goto(`${VIEWER}/?e=ur-samlingarna&lang=sv`);
  await expect(page.getByText("Codex Gigas: djävulsbilden", { exact: false }).first()).toBeVisible();

  await page.getByRole("link", { name: "Bildspel" }).click();
  await expect(page).toHaveURL(/mode=slideshow/);
  await expect(page.getByText("Om utställningen", { exact: false }).first()).toBeVisible();

  await page.getByRole("button", { name: "Language: English" }).click();
  await expect(page.getByText("About the exhibition", { exact: false }).first()).toBeVisible();
  await expect(page).toHaveTitle(/From the manuscripta collections/);

  await page.getByRole("link", { name: "Presentation" }).click();
  await expect(page).toHaveURL(/mode=presentation/);
  await expect(page.locator(".delft-presentation-viewer")).toBeVisible();
});

test("every image slide links to the whole manuscript on manuscripta.se", async ({ page }) => {
  await page.goto(`${VIEWER}/?e=ur-samlingarna&lang=sv`);
  const link = page.getByRole("link", { name: /Visa hela handskriften på manuscripta.se/ }).first();
  await expect(link).toHaveAttribute("href", "https://www.manuscripta.se/ms/100500");
});

test("published IIIF is valid Presentation 3", async ({ request }) => {
  const collection = await (await request.get(`${VIEWER}/iiif/collection.json`)).json();
  expect(collection.type).toBe("Collection");
  for (const item of collection.items) {
    const slug = item.id.match(/\/iiif\/([^/]+)\/manifest\.json$/)[1];
    const manifest = await (await request.get(`${VIEWER}/iiif/${slug}/manifest.json`)).json();
    expect(manifest["@context"]).toBe("http://iiif.io/api/presentation/3/context.json");
    expect(manifest.type).toBe("Manifest");
    for (const canvas of manifest.items) {
      expect(canvas.id.startsWith(manifest.id.replace(/manifest\.json$/, ""))).toBe(true);
    }
  }
});

test("draft preview waits for the editor and ignores unrelated messages", async ({ page }) => {
  await page.goto(`${VIEWER}/?preview=1&lang=sv`);
  await expect(page.getByText("Förhandsgranskning av ett utkast")).toBeVisible();
  await expect(page.getByText("Väntar på utkastet")).toBeVisible();
  await page.evaluate(() => window.postMessage({ type: "something-else", manifest: { type: "Manifest" } }, "*"));
  await expect(page.getByText("Väntar på utkastet")).toBeVisible();
});
