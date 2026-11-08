import { expect } from "@playwright/test";
import { z } from "zod";

import { aiScreen, newSealingKey, proofProvider } from "./ai.ts";
import { itemOf } from "./api.ts";
import { configureDigest } from "./digest.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { find, marker, post, postUrl } from "./thread-fixtures.ts";
import { type Node, comment, sendThread, threadJson } from "./threads.ts";

export const AI_WAIT = 660_000;

export const CAP_BYTES = 14_000;

export const SKIP_REASON =
  "Workers AI credentials unavailable; pull request runs skip the real Digest proof, and the run on main after merge runs it.";

export const QUESTION =
  "Our nightly sync job keeps stalling after the cache folder fills up. Does anyone know why?";

const Tasks = z.array(z.object({ id: z.number(), inputs: z.string(), result: z.string() }));

const Submitted = z.object({
  event: z.literal("digest-comments-submitted"),
  taskId: z.number(),
  itemId: z.number(),
  generation: z.number(),
  eligible: z.number(),
  submitted: z.number(),
  omitted: z.number(),
});

const SentItem = z.object({
  postText: z.string().nullable(),
  comments: z.array(
    z.object({ id: z.string(), parentId: z.string().nullable(), body: z.string() }),
  ),
});

const Published = z.object({ keptComments: z.array(z.string()) });

export type ItemView = Awaited<ReturnType<typeof itemOf>>;

export function digestTasks(screen: FreshScreen, itemId: number) {
  return screen.fresh.query(
    `SELECT id, inputs, result FROM ai_tasks WHERE item_id = ${itemId} AND kind = 'digest' AND state = 'done' ORDER BY id`,
    Tasks,
  );
}

export function submissions(screen: FreshScreen) {
  return [...screen.fresh.logs().matchAll(/\{"event":"digest-comments-submitted"[^}]*\}/gu)].map(
    ([line = ""]) => Submitted.parse(JSON.parse(line)),
  );
}

export function sentIn(inputs: string) {
  const [, item = ""] = inputs.split("\n");

  return SentItem.parse(JSON.parse(item));
}

export function publishedIn(result: string) {
  return Published.parse(JSON.parse(result)).keptComments;
}

export function keptIds(item: Readonly<ItemView>): string[] {
  return item.comments.nodes.flatMap((node) => (node.kind === "comment" ? [node.id] : []));
}

export async function openProvider(browser: Parameters<typeof aiScreen>[0]): Promise<FreshScreen> {
  const screen = await aiScreen(browser, newSealingKey());

  await configureDigest(screen, proofProvider());

  return screen;
}

export async function publishedThread(
  screen: FreshScreen,
  fields: Readonly<{ id: string; tree: readonly Node[]; text: string }>,
): Promise<ItemView> {
  const request = screen.context.request;

  const sent = await sendThread(request, {
    url: postUrl(fields.id),
    content: threadJson(post(fields.id, fields.text), fields.tree),
  });

  expect(sent.status, await sent.response.text()).toBe(201);

  const { item } = z
    .object({ item: z.object({ id: z.number() }) })
    .parse(await sent.response.json());

  await expect
    .poll(async () => (await itemOf(request, item.id)).status, {
      timeout: AI_WAIT,
      intervals: [2000],
    })
    .toBe("ready");

  return itemOf(request, item.id);
}

export async function expectOnlyKeptSearchable(
  screen: FreshScreen,
  item: Readonly<ItemView>,
  markers: readonly string[],
): Promise<void> {
  const shown = JSON.stringify(item.comments.nodes);

  for (const word of markers) {
    expect(await find(screen.context.request, word), word).toEqual(
      shown.includes(word) ? [item.id] : [],
    );
  }
}

export function agreementTree(tag: string): Node[] {
  return [
    comment(
      "p1",
      "reader_a",
      `${marker("agreeparent", tag)} I agree with the question. I have wondered about this as well and I am glad someone asked.`,
      [
        comment(
          "p2",
          "reader_b",
          `${marker("reply", tag)} The stall comes from the inode limit, not the disk size. After I ran tune2fs -i 1024 on the cache volume the nightly sync finished in 4 minutes, so the conclusion is to raise the inode count of the cache volume.`,
        ),
      ],
    ),
    comment(
      "p3",
      "reader_c",
      `${marker("joke", tag)} Have you tried turning it off and on again? That always works in my house, haha.`,
    ),
  ];
}

export function replacementTree(): Node[] {
  return [
    comment(
      "n1",
      "reader_d",
      `${marker("newfix")} Moving the cache folder to a volume with more inodes fixed the stall for me, tested on three servers.`,
    ),
    comment("n2", "reader_e", `${marker("newjoke")} Same here, lol.`),
  ];
}

export const BIG_COMMENTS = 70;

export const OVERSIZED = 10;

export function bigThread(): Node[] {
  return Array.from({ length: BIG_COMMENTS }, (_, index) =>
    comment(
      `b${index}`,
      `reader_${index % 9}`,
      index === OVERSIZED
        ? `${marker("oversize")} ${"A very long digression about nothing in particular. ".repeat(400)}`
        : `${marker("big")}${index} In my case setting cache_mode_${index}=off fixed the nightly stall on release ${index}; before that the run took ${index + 40} minutes and logged the same error each time.`,
    ),
  );
}
