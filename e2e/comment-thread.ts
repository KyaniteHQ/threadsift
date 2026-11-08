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

export const MANY = { kept: 1000, reported: 1200 } as const;

export const FOOTNOTE_REFERENCE = "[^1]";

export function footnoted(text: string, note: string): string {
  return `${text}${FOOTNOTE_REFERENCE}\n\n${FOOTNOTE_REFERENCE}: ${note}`;
}

export const GUIDE_LINK = "the guide";
export const PREVIEW_LINK = "the preview";

const TALL = [
  `Kept tall paragraph 1 ${"holds a long run of ordinary sentences that wraps over many lines, so one paragraph reaches well past the six lines a folded comment shows. ".repeat(6)}`,
  `A link below the preview: [${GUIDE_LINK}](https://example.com/guide).`,
  `\`\`\`\nnpm run cache --path /tmp/cache --verbose --retries 5 --timeout 30000 --log /var/log/cache.log --keep 20\n\`\`\``,
].join("\n\n");

function tree() {
  return [
    comment("c1", "reader_a", TALL, [
      comment("c2", "AutoModerator", "Please read the rules.", [
        comment(
          "c3",
          POST_AUTHOR,
          footnoted("Kept three. Set the cache path before the first run.", "Footnote of three."),
        ),
      ]),
      comment("c4", "reader_c", "+1"),
      comment("c5", "reader_d", "A perfectly ordinary remark.", [
        comment(
          "c8",
          "reader_g",
          footnoted(
            "Kept eight. Pointing the path at tmpfs fixed it for me.",
            "Footnote of eight.",
          ),
          [comment("c9", "reader_h", "Kept nine. The same fix held after a reboot.", [MORE])],
        ),
      ]),
      MORE,
    ]),
    comment("c6", "reader_e", "[deleted]", [
      comment("c7", "reader_f", "Kept seven. I ran it for three weeks without a crash."),
    ]),
    comment(
      "c10",
      "reader_i",
      `[${PREVIEW_LINK}](https://example.com/preview) ${paragraphs(40, "Kept long")}`,
    ),
    MORE,
  ];
}

export interface Seeded {
  readonly thread: number;
  readonly saved: number;
  readonly none: number;
  readonly many: number;
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
    content: threadJson(
      post(threadId, footnoted("The post body.", "Footnote of the post."), REPORTED),
      tree(),
    ),
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

  const manyId = `m${run}`;
  const manyIds = Array.from({ length: MANY.kept }, (_, index) => `m${index}`);

  const many = await sent(screen, {
    url: postUrl(manyId),
    content: threadJson(
      post(manyId, "A post with a thousand Kept comments.", MANY.reported),
      manyIds.map((id) => comment(id, "reader_m", `Kept ${id}. A fix that held for me.`)),
    ),
    digest: { ...AUTHORED_DIGEST, keptComments: manyIds.map((id) => `t1_${id}`) },
  });

  return { thread, saved, none, many };
}

export const DetailNodesSchema = z.object({
  item: z.object({
    comments: z.object({
      nodes: z.array(
        z.object({ id: z.string(), parentId: z.string().nullable(), depth: z.number() }),
      ),
    }),
  }),
});

export const ListedCountsSchema = z.object({
  items: z.array(
    z.object({
      id: z.number(),
      commentsKept: z.number().nullable(),
      commentsTotal: z.number().nullable(),
    }),
  ),
});
