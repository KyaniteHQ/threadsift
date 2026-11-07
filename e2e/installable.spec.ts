/* oxlint-disable unicorn/consistent-function-scoping -- page.evaluate serialises each callback, so its helpers must sit inside it */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, expect } from "@playwright/test";
import { z } from "zod";

import { test } from "./access.ts";
import { foreignSitesPerFile } from "./share.ts";

const ManifestSchema = z.object({
  id: z.string(),
  name: z.literal("Threadsift"),
  short_name: z.literal("Threadsift"),
  description: z.string().min(1),
  start_url: z.string(),
  scope: z.string(),
  display: z.literal("standalone"),
  theme_color: z.string(),
  background_color: z.string(),
  icons: z.array(
    z.object({
      src: z.string(),
      sizes: z.string(),
      type: z.literal("image/png"),
      purpose: z.enum(["any", "maskable"]),
    }),
  ),
  share_target: z.object({
    action: z.string(),
    method: z.literal("POST"),
    enctype: z.literal("application/x-www-form-urlencoded"),
    params: z.object({ title: z.literal("title"), text: z.literal("text"), url: z.literal("url") }),
  }),
});

const INSTALL_ICON_SIZES = ["192x192", "512x512"];

const foreign = foreignSitesPerFile();

async function inFullChrome(url: string) {
  const profile = mkdtempSync(join(tmpdir(), "threadsift-chrome-"));

  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
  });

  try {
    const page = await context.newPage();
    await page.goto(url);
    const session = await context.newCDPSession(page);
    const { product } = await session.send("Browser.getVersion");
    const { installabilityErrors } = await session.send("Page.getInstallabilityErrors");

    return { product, errors: installabilityErrors.map((error) => error.errorId) };
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

test("full Chrome reports a manifest error for a page without one and no installability error for the app", async ({
  baseURL,
}, testInfo) => {
  const control = await inFullChrome(`${foreign().sameSite}/`);
  const app = await inFullChrome(`${baseURL}/`);
  const artifact = testInfo.outputPath("installability.json");
  writeFileSync(artifact, JSON.stringify({ control, app }, null, 2));
  await testInfo.attach("installability.json", { path: artifact, contentType: "application/json" });

  expect(control.product).toContain("Chrome/");
  expect(control.errors, "a page with no manifest").toContain("no-manifest");
  expect(app.errors, "the built app").toEqual([]);
});

test("the manifest declares the share target inside its scope, with icons served to a signed-out request", async ({
  page,
  stranger,
  baseURL,
}) => {
  const response = await stranger.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = ManifestSchema.parse(await response.json());

  expect(new URL(manifest.share_target.action, baseURL).pathname.startsWith(manifest.scope)).toBe(
    true,
  );
  expect(new URL(manifest.start_url, baseURL).pathname.startsWith(manifest.scope)).toBe(true);
  expect(manifest.icons.filter((icon) => icon.purpose === "any").map((icon) => icon.sizes)).toEqual(
    INSTALL_ICON_SIZES,
  );
  expect(manifest.icons.filter((icon) => icon.purpose === "maskable")).toHaveLength(1);

  await page.goto("/");

  for (const icon of manifest.icons) {
    const served = await stranger.get(icon.src);
    expect(served.status(), icon.src).toBe(200);
    expect(served.headers()["content-type"], icon.src).toBe("image/png");

    const decoded = await page.evaluate(async (src) => {
      const bitmap = await createImageBitmap(
        await (await fetch(src, { credentials: "omit" })).blob(),
      );

      return `${bitmap.width}x${bitmap.height}`;
    }, icon.src);

    expect(decoded, icon.src).toBe(icon.sizes);
  }
});

test("the maskable icon is opaque and keeps its art inside the centred 40% circle", async ({
  page,
}) => {
  await page.goto("/");

  const stray = await page.evaluate(async (src) => {
    const bitmap = await createImageBitmap(
      await (await fetch(src, { credentials: "omit" })).blob(),
    );

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (context === null) {
      throw new Error("no 2d context");
    }

    context.drawImage(bitmap, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const [r0, g0, b0] = data;
    let translucent = 0;
    let outside = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const at = (y * width + x) * 4;
        translucent += data[at + 3] === 255 ? 0 : 1;
        const isArt = data[at] !== r0 || data[at + 1] !== g0 || data[at + 2] !== b0;
        const distance = Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2);
        outside += isArt && distance > 0.4 * width ? 1 : 0;
      }
    }

    return { translucent, outside };
  }, "/icon-maskable-512.png");

  expect(stray).toEqual({ translucent: 0, outside: 0 });
});

test("the manifest and the page head take their colours from the design tokens", async ({
  page,
  stranger,
}) => {
  const manifest = ManifestSchema.parse(await (await stranger.get("/manifest.webmanifest")).json());
  await page.goto("/");

  const tokens = await page.evaluate(() => {
    const hexOf = (theme: string): string => {
      const swatch = document.createElement("div");
      swatch.className = "app";
      swatch.dataset["theme"] = theme;
      swatch.style.background = "var(--bg)";
      document.body.append(swatch);
      const canvas = new OffscreenCanvas(1, 1);
      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (context === null) {
        throw new Error("no 2d context");
      }

      context.fillStyle = getComputedStyle(swatch).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      swatch.remove();
      const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;

      return `#${[r, g, b].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
    };

    const meta = (scheme: string) =>
      document
        .querySelector(`meta[name="theme-color"][media="(prefers-color-scheme: ${scheme})"]`)
        ?.getAttribute("content");

    return {
      light: hexOf("light"),
      dark: hexOf("dark"),
      metaLight: meta("light"),
      metaDark: meta("dark"),
    };
  });

  expect(manifest.theme_color).toBe(tokens.light);
  expect(manifest.background_color).toBe(tokens.light);
  expect(tokens.metaLight).toBe(tokens.light);
  expect(tokens.metaDark).toBe(tokens.dark);
});
