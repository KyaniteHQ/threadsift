import { expect, test } from "@playwright/test";

import { NOTE_FAILED, NOTE_SAVED, NOTE_TOO_LONG } from "../web/src/reader-text.ts";
import { SEARCH_LABEL } from "../web/src/text.ts";
import { openReader, seedThread } from "./highlight-reader.ts";
import { screenForFile, thread } from "./highlight-screen.ts";
import { DESKTOP } from "./look.ts";
import {
  type Held,
  alerts,
  expectSaveEnabled,
  holdNoteAnswers,
  holdNoteRequests,
  keepMine,
  newerBlock,
  noteBox,
  noteField,
  saveButton,
  status,
  takeNewer,
  write,
  writeAndSave,
} from "./note-reader.ts";
import { expectConsistent, noteOf, saved } from "./notes.ts";
import { readStateOf, row } from "./reader.ts";
import { marker } from "./thread-fixtures.ts";

const screenOf = screenForFile();

test("a Note is written, saved by the button and by Ctrl+Enter, shown again after a reload and found through the library search", async () => {
  const { page, context } = screenOf();
  const id = await seedThread(screenOf(), thread("na"));
  const other = await seedThread(screenOf(), thread("nb"));
  const word = marker("shelf");
  await openReader(page, id, DESKTOP.width);

  await expect(noteField(page)).toHaveValue("");
  await expectSaveEnabled(page, false);

  await writeAndSave(page, `Check the ${word}\n\nThen <b>stop</b>.`);
  await expect(status(page)).toHaveText(NOTE_SAVED);
  await expectSaveEnabled(page, false);
  await expectConsistent(screenOf(), id, {
    body: `Check the ${word}\n\nThen <b>stop</b>.`,
    revision: 1,
  });

  await noteField(page).press("End");
  await noteField(page).pressSequentially(" Done.");
  await expect(status(page)).toHaveText("");
  await noteField(page).press("ControlOrMeta+Enter");
  await expect(status(page)).toHaveText(NOTE_SAVED);
  await expectConsistent(screenOf(), id, {
    body: `Check the ${word}\n\nThen <b>stop</b>. Done.`,
    revision: 2,
  });

  await page.reload();
  await expect(noteField(page)).toHaveValue(`Check the ${word}\n\nThen <b>stop</b>. Done.`);
  expect((await noteOf(context.request, other)).body).toBeNull();

  const search = page.getByRole("searchbox", { name: SEARCH_LABEL });
  await search.fill(word);
  await expect(row(page, id)).toBeVisible();
  await expect(row(page, other)).toHaveCount(0);
});

test("library keys do nothing while the Note field has focus, and Escape leaves the field and keeps the Reader open", async () => {
  const { page } = screenOf();
  const id = await seedThread(screenOf(), thread("nk"));
  await seedThread(screenOf(), thread("nl"));
  await openReader(page, id, DESKTOP.width);
  const address = page.url();

  await noteField(page).focus();
  await page.keyboard.type("jkm/ and more");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");

  await expect(noteField(page)).toHaveValue("jkm/ and more");
  expect(page.url()).toBe(address);
  expect(await readStateOf(page, id)).toBe("unread");
  await expect(page.getByRole("searchbox", { name: SEARCH_LABEL })).not.toBeFocused();

  await page.keyboard.press("Escape");
  await expect(noteField(page)).not.toBeFocused();
  await expect(noteField(page)).toHaveValue("jkm/ and more");
  expect(page.url()).toBe(address);
  await expect(noteBox(page)).toBeVisible();
});

