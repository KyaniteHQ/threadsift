import { type Page, expect, test } from "@playwright/test";

import { SETTINGS } from "../design/system/settings.ts";
import { app, computed, px, seedItems, storeSettings, titledRow } from "./look.ts";

const FONT_ROW = SETTINGS.find((row) => row.key === "font");
const FAMILY_TOKENS = ["--f-display", "--f-ui", "--f-read", "--f-mono"] as const;

test("html takes the theme's background and colour scheme in each theme", async ({ page }) => {
  const seen = new Map<string, string>();

  for (const [theme, scheme] of [
    ["light", "light"],
    ["dark", "dark"],
    ["sepia", "light"],
  ] as const) {
    await storeSettings(page, { theme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    const drawn = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.background = "var(--bg)";
      document.querySelector(".app")?.append(probe);
      const token = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const html = getComputedStyle(document.documentElement);

      return { token, background: html.backgroundColor, scheme: html.colorScheme };
    });

    expect(drawn.background, `${theme}: html background is --bg`).toBe(drawn.token);
    expect(drawn.scheme, `${theme}: html colour scheme`).toBe(scheme);
    seen.set(theme, drawn.background);
  }

  expect(new Set(seen.values()).size, "three themes, three backgrounds").toBe(3);
});

test("raising the root font size raises the row title, so the type tokens follow rem", async ({
  page,
}) => {
  await seedItems(page);
  await storeSettings(page, {});
  const title = titledRow(page).locator(".it-title");
  const before = px(await computed(page, "article.it .it-title", "font-size"));
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "20px";
  });

  await expect(title).toBeVisible();
  const after = px(await computed(page, "article.it .it-title", "font-size"));

  expect(after).toBeCloseTo((before * 20) / 16, 1);
});

function watchRequests(page: Page) {
  const origins = new Set<string>();
  const fontFiles: { url: string; status: number }[] = [];
  page.on("request", (request) => origins.add(new URL(request.url()).origin));
  page.on("response", (response) => {
    if (response.request().resourceType() === "font") {
      fontFiles.push({ url: response.url(), status: response.status() });
    }
  });

  return { origins, fontFiles };
}

function loadFamilies(page: Page) {
  return page.evaluate((tokens) => {
    const style = getComputedStyle(document.querySelector(".app") ?? document.body);

    const families = new Set(
      tokens.map((token) =>
        (style.getPropertyValue(token).split(",")[0] ?? "").trim().replaceAll(/^["']|["']$/gu, ""),
      ),
    );

    return Promise.all(
      [...families].map(async (family) => ({
        family,
        faces: (await document.fonts.load(`1em "${family}"`)).length,
      })),
    );
  }, FAMILY_TOKENS);
}

test("every Font pair's families load from the app's own origin", async ({ page, baseURL }) => {
  await seedItems(page);
  const origin = new URL(baseURL ?? "").origin;
  const { origins, fontFiles } = watchRequests(page);

  for (const option of FONT_ROW?.options ?? []) {
    await storeSettings(page, { font: option.id });
    await expect(app(page)).toHaveAttribute("data-font", option.id);

    for (const { family, faces } of await loadFamilies(page)) {
      expect(faces, `${option.id}: faces loaded for ${family}`).toBeGreaterThan(0);
    }
  }

  const italics = await page.evaluate(() =>
    [...document.fonts].flatMap((face) => (face.style === "italic" ? [face.family] : [])),
  );

  expect(italics, "the italic faces of the Google Fonts list are declared").toEqual(
    expect.arrayContaining(["Newsreader Variable", "Instrument Serif"]),
  );
  expect(fontFiles.length, "font files were fetched").toBeGreaterThan(0);

  for (const { url, status } of fontFiles) {
    expect(new URL(url).origin, `font file ${url}`).toBe(origin);
    expect(status, `font file ${url}`).toBe(200);
  }

  expect([...origins], "every request goes to the app's origin").toEqual([origin]);
});
