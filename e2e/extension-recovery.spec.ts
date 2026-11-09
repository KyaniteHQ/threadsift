import { expect, test } from "@playwright/test";

import { listAll } from "./api.ts";
import { ESSAY } from "./articles.ts";
import { configuredExtensionSession, savedItemId } from "./extension-session.ts";
import { ACTION_TEXT } from "./extension.ts";

test.describe.configure({ timeout: 300_000 });

const UNREACHABLE_WAIT_MS = 90_000;

const session = configuredExtensionSession();

test("after the Instance fails the save, Try again saves the page once the failure is gone", async () => {
  const { library, extension } = session();
  const { owner, instance } = library;

  instance.sql(
    "CREATE TRIGGER refuse_items BEFORE INSERT ON items BEGIN SELECT RAISE(ABORT, 'refused for the test'); END",
  );

  const popup = await extension.press(await extension.tab(ESSAY));

  await expect.poll(() => popup.status()).toBe(ACTION_TEXT.failed);
  expect(await listAll(owner)).toEqual([]);

  instance.sql("DROP TRIGGER refuse_items");
  await popup.click(ACTION_TEXT.tryAgain);

  expect(await savedItemId(popup, instance.url)).toBe((await listAll(owner))[0]?.id);
});

test("when the Instance does not answer the popup says so, and Try again saves the page once it answers", async () => {
  const { library, extension } = session();
  const { owner, instance } = library;
  const tab = await extension.tab(ESSAY);

  instance.pause();

  const popup = await extension.press(tab);

  await expect
    .poll(() => popup.status(), { timeout: UNREACHABLE_WAIT_MS })
    .toBe(ACTION_TEXT.unreachable);
  instance.resume();
  await popup.click(ACTION_TEXT.tryAgain);

  expect(await savedItemId(popup, instance.url)).toBe((await listAll(owner))[0]?.id);
});
