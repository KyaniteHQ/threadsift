import { type Digest } from "./ai-contract.ts";
import { dataStepsFinished } from "./data-steps.ts";
import { utf8Length } from "./digest-prompt.ts";
import { itemAt, type SaveResult } from "./items.ts";
import { enqueueItemJobs } from "./job-rows.ts";
import { parseLink, redditRefOf } from "./links.ts";
import type { Ports } from "./ports.ts";
import { THREAD_CONTENT_BYTES, parseRedditThread } from "./reddit-json.ts";
import { saveItem } from "./save-link.ts";
import { threadItemInsert, threadPublication } from "./thread-publish.ts";

export interface Supplied {
  readonly digest?: Digest | undefined;
  readonly content?: string | undefined;
}

export type PasteResult =
  | SaveResult
  | { readonly kind: "invalid"; readonly reason: string }
  | { readonly kind: "too-large" }
  | { readonly kind: "updating" };

const NOT_A_THREAD_LINK = "only a Reddit post or comment link takes content";

async function saveThread(
  ports: Ports,
  absoluteUrl: string,
  { digest, content }: Readonly<{ digest: Digest | undefined; content: string }>,
): Promise<PasteResult> {
  const ref = redditRefOf(absoluteUrl);

  if (ref === null) return { kind: "invalid", reason: NOT_A_THREAD_LINK };

  const parsed = parseRedditThread(content, ref);

  if (parsed.kind === "refused") return { kind: "invalid", reason: parsed.reason };

  const { db } = ports;
  const place = { ...parseLink(absoluteUrl), address: absoluteUrl };

  const [inserted] = await db.batch([
    threadItemInsert(db, place),
    ...threadPublication(
      db,
      place,
      parsed.thread,
      digest === undefined ? null : JSON.stringify(digest),
    ),
  ]);

  const item = await itemAt(db, place.normalizedUrl);
  await enqueueItemJobs(ports, item.id);

  return { kind: "saved", item, created: inserted.length > 0 };
}

export async function paste(
  ports: Ports,
  absoluteUrl: string,
  { digest, content }: Readonly<Supplied> = {},
): Promise<PasteResult> {
  if (!(await dataStepsFinished(ports.db))) return { kind: "updating" };

  if (content === undefined) return saveItem(ports, absoluteUrl, digest);

  if (utf8Length(content) > THREAD_CONTENT_BYTES) return { kind: "too-large" };

  return saveThread(ports, absoluteUrl, { digest, content });
}
