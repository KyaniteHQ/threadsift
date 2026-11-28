import { type Page, expect } from "@playwright/test";
import { z } from "zod";

import { STORAGE_KEY } from "../design/system/settings.ts";
import { OP_LABEL, RELATED } from "../web/src/reader-text.ts";
import { itemDetail, savedItem, savedTopicItem } from "./saved-item.ts";

const THREAD_ID = "3000000000000000001";

const THREAD_LINK = `https://x.com/oldname/status/${THREAD_ID}`;

const STATUS_ID = "3000000000000000002";

const STATUS_LINK = `https://x.com/i/status/${STATUS_ID}`;

const STATUS_TITLE = "A status link that names no handle";

const THREAD_TITLE = "Online backups for a busy database file";

const FACT = "Run sqlite3 app.db '.backup copy.db', then run PRAGMA integrity_check on the copy.";

const reply = (id: string, parentId: string, author: string, text: string) => ({
  id,
  parentId,
  author,
  text,
  postedAt: "2026-03-04T10:00:00Z",
  likes: 2,
});

const THREAD = {
  post: {
    id: THREAD_ID,
    author: "someone",
    text: "How do you back up a SQLite file while the app is writing to it?",
    postedAt: "2026-03-04T09:00:00Z",
    replies: 3,
  },
  replies: [
    reply("3000000000000000011", THREAD_ID, "bob", FACT),
    reply("3000000000000000012", "3000000000000000011", "Someone", "That also works from Python."),
    reply("3000000000000000013", THREAD_ID, "carol", "lol"),
  ],
};

const STATUS_POST = {
  post: {
    id: STATUS_ID,
    author: "someone",
    text: "Does the online backup command lock the database while it copies?",
    postedAt: "2026-03-05T09:00:00Z",
    replies: 0,
  },
  replies: [],
};

async function expectStoredAuthor(page: Page, title: string): Promise<void> {
  await page.goto("/");
  await page.locator("article.it").filter({ hasText: title }).getByRole("link").first().click();

  const meta = page.locator(".reader .rd-meta");

  await expect(meta.locator(".rd-part", { hasText: /^@someone$/u })).toHaveCount(1);
  await expect(meta).not.toContainText("oldname");
  await expect(meta).not.toContainText("x.com");
}

interface PastedCase {
  readonly topic: {
    readonly link: string;
    readonly name: string;
    readonly itemTitle: string;
    readonly summary: string;
  };
  readonly markdown: string;
  readonly sentence: string;
}

export async function readerWithoutProvider(
  page: Page,
  { topic, markdown, sentence }: Readonly<PastedCase>,
): Promise<void> {
  const item = await savedTopicItem(page.request, topic, markdown, {
    tag: "backups",
    keyPoint: "No Provider is saved",
  });

  await page.goto("/");
  await page
    .locator("article.it")
    .filter({ hasText: topic.itemTitle })
    .getByRole("link")
    .first()
    .click();
  await expect(page.locator(".reader")).toContainText(sentence);
  await expect(page.getByRole("heading", { name: RELATED.title })).toHaveCount(0);

  expect((await itemDetail(page.request, item)).related).toEqual([]);
}

export async function readXThread(page: Page): Promise<void> {
  await savedItem(page.request, {
    url: THREAD_LINK,
    content: JSON.stringify(THREAD),
    digest: {
      title: THREAD_TITLE,
      topic: "Databases",
      tags: ["sqlite"],
      summary: "Use the online backup command.\nCheck the copy opens.",
      keyPoints: ["A plain copy can tear a page"],
      keptComments: ["3000000000000000011", "3000000000000000012"],
    },
  });
  await page.goto("/");

  const row = page.locator("article.it").filter({ hasText: THREAD_TITLE });

  await expect(row).toContainText("Kept 2 of 3");
  await row.getByRole("link").first().click();

  const reader = page.locator(".reader");

  await expect(reader).toContainText(FACT);
  await expect(reader).toContainText("Likes: 2");
  await expect(reader.locator(".cm-author", { hasText: "@bob" })).toHaveCount(1);
  await expect(reader.locator(".op")).toHaveText(OP_LABEL);
  await expect(reader).not.toContainText("Arctic Shift");
  await expectStoredAuthor(page, THREAD_TITLE);

  await savedItem(page.request, {
    url: STATUS_LINK,
    content: JSON.stringify(STATUS_POST),
    digest: {
      title: STATUS_TITLE,
      topic: "Databases",
      tags: ["sqlite"],
      summary: "The backup command copies pages while the app writes.",
      keyPoints: ["Writers wait only for the page being copied"],
    },
  });
  await expectStoredAuthor(page, STATUS_TITLE);
}

