import { refusedHost } from "./admission.ts";
import type { Digest } from "./ai-contract.ts";
import { type Caller, tokenIdOf } from "./caller.ts";
import type { Saved } from "./item-rows.ts";
import { writeItem } from "./item-save.ts";
import { isRedditShareLink, isShortLink, parseLink, redditRefOf, takesPage } from "./links.ts";
import type { Invalid, Refused, ThreadKept, TooLarge } from "./paste-outcome.ts";
import type { Ports } from "./ports.ts";
import {
  PAGE_BYTES,
  type SuppliedPage,
  UNSUPPORTED_PAGE_LINK,
  pageBytes,
} from "./supplied-page.ts";

export type PageSaveResult = Saved | Refused | Invalid<"page"> | TooLarge<"page"> | ThreadKept;

const NOT_A_PAGE_LINK =
  "only a link to an article, another web page, or a Reddit post or comment takes a page";

const SHORTENED_LINK_PAGE =
  "a short link or a Reddit share link takes no page; send the page at the address the link leads to, or send the link alone";

export async function savePage(
  ports: Ports,
  absoluteUrl: string,
  digest: Digest | undefined,
  page: SuppliedPage,
  caller: Caller,
): Promise<PageSaveResult> {
  const refused = refusedHost(absoluteUrl);

  if (refused !== null) return refused;

  if (isShortLink(absoluteUrl) || isRedditShareLink(absoluteUrl)) {
    return {
      kind: "invalid",
      field: "page",
      reason: SHORTENED_LINK_PAGE,
      code: UNSUPPORTED_PAGE_LINK,
    };
  }

  if (!takesPage(absoluteUrl)) {
    return { kind: "invalid", field: "page", reason: NOT_A_PAGE_LINK, code: UNSUPPORTED_PAGE_LINK };
  }

  if (pageBytes(page) > PAGE_BYTES) return { kind: "too-large", field: "page" };

  const saved = await writeItem(ports, {
    kind: "page",
    paste: {
      originalUrl: absoluteUrl,
      address: absoluteUrl,
      digest,
      addedByToken: tokenIdOf(caller),
    },
    link: parseLink(absoluteUrl),
    page,
    keepsThread: redditRefOf(absoluteUrl) !== null,
  });

  return saved ?? { kind: "thread-kept" };
}
