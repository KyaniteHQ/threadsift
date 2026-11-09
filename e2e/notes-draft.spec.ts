import { expect, test } from "@playwright/test";

import { NOTE_SAVED } from "../web/src/reader-text.ts";
import { openReader, seedThread } from "./highlight-reader.ts";
import { screenForFile, thread } from "./highlight-screen.ts";
import { DESKTOP } from "./look.ts";
import {
  expectSaveEnabled,
  keepMine,
  newerBlock,
  noteField,
  saveButton,
  status,
  takeNewer,
  writeAndSave,
} from "./note-reader.ts";
import { expectConsistent, saved } from "./notes.ts";
import { row } from "./reader.ts";

const screenOf = screenForFile();

function draftKey(id: number): string {
  return `threadsift.note-draft.${String(id)}`;
}

test("an unsaved Note comes back as a draft after the Reader shows another Item and after a reload, and a save clears it", async () => {
  const { page } = screenOf();
  const id = await seedThread(screenOf(), thread("da"));
  const other = await seedThread(screenOf(), thread("db"));
  await openReader(page, id, DESKTOP.width);

  await writeAndSave(page, "Saved first");
  await expect(status(page)).toHaveText(NOTE_SAVED);
  await noteField(page).fill("Saved first, then a draft");
  await expectSaveEnabled(page, true);

  await row(page, other).click();
  await expect(page).toHaveURL(new RegExp(`/items/${String(other)}$`, "u"));
  await expect(noteField(page)).toHaveValue("");

  await row(page, id).click();
  await expect(noteField(page)).toHaveValue("Saved first, then a draft");
  await expectSaveEnabled(page, true);
  await expectConsistent(screenOf(), id, { body: "Saved first", revision: 1 });

  await page.reload();
  await expect(noteField(page)).toHaveValue("Saved first, then a draft");
  await expectSaveEnabled(page, true);

  await saveButton(page).click();
  await expect(status(page)).toHaveText(NOTE_SAVED);
  await expectConsistent(screenOf(), id, { body: "Saved first, then a draft", revision: 2 });

  await page.reload();
  await expect(noteField(page)).toHaveValue("Saved first, then a draft");
  await expectSaveEnabled(page, false);
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey(id))).toBeNull();
});

test("a draft typed against an older Note meets the newer-version state when it is saved, whether the Reader is open in another tab or was reloaded", async () => {
  const { page, context } = screenOf();
  const id = await seedThread(screenOf(), thread("dc"));
  await openReader(page, id, DESKTOP.width);

  await writeAndSave(page, "Base text");
  await expect(status(page)).toHaveText(NOTE_SAVED);
  await noteField(page).fill("My unsaved edit");

  const second = await context.newPage();
  await openReader(second, id, DESKTOP.width);
  await expect(noteField(second)).toHaveValue("My unsaved edit");
  await second.close();

  await saved(context.request, id, "Written elsewhere", 1);
  await page.reload();
  await expect(noteField(page)).toHaveValue("My unsaved edit");
  await expect(newerBlock(page)).toHaveCount(0);
  await expectSaveEnabled(page, true);

  await saveButton(page).click();
  await expect(newerBlock(page)).toHaveText("Written elsewhere");
  await expect(noteField(page)).toHaveValue("My unsaved edit");
  await expectConsistent(screenOf(), id, { body: "Written elsewhere", revision: 2 });

  await page.reload();
  await expect(noteField(page)).toHaveValue("My unsaved edit");
  await saveButton(page).click();
  await keepMine(page).click();
  await expect(status(page)).toHaveText(NOTE_SAVED);
  await expectConsistent(screenOf(), id, { body: "My unsaved edit", revision: 3 });
});

test("Use newer version and an edit back to the saved text drop the draft", async () => {
  const { page, context } = screenOf();
  const id = await seedThread(screenOf(), thread("dd"));
  await openReader(page, id, DESKTOP.width);

  await writeAndSave(page, "Base text");
  await expect(status(page)).toHaveText(NOTE_SAVED);
  await noteField(page).fill("My unsaved edit");
  await saved(context.request, id, "Written elsewhere", 1);
  await saveButton(page).click();
  await expect(newerBlock(page)).toHaveText("Written elsewhere");
  await takeNewer(page).click();
  await page.reload();
  await expect(noteField(page)).toHaveValue("Written elsewhere");
  await expectSaveEnabled(page, false);

  await noteField(page).fill("Edited again");
  await noteField(page).fill("Written elsewhere");
  await page.reload();
  await expect(noteField(page)).toHaveValue("Written elsewhere");
  await expectSaveEnabled(page, false);
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey(id))).toBeNull();
});