const MotionsSchema = z.array(
  z.object({ done: z.boolean(), moved: z.array(z.string()), changing: z.number() }),
);

const MOTION_ITEM = {
  url: "https://example.com/guides/reader-motion",
  page: { markdown: "A page the Reader opens from its card.", title: "Opening from a card" },
  digest: {
    title: "Opening from a card",
    topic: "Reading",
    tags: ["motion"],
    summary: "The card grows into the Reader.\nClosing runs it back.",
    keyPoints: ["One shared name per Item"],
  },
};

function watchMotion(): void {
  const start = document.startViewTransition.bind(document);
  const runs: { done: boolean; moved: readonly string[]; changing: number }[] = [];
  const write = (): void => {
    document.documentElement.dataset["motion"] = JSON.stringify(runs);
  };

  document.startViewTransition = (update) => {
    const transition = start(update);
    const moved: readonly string[] = [];
    const run = { done: false, moved, changing: 0 };
    runs.push(run);
    write();

    const end = (): void => {
      run.done = true;
      write();
    };
    const measure = (): void => {
      const changing = document.documentElement
        .getAnimations({ subtree: true })
        .map((each) => each.effect)
        .filter((each) => each instanceof KeyframeEffect)
        .filter((each) => (each.pseudoElement ?? "").startsWith("::view-transition"))
        .filter((each) => {
          const frames = each.getKeyframes();

          return ["opacity", "transform", "width", "height"].some(
            (key) => String(frames.at(0)?.[key]) !== String(frames.at(-1)?.[key]),
          );
        });

      run.changing = changing.length;
      run.moved = changing
        .map((each) => /^::view-transition-group\((.+)\)$/u.exec(each.pseudoElement ?? "")?.[1])
        .filter((name): name is string => name !== undefined && name !== "root");
      write();
    };

    transition.ready.then(measure, write);
    transition.finished.then(end, end);

    return transition;
  };
}

const motions = async (page: Page) =>
  MotionsSchema.parse(
    JSON.parse(await page.evaluate(() => document.documentElement.dataset["motion"] ?? "[]")),
  );

async function motionOf(page: Page, act: () => Promise<void>, readers: number) {
  const since = (await motions(page)).length;

  await act();
  await expect(page.locator(".reader-slot")).toHaveCount(readers);
  await expect
    .poll(
      async () => {
        const runs = (await motions(page)).slice(since);

        return runs.length > 0 && runs.every((run) => run.done);
      },
      { message: "a view transition starts and finishes" },
    )
    .toBe(true);

  return (await motions(page)).slice(since);
}

export async function readerMotion(page: Page): Promise<void> {
  const id = await savedItem(page.request, MOTION_ITEM);
  const card = page.locator(`.it[data-key="${String(id)}"] .it-open`);
  const shared = [[`lib-item-${String(id)}`]];
  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

  await page.addInitScript(watchMotion);
  await page.evaluate(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [STORAGE_KEY, JSON.stringify({ layout: "grid", openAs: "sheet" })] as const,
  );
  await page.goto("/");

  const opened = await motionOf(page, () => card.click(), 1);
  const escaped = await motionOf(page, () => page.keyboard.press("Escape"), 0);
  await motionOf(page, () => card.click(), 1);
  const backed = await motionOf(
    page,
    async () => {
      await page.goBack();
    },
    0,
  );

  expect(
    opened.map((run) => run.moved),
    "the open grows only this Item's card",
  ).toEqual(shared);
  expect(
    escaped.map((run) => run.moved),
    "Escape runs the Reader back into it",
  ).toEqual(shared);
  expect(
    backed.map((run) => run.moved),
    "Back runs the Reader back into it",
  ).toEqual(shared);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await motionOf(page, () => card.click(), 1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".reader-slot")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  expect(
    reduced.map((run) => run.changing),
    "reduced motion animates nothing",
  ).toEqual([0]);

  await page.evaluate(
    ([key, value]) => {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    },
    [STORAGE_KEY, stored] as const,
  );
}
