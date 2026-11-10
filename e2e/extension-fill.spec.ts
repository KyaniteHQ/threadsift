import { type BrowserContext, type Page, expect, test } from "@playwright/test";

import { TEXT } from "../extension/lib/text.ts";
import type { Instance } from "./access.ts";
import { itemOf, postLink, settled } from "./api.ts";
import { type Session, configuredExtensionSession } from "./extension-session.ts";
import type { Extension } from "./extension.ts";
import { POST_ID, POST_URL } from "./reddit.ts";
import {
  AUTHORED_DIGEST,
  comment,
  commentRows,
  generationOf,
  savedThread,
  threadHeaders,
  threadJson,
} from "./threads.ts";

test.describe.configure({ timeout: 300_000 });

const THREAD = `https://www.reddit.com/r/all/comments/${POST_ID}/`;
const REDDIT_HOME = "https://www.reddit.com/";
const THREAD_JSON = `${THREAD}.json?limit=500&raw_json=1`;

function thread(text: string) {
  return threadJson(
    {
      id: POST_ID,
      title: "A thread saved from its JSON",
      author: "author_one",
      subreddit: "all",
      selftext: text,
      reported: 1,
    },
    [comment("c1", "reader_a", "A substantive remark that stays saved.")],
  );
}

function jsonRequests(context: BrowserContext): readonly string[] {
  const seen: string[] = [];

  context.on("request", (request) => {
    if (request.url().includes("/.json?")) seen.push(request.url());
  });

  return seen;
}

async function linkOnlyItem(session: () => Session) {
  const { owner } = session().library;
  const { body } = await postLink(owner, POST_URL);
  const waiting = await settled(owner, body.item.id);

  expect(waiting).toMatchObject({ kind: "reddit-post", fillable: true });

  return waiting;
}

async function expectFillControls(extension: Extension, on: boolean): Promise<void> {
  const settings = await extension.settings();

  await expect(settings.getByText(on ? TEXT.fillIsOn : TEXT.fillIsOff)).toBeVisible();
  await expect(
    settings.getByRole("button", { name: on ? TEXT.fillTurnOff : TEXT.fillTurnOn }),
  ).toBeVisible();
  await settings.close();
}

async function openUsableThread(extension: Extension): Promise<Page> {
  const answered = extension.context.waitForEvent("response", {
    predicate: (response) => response.url() === THREAD_JSON,
    timeout: 120_000,
  });

  const tab = await extension.tab(THREAD);
  const answer = await answered;

  const usable =
    answer.status() === 200 && (answer.headers()["content-type"] ?? "").includes("json");

  test.skip(
    !usable,
    `not run: Reddit answered the tab's .json with ${answer.status()}, so the fill was not reached`,
  );

  return tab;
}

async function expectRevisitSavesNothing(
  extension: Extension,
  tab: Page,
  instance: Instance,
  id: number,
): Promise<void> {
  const generation = generationOf(instance, id);
  const rows = commentRows(instance, id);
  const seen = jsonRequests(extension.context);

  await tab.reload();
  await tab.waitForLoadState("networkidle");

  expect(seen).toEqual([]);
  expect(generationOf(instance, id)).toBe(generation);
  expect(commentRows(instance, id)).toEqual(rows);
}

test.describe("before the owner opts in", () => {
  const session = configuredExtensionSession();

  test("opening the thread of a Link-only Reddit Item captures nothing: no content script is registered, no request leaves the tab and the Item stays as it was", async () => {
    const { library, extension } = session();
    const waiting = await linkOnlyItem(session);

    expect(await extension.registeredScripts()).toEqual([]);
    await expectFillControls(extension, false);

    const seen = jsonRequests(extension.context);
    const tab = await extension.tab(THREAD);
    await tab.waitForLoadState("networkidle");

    expect(seen).toEqual([]);
    expect(threadHeaders(library.instance, waiting.id)).toEqual([]);
    expect(await itemOf(library.owner, waiting.id)).toEqual(waiting);
  });
});

test.describe("after the owner opts in", () => {
  const session = configuredExtensionSession({ redditAccess: true });

  test("opening the thread of a Link-only Reddit Item fills it once, and a second visit saves nothing", async () => {
    const { library, extension } = session();
    const { owner, instance } = library;
    const waiting = await linkOnlyItem(session);

    expect(await extension.registeredScripts()).toEqual(["fill"]);
    await expectFillControls(extension, true);

    const tab = await openUsableThread(extension);

    await expect.poll(async () => (await itemOf(owner, waiting.id)).fillable).toBe(false);

    const filled = await settled(owner, waiting.id);

    expect(filled.comments.received, "comments saved from the JSON").toBeGreaterThan(0);
    expect(threadHeaders(instance, waiting.id)).toHaveLength(1);

    await expectRevisitSavesNothing(extension, tab, instance, waiting.id);
  });

  test("opening the thread of an Item that already holds a saved thread leaves it as it was", async () => {
    const { library, extension } = session();
    const { owner, instance } = library;

    const { item } = await savedThread(owner, {
      url: THREAD,
      content: thread("The post text saved earlier."),
      digest: AUTHORED_DIGEST,
    });

    const before = await itemOf(owner, item.id);
    const rows = commentRows(instance, item.id);

    expect(await extension.registeredScripts()).toEqual(["fill"]);

    const seen = jsonRequests(extension.context);
    const tab = await extension.tab(THREAD);
    await tab.waitForLoadState("networkidle");

    expect(seen).toEqual([]);
    expect(await itemOf(owner, item.id)).toEqual(before);
    expect(commentRows(instance, item.id)).toEqual(rows);
    expect(generationOf(instance, item.id)).toBe(1);
  });
});

test.describe("when the thread is reached without loading a page", () => {
  const session = configuredExtensionSession({ redditAccess: true });

  test("a History API navigation from a Reddit page that is not a thread fills the Item once the address is a thread", async () => {
    const { extension } = session();
    await linkOnlyItem(session);

    const tab = await extension.tab(REDDIT_HOME);

    const asked = extension.context.waitForEvent("request", {
      predicate: (request) => request.url() === THREAD_JSON,
      timeout: 60_000,
    });

    await tab.evaluate((path) => {
      history.pushState(null, "", path);
    }, `/r/all/comments/${POST_ID}/`);

    expect((await asked).url()).toBe(THREAD_JSON);
  });
});

test.describe("when the Reddit grant changes outside the settings page", () => {
  const session = configuredExtensionSession({ redditAccess: true, withholdable: true });

  test("an open settings page follows the grant, and the content script follows it too", async () => {
    const { extension } = session();
    const settings = await extension.settings();

    await expect(settings.getByText(TEXT.fillIsOn)).toBeVisible();
    expect(await extension.registeredScripts()).toEqual(["fill"]);

    await extension.setSiteAccess("On click");

    await expect(settings.getByText(TEXT.fillIsOff)).toBeVisible();
    await expect(settings.getByRole("button", { name: TEXT.fillTurnOn })).toBeVisible();
    expect(await extension.registeredScripts()).toEqual([]);

    await extension.setSiteAccess("On all sites");

    await expect(settings.getByText(TEXT.fillIsOn)).toBeVisible();
    await expect(settings.getByRole("button", { name: TEXT.fillTurnOff })).toBeVisible();
    expect(await extension.registeredScripts()).toEqual(["fill"]);
  });
});
