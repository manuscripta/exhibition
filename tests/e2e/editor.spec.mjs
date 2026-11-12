import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const EDITOR = "http://localhost:4174";
const SAMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../exhibitions/ur-samlingarna.json");

async function skipOnboarding(page) {
  const skip = page.getByRole("button", { name: /skip for now/i });
  try {
    await skip.click({ timeout: 5000 });
  } catch {
    // The format dialog is not always shown.
  }
}

test("a curator can start a new exhibition and find it again among the drafts", async ({ page }) => {
  await page.goto(`${EDITOR}/`);
  await page.getByRole("button", { name: "Ny utställning" }).click();
  await expect(page).toHaveURL(/#\/edit\/draft-/);
  await skipOnboarding(page);
  await expect(page.getByText(/Sparat i webbläsaren/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add new slide" }).first()).toBeVisible();

  await page.getByRole("link", { name: /Utkast/ }).click();
  await expect(page.getByRole("link", { name: "Ny utställning" })).toBeVisible();
});

test("an exhibition file opens in the editor, previews in the viewer and downloads for publishing", async ({ page, context }) => {
  await page.goto(`${EDITOR}/`);
  await page.locator('input[type="file"]').setInputFiles(SAMPLE);
  await expect(page).toHaveURL(/#\/edit\/draft-/);
  await skipOnboarding(page);
  await expect(page.locator(".editor-header__title")).toHaveText("Ur manuscriptas samlingar");

  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Förhandsgranska" }).click();
  const preview = await popupPromise;
  await expect(preview.getByText("Förhandsgranskning av ett utkast")).toBeVisible();
  await expect(preview).toHaveTitle(/Ur manuscriptas samlingar/);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ladda ner för publicering" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("ur-samlingarna.json");
  const manifest = JSON.parse(await fs.readFile(await download.path(), "utf8"));
  expect(manifest.type).toBe("Manifest");
  expect(manifest.items).toHaveLength(5);
});

test("the image browser starts from the list of manuscripta manuscripts", async ({ page }) => {
  await page.goto(`${EDITOR}/`);
  await page.getByRole("button", { name: "Ny utställning" }).click();
  await skipOnboarding(page);
  await page.getByRole("button", { name: "Add new slide" }).first().click();
  await page.getByRole("button", { name: "Open IIIF Browser" }).click();
  await page.getByRole("button", { name: /go home/i }).click();
  await expect(page.getByText("Manuscripts on manuscripta.se")).toBeVisible();
});
