import type { Digest } from "./ai-contract.ts";
import { type SaveResult, foundItem, queuedWrites } from "./items.ts";
import { closeFetchJobs, enqueueRows } from "./job-rows.ts";
import { isGitHubLink, isRedditOrXLink, isRefusedLink, parseLink } from "./links.ts";
import type { Ports } from "./ports.ts";
import { ownerOf } from "./reddit-thread.ts";
import { PAGE_BYTES, type SuppliedPage, pageBytes } from "./supplied-page.ts";

export type PageSaveResult =
  | SaveResult
  | { readonly kind: "invalid"; readonly field: "page"; readonly reason: string }
  | { readonly kind: "too-large"; readonly field: "page" };

const NOT_A_PAGE_LINK = "only a link to an article or another web page takes a page";

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

export function savePage(
  ports: Ports,
  absoluteUrl: string,
  digest: Digest | undefined,
  page: SuppliedPage,
): Promise<PageSaveResult> | PageSaveResult {
  if (isRefusedLink(absoluteUrl)) return { kind: "refused" };

  if (isRedditOrXLink(absoluteUrl) || isGitHubLink(absoluteUrl)) {
    return { kind: "invalid", field: "page", reason: NOT_A_PAGE_LINK };
  }

  return pageBytes(page) > PAGE_BYTES
    ? { kind: "too-large", field: "page" }
    : queuePage(ports, absoluteUrl, digest, page);
}
