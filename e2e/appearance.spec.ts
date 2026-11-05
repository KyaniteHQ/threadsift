import { type Locator, type Page, expect, test } from "@playwright/test";

import { SETTINGS, STORAGE_KEY } from "../design/system/settings.ts";
import { app, openPanel, pickOption, px, storeSettings, computed, titledRow } from "./look.ts";

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

test("loading rows and skeleton bars shimmer, and stand still under reduced motion", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("article.it").first()).toBeVisible();
  await page.evaluate(() => {
    const row = document.createElement("div");
    row.className = "it it-ghost";
    row.append(document.createElement("i"));
    const bars = document.createElement("div");
    bars.className = "skel";
    bars.append(document.createElement("i"));
    document.querySelector(".app")?.append(row, bars);
  });

  for (const [motion, animation] of [
    ["no-preference", "shimmer"],
    ["reduce", "none"],
  ] as const) {
    await page.emulateMedia({ reducedMotion: motion });

    for (const selector of [".it-ghost i", ".skel i"]) {
      expect(
        await computed(page.locator(selector), "animation-name"),
        `${selector}, ${motion}`,
      ).toBe(animation);
    }
  }
});

test("raising the root font size raises the row title, so the type tokens follow rem", async ({
  page,
}) => {
  await storeSettings(page, {});
  const title = titledRow(page).locator(".it-title");
  const before = px(await computed(title, "font-size"));
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "20px";
  });

  await expect(title).toBeVisible();
  const after = px(await computed(title, "font-size"));

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

const COLD_THEMES = [
  { stored: { theme: "dark" }, scheme: "light", expected: "dark" },
  { stored: { theme: "system" }, scheme: "dark", expected: "dark" },
  { stored: { theme: "system" }, scheme: "light", expected: "light" },
] as const;

test("a stored theme is on html before the app script runs, and an unreadable store leaves Light", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const watch = new MutationObserver(() => {
      if (document.body !== null) {
        const theme = document.documentElement.dataset["theme"] ?? "none";
        document.documentElement.dataset["themeAtBody"] = theme;
        watch.disconnect();
      }
    });

    watch.observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  await page.route("**/assets/*.js", (route) => route.abort());
  const html = page.locator("html");

  for (const { stored, scheme, expected } of COLD_THEMES) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate(
      ({ key, value }) => {
        localStorage.setItem(key, value);
      },
      { key: STORAGE_KEY, value: JSON.stringify(stored) },
    );
    await page.goto("/");
    await expect(html, `${stored.theme} on a ${scheme} device`).toHaveAttribute(
      "data-theme-at-body",
      expected,
    );
    await expect(html).toHaveAttribute("data-theme", expected);
    await expect(page.locator(".app")).toHaveCount(0);
  }

  for (const value of ["{not json", '{"theme":"neon"}', "null"]) {
    await page.evaluate(
      ({ key, text }) => {
        localStorage.setItem(key, text);
      },
      { key: STORAGE_KEY, text: value },
    );
    await page.goto("/");
    await expect(html, `stored ${value}`).toHaveAttribute("data-theme-at-body", "none");
  }
});

test("the page declares its charset before the inline theme script, within the first 1024 bytes", async ({
  request,
}) => {
  const text = await (await request.get("/")).text();
  const charset = text.indexOf("<meta charset");
  const script = text.indexOf("<script>");

  expect(charset, "the page has a charset meta").toBeGreaterThanOrEqual(0);
  expect(charset, "the charset comes before the inline script").toBeLessThan(script);
  expect(Buffer.byteLength(text.slice(0, charset)), "and starts inside 1024 bytes").toBeLessThan(
    1024,
  );
});

async function expectSegmentsTellable(page: Page, dialog: Locator): Promise<void> {
  expect(
    await page.evaluate(() => matchMedia("(forced-colors: active)").matches),
    "the browser is in forced colours",
  ).toBe(true);

  const groups = await dialog.locator(".st-seg").evaluateAll((frames) =>
    frames.map((frame) =>
      [...frame.querySelectorAll(".st-b")].map((radio) => ({
        checked: radio.querySelector("input")?.checked === true,
        background: getComputedStyle(radio).backgroundColor,
      })),
    ),
  );

  expect(groups, "the panel has segmented groups").not.toHaveLength(0);

  for (const segments of groups) {
    const chosen = segments.filter((segment) => segment.checked);

    expect(chosen, "one segment is chosen in each group").toHaveLength(1);

    for (const other of segments.filter((segment) => !segment.checked)) {
      expect(chosen[0]?.background, "the chosen segment's fill differs from the others").not.toBe(
        other.background,
      );
    }
  }
}

test("under forced colours the chosen segment and each accent swatch can be told apart", async ({
  page,
}) => {
  await page.goto("/");
  await page.emulateMedia({ forcedColors: "active" });
  const dialog = await openPanel(page);

  await expectSegmentsTellable(page, dialog);

  await pickOption(dialog, "Accent", "Moss");

  const swatches = await dialog.locator(".st-sw").evaluateAll((radios) =>
    radios.map((radio) => ({
      checked: radio.querySelector("input")?.checked === true,
      background: getComputedStyle(radio).backgroundColor,
      outline: getComputedStyle(radio).outlineStyle,
    })),
  );

  expect(new Set(swatches.map((swatch) => swatch.background)).size, "five accent fills").toBe(5);

  for (const swatch of swatches) {
    expect(swatch.outline !== "none", "only the chosen swatch is outlined").toBe(swatch.checked);
  }
});
