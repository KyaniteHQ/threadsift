import { REQUEST_HEADERS } from "../../src/core/ports.ts";
import { MAX_HTML_BYTES } from "../../src/targets/worker/page-reader.ts";
import type { Page } from "./check-pages.ts";
import { type Findings, Inconclusive } from "./check-types.ts";
import { callTimeout } from "./timeout.ts";

const HTML_TAG = /<\/?(?:p|div|article|h[1-6])\b/u;

export async function decodedPage(url: string): Promise<{ bytes: number; html: boolean }> {
  const response = await fetch(url, { headers: REQUEST_HEADERS, signal: callTimeout() });
  const { byteLength } = await response.arrayBuffer();

  return {
    bytes: byteLength,
    html: (response.headers.get("content-type") ?? "").startsWith("text/html"),
  };
}

export interface Content {
  readonly source: string;
  readonly kind: string;
  readonly status: string;
  readonly fetch: string | null;
  readonly title: string | null;
  readonly postText: string | null;
}

export async function requireFixture(
  findings: Readonly<Findings>,
  page: Readonly<Page>,
): Promise<void> {
  const { bytes, html } = await decodedPage(page.url);
  findings.measure(`${page.name}: decoded bytes`, bytes);

  if (!html || bytes < MAX_HTML_BYTES !== page.under) {
    throw new Inconclusive(
      `${page.name} no longer matches its fixture (${String(bytes)} bytes, ${html ? "HTML" : "not HTML"}, measured ${String(page.measuredBytes)}, cap ${String(MAX_HTML_BYTES)})`,
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
