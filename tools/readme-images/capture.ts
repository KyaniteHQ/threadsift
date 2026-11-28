import { chromium } from "@playwright/test";

import type { Instance } from "./instance.ts";
import { HIGHLIGHTS } from "./library-articles.ts";
import type { Ids } from "./seed.ts";
import { sequence } from "./sequence.ts";
import type { Shot, Theme } from "./views.ts";

export const SCALE = 2;

const SETTLE_MS = 1500;

const SETTINGS_KEY = "threadsift.settings";

function cookieOf(instance: Readonly<Instance>) {
  const at = instance.cookie.indexOf("=");

  return {
    name: instance.cookie.slice(0, at),
    value: instance.cookie.slice(at + 1),
    domain: "127.0.0.1",
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Lax" as const,
  };
}

async function openContext(
  instance: Readonly<Instance>,
  size: Readonly<{ width: number; height: number }>,
  settings: Readonly<Record<string, string>>,
) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: instance.base,
    viewport: size,
    deviceScaleFactor: SCALE,
  });

  await context.addCookies([cookieOf(instance)]);
  await context.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key ?? "", value ?? "");
    },
    [SETTINGS_KEY, JSON.stringify(settings)],
  );

  return { page: await context.newPage(), close: () => browser.close() };
}

export async function capture(
  instance: Readonly<Instance>,
  ids: Ids,
  shot: Readonly<Shot>,
  theme: Theme,
  file: string,
): Promise<void> {
  const { page, close } = await openContext(instance, shot, {
    theme,
    layout: shot.layout,
    openAs: "page",
    style: shot.style,
  });

  await page.goto(shot.path(ids));
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  if (shot.jumpToComments) await page.getByRole("button", { name: /^Comments/u }).click();
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.screenshot({ path: file });
  await close();
}

export async function keepHighlights(instance: Readonly<Instance>, ids: Ids): Promise<void> {
  const { page, close } = await openContext(
    instance,
    { width: 1280, height: 800 },
    { theme: "light", layout: "list", openAs: "page", style: "library" },
  );

  await sequence(HIGHLIGHTS, async ({ key, exact }) => {
    await page.goto(`/items/${String(ids[key])}`);
    await page.getByText(exact.slice(0, 20)).first().waitFor();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(SETTLE_MS);
    await page.evaluate((text) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const at = (node.textContent ?? "").indexOf(text);

        if (at >= 0) {
          const range = document.createRange();

          range.setStart(node, at);
          range.setEnd(node, at + text.length);
          getSelection()?.removeAllRanges();
          getSelection()?.addRange(range);
          document.dispatchEvent(new Event("selectionchange"));
          node.parentElement?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

          return;
        }
      }
    }, exact);
    await page.getByRole("button", { name: /Keep/u }).evaluate((button) => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.getByRole("button", { name: "Remove" }).first().waitFor({ state: "attached" });
  });
  await close();
}
