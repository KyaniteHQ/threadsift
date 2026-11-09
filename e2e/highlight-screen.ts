import { test } from "@playwright/test";

import { projectText } from "../src/core/text-projection.ts";
import { newCode, newPassword } from "./access.ts";
import { itemOf } from "./api.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { seedThread } from "./highlight-reader.ts";
import { created, selectorOf } from "./highlights.ts";
import { run } from "./thread-fixtures.ts";
import { comment } from "./threads.ts";

export function screenForFile(timeout = 300_000): () => FreshScreen {
  test.describe.configure({ timeout });
  test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

  let screen: FreshScreen | null = null;

  test.beforeAll(async ({ browser }) => {
    screen = await openSignedIn(browser, newCode(), newPassword());
  });

  test.afterAll(async () => {
    await screen?.close();
  });

  return () => {
    if (screen === null) throw new Error("the screen opens in beforeAll");

    return screen;
  };
}

export const POST_TEXT = [
  "The notebook cache decides how fast a reader finds the saved page.",
  "Set the cache path **before** the first run, because a [wrong path](https://example.com/paths) silently falls back to the temp folder.",
  "A second paragraph says the fallback folder is cleared on reboot. Another sentence follows it.",
].join("\n\n");

const LONG_COMMENT = [
  ...Array.from(
    { length: 12 },
    (_, index) => `Remark number ${index + 1} about how the cache behaves.`,
  ),
  "Pointing the path at tmpfs fixed it for me.",
].join("\n\n");

const SNIPPET = [
  "A longer snippet follows.",
  ["```sh", ...Array.from({ length: 30 }, (_, index) => `echo step ${index + 1}`), "```"].join(
    "\n",
  ),
].join("\n\n");

const COMMENTS = [
  comment("c1", "reader_a", LONG_COMMENT),
  comment("c2", "reader_b", "A short remark with one useful sentence."),
  comment("c3", "reader_c", SNIPPET),
];

const KEPT = ["t1_c1", "t1_c2", "t1_c3"];

export function thread(tag: string, text = POST_TEXT) {
  return { id: `${tag}${run}`, text, comments: COMMENTS, kept: KEPT };
}

export const POST_PHRASE = "cache path before the first run";
export const COMMENT_PHRASE = "useful sentence";

function bodyAt(detail: Awaited<ReturnType<typeof itemOf>>, where: string): string {
  if (where === "post") return detail.postText ?? "";

  const node = detail.comments.nodes.find(({ id }) => id === where);

  return node?.kind === "comment" ? node.body : "";
}

export async function keepThroughApi(
  { context }: Readonly<Pick<FreshScreen, "context">>,
  id: number,
  quotes: readonly (readonly [string, string])[],
): Promise<void> {
  const detail = await itemOf(context.request, id);
  const { revisions } = detail.highlights;

  for (const [where, quote] of quotes) {
    const isPost = where === "post";

    await created(context.request, id, {
      target: isPost ? { kind: "post" } : { kind: "comment", commentId: where },
      revision: (isPost ? revisions.post : revisions.comments) ?? -1,
      selector: selectorOf(projectText(bodyAt(detail, where)), quote),
    });
  }
}

const DESIGN_TEXT = [
  POST_TEXT,
  "A third paragraph keeps a long line of ordinary words that wraps over several lines on a narrow screen, so a selection can start on one line and end on another.",
].join("\n\n");

export const SAVED = [
  "cache path before the first run",
  "fallback folder is cleared on reboot",
  "A",
] as const;

export const SELECTED = ["wraps over several", "can start on one line"] as const;

export async function seededItem(screen: Readonly<FreshScreen>, tag: string): Promise<number> {
  const id = await seedThread(screen, {
    id: `${tag}${run}`,
    text: DESIGN_TEXT,
    comments: [comment("c1", "reader_a", "A short remark with one useful sentence.")],
    kept: ["t1_c1"],
  });

  await keepThroughApi(
    screen,
    id,
    SAVED.map((quote) => ["post", quote] as const),
  );

  return id;
}
