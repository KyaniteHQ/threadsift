import type { Digest } from "./ai-contract.ts";
import { type Caller, countedToken } from "./caller.ts";
import { type Invalid, type SaveResult, type ThreadKept, itemAt, queuedWrites } from "./items.ts";
import { closeItemJobs } from "./job-close.ts";
import { enqueueItemJobs } from "./job-rows.ts";
import { isRefusedLink, parseLink, redditRefOf, takesPage } from "./links.ts";
import type { Ports } from "./ports.ts";
import { ownerOf } from "./reddit-thread.ts";
import {
  PAGE_BYTES,
  type SuppliedPage,
  UNSUPPORTED_PAGE_LINK,
  pageBytes,
} from "./supplied-page.ts";
import { saveThreadPage } from "./thread-page.ts";

export type PageSaveResult =
  | SaveResult
  | Invalid<"page">
  | { readonly kind: "too-large"; readonly field: "page" }
  | ThreadKept;

const NOT_A_PAGE_LINK =
  "only a link to an article, another web page, or a Reddit post or comment takes a page";

async function queuePage(
  ports: Ports,
  absoluteUrl: string,
  digest: Digest | undefined,
  page: SuppliedPage,
  caller: Caller,
): Promise<SaveResult> {
  const link = parseLink(absoluteUrl);

  const [insert, ...rest] = queuedWrites(
    ports.db,
    {
      originalUrl: absoluteUrl,
      address: absoluteUrl,
      digest,
      addedByToken: countedToken(caller),
    },
    link,
    JSON.stringify(page),
  );

  const [inserted] = await ports.db.batch([
    insert,
    ...closeItemJobs(ports.db, ownerOf(link.normalizedUrl).id),
    ...rest,
  ]);

  const item = await itemAt(ports.db, link.normalizedUrl);

  await enqueueItemJobs(ports, item.id);

  return { kind: "saved", item, created: inserted.length > 0 };
}

export async function savePage(
  ports: Ports,
  absoluteUrl: string,
  digest: Digest | undefined,
  page: SuppliedPage,
  caller: Caller,
): Promise<PageSaveResult> {
  if (isRefusedLink(absoluteUrl)) return { kind: "refused" };

  if (!takesPage(absoluteUrl)) {
    return { kind: "invalid", field: "page", reason: NOT_A_PAGE_LINK, code: UNSUPPORTED_PAGE_LINK };
  }

  if (pageBytes(page) > PAGE_BYTES) return { kind: "too-large", field: "page" };

  const saved = await (redditRefOf(absoluteUrl) === null
    ? queuePage(ports, absoluteUrl, digest, page, caller)
    : saveThreadPage(ports, absoluteUrl, { digest, page, addedByToken: countedToken(caller) }));

  return saved;
}
