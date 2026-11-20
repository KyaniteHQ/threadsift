import type { SuppliedPage } from "../contract/supplied-page.ts";
import type { ArticleReading } from "./article.ts";

interface PageReads {
  readonly title: { readonly input: { readonly html: string }; readonly answer: string };
  readonly article: {
    readonly input: { readonly html: string; readonly url: string };
    readonly answer: ArticleReading;
  };
  readonly page: {
    readonly input: { readonly page: SuppliedPage };
    readonly answer: ArticleReading;
  };
}

export type PageRequest = {
  [Kind in keyof PageReads]: { readonly kind: Kind } & PageReads[Kind]["input"];
}[keyof PageReads];

export type RequestsAnswering<Answer> = {
  [Kind in keyof PageReads]: PageReads[Kind]["answer"] extends Answer
    ? { readonly kind: Kind } & PageReads[Kind]["input"]
    : never;
}[keyof PageReads];

export interface PageSource {
  ask(request: Readonly<RequestsAnswering<string>>, deadline: AbortSignal): Promise<string>;
  ask(
    request: Readonly<RequestsAnswering<ArticleReading>>,
    deadline: AbortSignal,
  ): Promise<ArticleReading>;
}

export interface PageReader {
  readonly maxHtmlBytes: number;
  readonly title: (html: string, deadline: AbortSignal) => Promise<string>;
  readonly article: (html: string, url: string, deadline: AbortSignal) => Promise<ArticleReading>;
  readonly page: (page: SuppliedPage, deadline: AbortSignal) => Promise<ArticleReading>;
}

export function pageReaderOver(maxHtmlBytes: number, source: Readonly<PageSource>): PageReader {
  return {
    maxHtmlBytes,
    title: (html, deadline) => source.ask({ kind: "title", html }, deadline),
    article: (html, url, deadline) => source.ask({ kind: "article", html, url }, deadline),
    page: (page, deadline) => source.ask({ kind: "page", page }, deadline),
  };
}
