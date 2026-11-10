import { type APIRequestContext, type Page, expect, test } from "@playwright/test";

import { TEXT } from "../extension/lib/text.ts";
import { createToken } from "./access-helpers.ts";
import { itemOf } from "./api.ts";
import { ACTION_TEXT, type Extension, type Grant, type Popup, loadExtension } from "./extension.ts";
import { type Library, closeLibrary, openLibrary } from "./media-pages.ts";
import type { MediaRow } from "./media.ts";

export interface Session {
  readonly library: Library;
  readonly extension: Extension;
  readonly tokenId: number;
  readonly tokenValue: string;
}

export function configuredExtensionSession(
  access: Pick<Grant, "redditAccess"> = {},
): () => Session {
  let current: Session | null = null;

  test.beforeEach(async () => {
    const library = await openLibrary();
    const extension = await loadExtension({ instanceUrl: library.instance.url, ...access });
    const { token, value } = await createToken(library.owner, "Extension");
    await extension.configure(library.instance.url, value);
    current = { library, extension, tokenId: token.id, tokenValue: value };
  });

  test.afterEach(async () => {
    await current?.extension.close();

    if (current !== null) await closeLibrary(current.library);

    current = null;
  });

  return () => {
    if (current === null) throw new Error("the extension session is not open");

    return current;
  };
}

export async function savedItemId(popup: Popup, instanceUrl: string): Promise<number> {
  await expect.poll(() => popup.status()).toBe(ACTION_TEXT.saved);

  const link = await popup.itemLink();
  const id = Number(link?.split("/").at(-1));

  expect(link, "the popup's link to the saved Item").toBe(`${instanceUrl}/items/${id}`);

  return id;
}

export async function ready(owner: APIRequestContext, id: number) {
  await expect.poll(async () => (await itemOf(owner, id)).status).toBe("ready");

  return itemOf(owner, id);
}

export async function expectTabImages(tab: Page, rows: readonly MediaRow[]): Promise<void> {
  const shown = await tab.evaluate(() =>
    [...document.images].flatMap(({ currentSrc }) => (currentSrc === "" ? [] : [currentSrc])),
  );

  expect(rows.length, "image rows of the saved Item").toBeGreaterThan(0);

  for (const { source_url } of rows) {
    expect(shown, `the tab shows ${source_url}`).toContain(source_url);
  }
}

export async function settingsOpenedBy(extension: Extension, popup: Popup): Promise<Page> {
  const opened = extension.context.waitForEvent("page");
  await popup.click(ACTION_TEXT.openSettings);

  const settings = await opened;

  await expect(settings.getByRole("heading", { name: TEXT.settingsTitle })).toBeVisible();
  expect(settings.url()).toBe(`chrome-extension://${extension.id}/options.html`);

  return settings;
}
