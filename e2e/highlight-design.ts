import { type Page, expect } from "@playwright/test";

import { expectNoViolations } from "./design-screens.ts";
import { keepButton, listEntries, marks, popover, selectBetween } from "./highlight-reader.ts";
import { SAVED, SELECTED } from "./highlight-screen.ts";
import { DESKTOP } from "./look.ts";
import { reader, slot } from "./reader.ts";

function systemMarkColors(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.cssText = "background-color: Mark; color: MarkText";
    document.body.append(probe);
    const { backgroundColor, color } = getComputedStyle(probe);
    probe.remove();

    return { backgroundColor, color };
  });
}

export async function expectInsidePane(page: Page): Promise<void> {
  const box = await popover(page).boundingBox();
  const pane = await slot(page).boundingBox();
  const bar = await reader(page).locator(".rd-bar").boundingBox();
  const { width, height } = page.viewportSize() ?? DESKTOP;

  expect(box).not.toBeNull();

  const [left, top, right, bottom] = [
    Math.max(pane?.x ?? 0, 0),
    Math.max((bar?.y ?? 0) + (bar?.height ?? 0), 0),
    Math.min((pane?.x ?? 0) + (pane?.width ?? 0), width),
    Math.min((pane?.y ?? 0) + (pane?.height ?? 0), height),
  ];

  expect(box?.x ?? -1, "left edge").toBeGreaterThanOrEqual(left - 1);
  expect(box?.y ?? -1, "top edge").toBeGreaterThanOrEqual(top - 1);
  expect((box?.x ?? 0) + (box?.width ?? 0), "right edge").toBeLessThanOrEqual(right + 1);
  expect((box?.y ?? 0) + (box?.height ?? 0), "bottom edge").toBeLessThanOrEqual(bottom + 1);
}

async function expectMarkRules(page: Page, name: string, forced: boolean): Promise<void> {
  const mark = marks(reader(page).locator(".md").first()).first();
  await expect(mark).toBeVisible();

  const style = await mark.evaluate((element) => {
    const { textDecorationLine, backgroundColor, color } = getComputedStyle(element);

    return { textDecorationLine, backgroundColor, color };
  });

  expect(style.textDecorationLine, `${name}: the mark has a non-colour cue`).toContain("underline");

  if (forced) {
    expect(
      { backgroundColor: style.backgroundColor, color: style.color },
      `${name}: the mark uses the system Mark pair`,
    ).toEqual(await systemMarkColors(page));
  }
}

async function expectKeepRules(page: Page, name: string, forced: boolean): Promise<void> {
  if (!forced) {
    await expectNoViolations(page, name);

    return;
  }

  const edge = await keepButton(page).evaluate((element) => {
    const { borderTopStyle, borderTopWidth } = getComputedStyle(element);

    return { borderTopStyle, borderTopWidth };
  });

  expect(edge.borderTopStyle, `${name}: the Keep button keeps its edge`).toBe("solid");
  expect(Number(edge.borderTopWidth.replace(/px$/u, ""))).toBeGreaterThan(0);
}

async function expectTargets(page: Page, name: string): Promise<void> {
  const targets = [keepButton(page), ...(await listEntries(page).getByRole("button").all())];

  for (const target of targets) {
    const box = await target.boundingBox();

    expect(box?.height, `${name}: target height`).toBeGreaterThanOrEqual(44);
    expect(box?.width, `${name}: target width`).toBeGreaterThanOrEqual(44);
  }
}

export async function expectDesign(
  page: Page,
  name: string,
  { forced, narrow }: Readonly<{ forced: boolean; narrow: boolean }>,
): Promise<void> {
  const body = reader(page).locator(".md").first();

  await expect(listEntries(page)).toHaveCount(SAVED.length);
  await expectMarkRules(page, name, forced);
  await selectBetween(body, ...SELECTED);
  await expect(keepButton(page)).toBeVisible();
  await expectInsidePane(page);
  await expectKeepRules(page, name, forced);

  if (narrow) await expectTargets(page, name);
}