test("a second tab's save is refused with the newer Note shown, and both texts survive until the owner picks one", async () => {
  const { page, context } = screenOf();
  const id = await seedThread(screenOf(), thread("nt"));
  await openReader(page, id, DESKTOP.width);
  const second = await context.newPage();
  await openReader(second, id, DESKTOP.width);

  await writeAndSave(page, "Alpha from the first tab");
  await expect(status(page)).toHaveText(NOTE_SAVED);

  await writeAndSave(second, "Beta from the second tab");
  await expect(alerts(second).first()).toBeVisible();
  await expect(newerBlock(second)).toHaveText("Alpha from the first tab");
  await expect(noteField(second)).toHaveValue("Beta from the second tab");
  await expectConsistent(screenOf(), id, { body: "Alpha from the first tab", revision: 1 });

  await keepMine(second).click();
  await expect(status(second)).toHaveText(NOTE_SAVED);
  await expect(newerBlock(second)).toHaveCount(0);
  await expect(noteField(second)).toBeFocused();
  await expectConsistent(screenOf(), id, { body: "Beta from the second tab", revision: 2 });

  await writeAndSave(page, "Gamma from the first tab");
  await expect(newerBlock(page)).toHaveText("Beta from the second tab");
  await takeNewer(page).click();
  await expect(noteField(page)).toHaveValue("Beta from the second tab");
  await expect(noteField(page)).toBeFocused();
  await expect(newerBlock(page)).toHaveCount(0);
  await expectSaveEnabled(page, false);
  await expectConsistent(screenOf(), id, { body: "Beta from the second tab", revision: 2 });

  await writeAndSave(page, "Delta from the first tab");
  await expect(status(page)).toHaveText(NOTE_SAVED);
  await expectConsistent(screenOf(), id, { body: "Delta from the first tab", revision: 3 });

  await writeAndSave(second, "Epsilon from the second tab");
  await expect(newerBlock(second)).toHaveText("Delta from the first tab");
  await saved(context.request, id, "Zeta from the API", 3);
  await keepMine(second).click();
  await expect(newerBlock(second)).toHaveText("Zeta from the API");
  await expect(noteField(second)).toHaveValue("Epsilon from the second tab");
  await keepMine(second).click();
  await expect(status(second)).toHaveText(NOTE_SAVED);
  await expectConsistent(screenOf(), id, { body: "Epsilon from the second tab", revision: 5 });
  await second.close();
});

test("text typed while a save is pending survives its answer, whether it is a save or a refusal", async () => {
  const { page, context } = screenOf();
  const id = await seedThread(screenOf(), thread("np"));
  await openReader(page, id, DESKTOP.width);
  const held: Held[] = [];
  await holdNoteAnswers(page, id, held);

  await writeAndSave(page, "First");
  await expect.poll(() => held.length).toBe(1);
  await noteField(page).press("End");
  await noteField(page).pressSequentially(" and more");
  await held[0]?.release();
  await page.unroute(`**/api/items/${id}/note`);

  await expect(noteField(page)).toHaveValue("First and more");
  await expect(status(page)).toHaveText("");
  await expectSaveEnabled(page, true);
  await expectConsistent(screenOf(), id, { body: "First", revision: 1 });

  await holdNoteRequests(page, id, held);
  await saveButton(page).click();
  await expect.poll(() => held.length).toBe(2);
  await saved(context.request, id, "Written elsewhere", 1);
  await noteField(page).press("End");
  await noteField(page).pressSequentially(" plus");
  await held[1]?.release();

  await expect(noteField(page)).toHaveValue("First and more plus");
  await expect(newerBlock(page)).toHaveText("Written elsewhere");
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("a save that never reaches the server keeps the typed text and can be sent again", async () => {
  const { page, context } = screenOf();
  const id = await seedThread(screenOf(), thread("nn"));
  await openReader(page, id, DESKTOP.width);

  await page.route(`**/api/items/${id}/note`, (route) => route.abort());
  await writeAndSave(page, "Typed while offline");
  await expect(alerts(page)).toHaveText(NOTE_FAILED);
  await expect(noteField(page)).toHaveValue("Typed while offline");
  await expectSaveEnabled(page, true);
  expect(await noteOf(context.request, id)).toEqual({ body: null, revision: 0 });

  await page.unroute(`**/api/items/${id}/note`);
  await saveButton(page).click();
  await expect(status(page)).toHaveText(NOTE_SAVED);
  await expect(alerts(page)).toHaveCount(0);
  await expectConsistent(screenOf(), id, { body: "Typed while offline", revision: 1 });
});

test("emptying the Note removes it from the detail and from search, and a note over 10,000 characters cannot be saved", async () => {
  const { page, context } = screenOf();
  const id = await seedThread(screenOf(), thread("ne"));
  const word = marker("erased");
  await openReader(page, id, DESKTOP.width);

  await writeAndSave(page, `Soon gone ${word}`);
  await expect(status(page)).toHaveText(NOTE_SAVED);

  await write(page, "x".repeat(10_001));
  await expect(alerts(page)).toHaveText(NOTE_TOO_LONG);
  await expectSaveEnabled(page, false);
  await write(page, "😀".repeat(10_000));
  await expect(alerts(page)).toHaveCount(0);
  await expectSaveEnabled(page, true);

  await write(page, "   ");
  await saveButton(page).click();
  await expect(status(page)).toHaveText(NOTE_SAVED);
  await expect(noteField(page)).toHaveValue("");
  await expectConsistent(screenOf(), id, { body: null, revision: 2 });

  const search = page.getByRole("searchbox", { name: SEARCH_LABEL });
  await search.fill(word);
  await expect(page.locator("article.it")).toHaveCount(0);
  expect(await noteOf(context.request, id)).toEqual({ body: null, revision: 2 });
});
