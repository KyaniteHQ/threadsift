import type { Digest } from "./ai-contract.ts";
import {
  type Invalid,
  type SaveResult,
  type ThreadKept,
  foundItem,
  queuedWrites,
} from "./items.ts";
import { closeFetchJobs, enqueueRows } from "./job-rows.ts";
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
): Promise<SaveResult> {
  const link = parseLink(absoluteUrl);

  const [, inserted, , , queued, [item]] = await ports.db.batch([
    closeFetchJobs(ports.db, ownerOf(link.normalizedUrl).id),
    ...queuedWrites(
      ports.db,
      { originalUrl: absoluteUrl, address: absoluteUrl, digest },
      link,
      JSON.stringify(page),
    ),
  ]);

  await enqueueRows(ports, queued);

  return {
    kind: "saved",
    item: foundItem(item, link.normalizedUrl),
    created: inserted.length > 0,
  };
}

export async function savePage(
  ports: Ports,
  absoluteUrl: string,
  digest: Digest | undefined,
  page: SuppliedPage,
): Promise<PageSaveResult> {
  if (isRefusedLink(absoluteUrl)) return { kind: "refused" };

  if (!takesPage(absoluteUrl)) {
    return { kind: "invalid", field: "page", reason: NOT_A_PAGE_LINK, code: UNSUPPORTED_PAGE_LINK };
  }

  if (pageBytes(page) > PAGE_BYTES) return { kind: "too-large", field: "page" };

  const saved = await (redditRefOf(absoluteUrl) === null
    ? queuePage(ports, absoluteUrl, digest, page)
    : saveThreadPage(ports, absoluteUrl, { digest, page }));

  return saved;
}
