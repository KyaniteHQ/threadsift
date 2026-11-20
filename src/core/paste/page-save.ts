import { type Caller, tokenIdOf } from "../access/caller.ts";
import type { Digest } from "../contract/digest-schema.ts";
import { isRedditShareLink, isShortLink, parseLink, takesPage } from "../contract/links.ts";
import {
  PAGE_BYTES,
  type SuppliedPage,
  UNSUPPORTED_PAGE_LINK,
  pageBytes,
} from "../contract/supplied-page.ts";
import { refusedHost } from "../item/admission.ts";
import type { Invalid, Refused, ThreadKept, TooLarge } from "../kernel/paste-outcome.ts";
import type { Ports } from "../kernel/ports.ts";
import { type Saved, savePaged } from "./item-save.ts";

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

  const saved = await savePaged(
    ports,
    { originalUrl: absoluteUrl, address: absoluteUrl, digest, addedByToken: tokenIdOf(caller) },
    parseLink(absoluteUrl),
    page,
  );

  return saved ?? { kind: "thread-kept" };
}
