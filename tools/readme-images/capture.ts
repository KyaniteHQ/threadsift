import type { Instance } from "./instance.ts";
import { HIGHLIGHTS } from "./library-articles.ts";
import { type Rig, SCALE } from "./rig.ts";
import type { Ids } from "./seed.ts";
import { sequence } from "./sequence.ts";
import type { Shot, Theme } from "./views.ts";

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

async function animationsDone(): Promise<void> {
  await Promise.all(
    document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
      .map((animation) => animation.finished),
  );
  await new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

async function stoppedMoving(element: Element): Promise<void> {
  const STILL_FRAMES = 10;
  const nextFrame = () =>
    new Promise<number>((resolve) => {
      requestAnimationFrame(() => {
        resolve(element.getBoundingClientRect().top);
      });
    });
  const settle = async (last: number, still: number): Promise<void> => {
    if (still >= STILL_FRAMES) return;
    const top = await nextFrame();

    await settle(top, top === last ? still + 1 : 0);
  };

  await settle(Number.NaN, 0);
}

async function openContext(
  rig: Readonly<Rig>,
  instance: Readonly<Instance>,
  size: Readonly<{ width: number; height: number }>,
  settings: Readonly<Record<string, string>>,
) {
  const context = await rig.newContext({ width: size.width, height: size.height, scale: SCALE });

  await context.addCookies([cookieOf(instance)]);
  await context.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key ?? "", value ?? "");
    },
    [SETTINGS_KEY, JSON.stringify(settings)],
  );
  const page = await context.newPage();

  const settled = async () => {
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(animationsDone);
  };

  const scrollEnded = () => page.locator(".rd-comments h3").evaluate(stoppedMoving);

  return { page, settled, scrollEnded, close: () => context.close() };
}

export async function capture(
  rig: Readonly<Rig>,
  instance: Readonly<Instance>,
  ids: Ids,
  shot: Readonly<Shot>,
  theme: Theme,
  file: string,
): Promise<void> {
  const { page, settled, scrollEnded, close } = await openContext(rig, instance, shot, {
    theme,
    layout: shot.layout,
    openAs: "page",
    style: shot.style,
  });

  try {
    await page.goto(`${instance.base}${shot.path(ids)}`);
    await settled();
    if (shot.jumpToComments) {
      await page.getByRole("button", { name: /^Comments/u }).click();
      await scrollEnded();
      await settled();
    }
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await page.screenshot({ path: file });
  } finally {
    await close();
  }
}

export async function keepHighlights(
  rig: Readonly<Rig>,
  instance: Readonly<Instance>,
  ids: Ids,
): Promise<void> {
  const { page, settled, close } = await openContext(
    rig,
    instance,
    { width: 1280, height: 800 },
    { theme: "light", layout: "list", openAs: "page", style: "library" },
  );

  try {
    await sequence(HIGHLIGHTS, async ({ key, exact }) => {
      await page.goto(`${instance.base}/items/${String(ids[key])}`);
      await page.getByText(exact.slice(0, 20)).first().waitFor();
      await settled();
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
  } finally {
    await close();
  }
}
