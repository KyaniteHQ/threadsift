import { statusIdOf } from "../../../core/contract/links.ts";
import { type Anchor, LINK, squashed } from "./x-paragraph.ts";

interface LinkedPost {
  readonly id: string;
  readonly whole: string;
  readonly links: readonly Anchor[];
  readonly cut: unknown;
}

interface QuoteLink {
  readonly target: string;
  readonly links: readonly Anchor[];
  readonly whole: string;
}

function otherStatusId(address: string | undefined, ownId: string): string | null {
  if (address === undefined || !URL.canParse(address)) return null;

  const id = statusIdOf(address);

  return id === ownId ? null : id;
}

export function withoutQuoteLink(
  post: Readonly<LinkedPost>,
  resolved: Readonly<ReadonlyMap<string, string>>,
): QuoteLink | null {
  const last = post.links.at(-1);
  const target = last === undefined ? null : otherStatusId(resolved.get(last.href), post.id);

  if (post.cut !== null || target === null || !post.whole.endsWith(LINK)) return null;

  return {
    target,
    links: post.links.slice(0, -1),
    whole: squashed(post.whole.slice(0, -LINK.length)),
  };
}

export function rejectedQuotes(
  next: string | null,
  quoted: string | null,
  showsNoQuote: boolean,
): readonly string[] {
  if (quoted !== null) return quoted === next ? [] : [quoted, ...(next === null ? [] : [next])];

  return showsNoQuote && next !== null ? [next] : [];
}
