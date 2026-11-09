import { expect, test } from "@playwright/test";

import { NOTE_SAVED } from "../web/src/reader-text.ts";
import { sheet, showGrid } from "./grid.ts";
import { seedThread } from "./highlight-reader.ts";
import { screenForFile, thread } from "./highlight-screen.ts";
import { noteBox, noteField, status, writeAndSave } from "./note-reader.ts";
import { expectConsistent } from "./notes.ts";
import { reader } from "./reader.ts";

const screenOf = screenForFile();

for (const openAs of ["page", "sheet"] as const) {
  test(`in Grid ${openAs} the Note box is saved from the keyboard, library keys leave the field alone, and Escape leaves the field before it closes the Reader`, async () => {
    const { page } = screenOf();
    const id = await seedThread(screenOf(), thread(`g${openAs}`));
    await seedThread(screenOf(), thread(`h${openAs}`));
    await showGrid(page, openAs, `/items/${id}`);
    const address = page.url();

    await expect(reader(page)).toBeVisible();

    if (openAs === "sheet") await expect(sheet(page).locator(".rd-nt")).toBeVisible();
    else await expect(sheet(page)).toHaveCount(0);

    await expect(noteBox(page)).toHaveCount(1);
    await noteField(page).scrollIntoViewIfNeeded();
    await noteField(page).focus();
    await page.keyboard.type("jk m/ in the grid");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ControlOrMeta+Enter");

    await expect(status(page)).toHaveText(NOTE_SAVED);
    expect(page.url()).toBe(address);
    await expectConsistent(screenOf(), id, { body: "jk m/ in the grid", revision: 1 });

    await page.keyboard.press("Escape");
    await expect(noteField(page)).not.toBeFocused();
    await expect(reader(page)).toBeVisible();
    expect(page.url()).toBe(address);

    await writeAndSave(page, "Second text from the grid");
    await expect(status(page)).toHaveText(NOTE_SAVED);
    await expectConsistent(screenOf(), id, { body: "Second text from the grid", revision: 2 });

    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(address);
  });
}
