import { z } from "zod";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { settled } from "./api.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { paragraphs } from "./reader.ts";
import { post, postUrl, run } from "./thread-fixtures.ts";
import { AUTHORED_DIGEST, MORE, comment, sendThread, threadJson } from "./threads.ts";

export const POST_AUTHOR = "author_one";
export const REPORTED = 142;
export const SAVED_COMMENT_ID = "rc1";

export const THREAD = {
  kept: 6,
  received: 10,
  comments: 6,
  stubs: 6,
  droppedStubs: 2,
  notKeptStubs: 1,
  moreStubs: 3,
  rows: 12,
  tops: 3,
  deeps: 2,
} as const;

const KEPT_IDS = ["t1_c1", "t1_c3", "t1_c8", "t1_c9", "t1_c7", "t1_c10"];

function tree() {
  return [
    comment("c1", "reader_a", paragraphs(6, "Kept tall"), [
      comment("c2", "AutoModerator", "Please read the rules.", [
        comment("c3", POST_AUTHOR, "Kept three. Set the cache path before the first run."),
      ]),
      comment("c4", "reader_c", "+1"),
      comment("c5", "reader_d", "A perfectly ordinary remark.", [
        comment("c8", "reader_g", "Kept eight. Pointing the path at tmpfs fixed it for me.", [
          comment("c9", "reader_h", "Kept nine. The same fix held after a reboot.", [MORE]),
        ]),
      ]),
      MORE,
    ]),
    comment("c6", "reader_e", "[deleted]", [
      comment("c7", "reader_f", "Kept seven. I ran it for three weeks without a crash."),
    ]),
    comment("c10", "reader_i", paragraphs(40, "Kept long")),
    MORE,
  ];
}

export interface Seeded {
  readonly thread: number;
  readonly saved: number;
  readonly none: number;
}

async function sent(
  screen: FreshScreen,
  fields: Readonly<{ url: string; content: string; digest: object }>,
): Promise<number> {
  const { status, response } = await sendThread(screen.context.request, fields);

  if (status >= 300)
    throw new Error(`sending the thread answered ${status}: ${await response.text()}`);

  const { item } = SavedItemResponseSchema.parse(await response.json());
  await settled(screen.context.request, item.id);

  return item.id;
}

export async function seedThreads(screen: FreshScreen): Promise<Seeded> {
  const threadId = `k${run}`;
  const noneId = `n${run}`;
  const savedId = `c${run}`;

  const thread = await sent(screen, {
    url: postUrl(threadId),
    content: threadJson(post(threadId, "The post body.", REPORTED), tree()),
    digest: { ...AUTHORED_DIGEST, keptComments: KEPT_IDS },
  });

  const none = await sent(screen, {
    url: postUrl(noneId),
    content: threadJson(post(noneId, "Another post body.", REPORTED), [
      comment("n1", "reader_a", "Agreed, thanks for sharing."),
    ]),
    digest: { ...AUTHORED_DIGEST, keptComments: [] },
  });

  const saved = await sent(screen, {
    url: `${postUrl(savedId)}${SAVED_COMMENT_ID}/`,
    content: threadJson(post(savedId, "The containing post."), [
      comment(SAVED_COMMENT_ID, "reader_h", "The saved comment itself.", [
        comment("d1", "reader_i", "Kept reply. A reply worth keeping."),
        MORE,
      ]),
    ]),
    digest: { ...AUTHORED_DIGEST, keptComments: ["t1_d1"] },
  });

  return { thread, saved, none };
}

export const ListedCountsSchema = z.object({
  items: z.array(
    z.object({
      id: z.number(),
      commentsKept: z.number().nullable(),
      commentsTotal: z.number().nullable(),
    }),
  ),
});
