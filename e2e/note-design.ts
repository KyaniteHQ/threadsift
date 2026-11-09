import { AxeBuilder } from "@axe-core/playwright";
import { type Page, expect } from "@playwright/test";

import { expectNoViolations } from "./design-screens.ts";
import {
  alerts,
  expectSaveEnabled,
  keepMine,
  newerBlock,
  noteBox,
  noteField,
  saveButton,
  status,
  takeNewer,
  write,
} from "./note-reader.ts";
import { saved } from "./notes.ts";

const MINIMUM_TARGET = 44;

async function expectTargets(page: Page, name: string): Promise<void> {
  const targets = [
    noteField(page),
    saveButton(page),
    ...(await noteBox(page).getByRole("button").all()),
  ];

  for (const target of targets) {
    const box = await target.boundingBox();

    expect(box?.height, `${name}: target height`).toBeGreaterThanOrEqual(MINIMUM_TARGET);
  }

  for (const button of await noteBox(page).getByRole("button").all()) {
    expect((await button.boundingBox())?.width, `${name}: target width`).toBeGreaterThanOrEqual(
      MINIMUM_TARGET,
    );
  }
}

async function expectAccessible(page: Page, name: string): Promise<void> {
  const results = await new AxeBuilder({ page }).include(".rd-nt").analyze();

  expect(
    results.violations.map(({ id, nodes }) => [id, nodes.map(({ html }) => html)]),
    `${name}: accessibility violations`,
  ).toEqual([]);
}

async function expectFieldEdge(page: Page, name: string): Promise<void> {
  const edge = await noteField(page).evaluate((element) => {
    const { borderTopStyle, borderTopWidth } = getComputedStyle(element);

    return { borderTopStyle, borderTopWidth: Number(borderTopWidth.replace(/px$/u, "")) };
  });

  expect(edge.borderTopStyle, `${name}: the field keeps its edge`).toBe("solid");
  expect(edge.borderTopWidth).toBeGreaterThan(0);
}

async function check(
  page: Page,
  name: string,
  { forced, narrow }: Readonly<{ forced: boolean; narrow: boolean }>,
): Promise<void> {
  await noteBox(page).scrollIntoViewIfNeeded();

  if (forced) await expectFieldEdge(page, name);
  else {
    await expectNoViolations(page, name);
    await expectAccessible(page, name);
  }

  if (narrow) await expectTargets(page, name);
}

export async function walkStates(
  page: Page,
  itemId: number,
  request: Parameters<typeof saved>[0],
  name: string,
  mode: Readonly<{ forced: boolean; narrow: boolean }>,
  shoot: (state: string) => Promise<void>,
): Promise<void> {
  await expect(noteField(page)).toHaveValue(/Saved note/u);
  await check(page, `${name}, saved`, mode);
  await shoot("saved");

  await write(page, "A longer draft of the note, still to be saved.\n\nIt has a second paragraph.");
  await expectSaveEnabled(page, true);
  await check(page, `${name}, edited`, mode);
  await shoot("edited");

  await write(page, "x".repeat(10_001));
  await expect(alerts(page)).toHaveCount(1);
  await check(page, `${name}, too long`, mode);
  await shoot("too-long");

  await write(page, "A draft that the other tab will overtake.");
  await page.route(`**/api/items/${itemId}/note`, (route) => route.abort());
  await saveButton(page).click();
  await expect(alerts(page)).toHaveCount(1);
  await check(page, `${name}, failed`, mode);
  await shoot("failed");
  await page.unroute(`**/api/items/${itemId}/note`);

  await saved(request, itemId, "Newer note written in another tab.\n\nWith two paragraphs.", 1);
  await saveButton(page).click();
  await expect(newerBlock(page)).toBeVisible();
  await check(page, `${name}, newer version`, mode);
  await shoot("newer");

  await keepMine(page).hover();
  await takeNewer(page).click();
  await expect(newerBlock(page)).toHaveCount(0);
  await expect(status(page)).toHaveText("");
}
