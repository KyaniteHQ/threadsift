import { CAP_BYTES, decodedPage } from "./check-measure.ts";
import type { Page } from "./check-pages.ts";
import { type Findings, Inconclusive } from "./check-types.ts";

const HTML_TAG = /<\/?(?:p|div|article|h[1-6])\b/u;

export interface Content {
  readonly source: string;
  readonly kind: string;
  readonly status: string;
  readonly fetch: string | null;
  readonly title: string | null;
  readonly postText: string | null;
}

export function stats(values: readonly number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return {
    min: sorted[0] ?? Number.NaN,
    median: sorted[middle] ?? Number.NaN,
    max: sorted.at(-1) ?? Number.NaN,
  };
}

export async function requireFixture(
  findings: Readonly<Findings>,
  page: Readonly<Page>,
): Promise<void> {
  const { bytes, html } = await decodedPage(page.url);
  findings.measure(`${page.name}: decoded bytes`, bytes);

  if (!html || bytes < CAP_BYTES !== page.under) {
    throw new Inconclusive(
      `${page.name} no longer matches its fixture (${String(bytes)} bytes, ${html ? "HTML" : "not HTML"}, measured ${String(page.measuredBytes)}, cap ${String(CAP_BYTES)})`,
    );
  }
}

export function expectArticle(
  findings: Readonly<Findings>,
  page: Readonly<Page>,
  content: Readonly<Content>,
): void {
  const text = content.postText;

  findings.check(
    `${page.name}: ends an Article`,
    content.source === "article" &&
      content.kind === "article" &&
      content.status === "ready" &&
      content.fetch === "ok",
    `${content.source} ${content.kind} ${content.status} ${content.fetch ?? "no fetch"}`,
  );
  findings.check(
    `${page.name}: post text is Markdown with its expected sentence`,
    text !== null && text !== "" && !HTML_TAG.test(text) && text.includes(page.sentence ?? ""),
    `${String(text?.length ?? 0)} characters`,
  );
}

export function expectOther(
  findings: Readonly<Findings>,
  page: Readonly<Page>,
  content: Readonly<Content>,
): void {
  findings.check(
    `${page.name}: ends Other with no post text`,
    content.source === "other" &&
      content.kind === "link" &&
      content.status === "ready" &&
      content.fetch === "ok" &&
      content.postText === null,
    `${content.source} ${content.kind} ${content.status} ${content.fetch ?? "no fetch"}`,
  );
}
