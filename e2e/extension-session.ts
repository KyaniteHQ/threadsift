import { type APIRequestContext, expect, test } from "@playwright/test";

import { createToken } from "./access-helpers.ts";
import { itemOf } from "./api.ts";
import { ACTION_TEXT, type Extension, type Popup, loadExtension } from "./extension.ts";
import { type Library, closeLibrary, openLibrary } from "./media-pages.ts";

export interface Session {
  readonly library: Library;
  readonly extension: Extension;
}

export function configuredExtensionSession(): () => Session {
  let current: Session | null = null;

  test.beforeEach(async () => {
    const library = await openLibrary();
    const extension = await loadExtension({ instanceUrl: library.instance.url });
    const { value } = await createToken(library.owner, "Extension");
    await extension.configure(library.instance.url, value);
    current = { library, extension };
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
