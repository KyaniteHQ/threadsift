import type { ArticleReading } from "./article.ts";
import type { SuppliedPage } from "./supplied-page.ts";

export interface PageReader {
  readonly maxHtmlBytes: number;
  readonly title: (html: string, deadline: AbortSignal) => Promise<string>;
  readonly article: (html: string, url: string, deadline: AbortSignal) => Promise<ArticleReading>;
  readonly page: (page: SuppliedPage, deadline: AbortSignal) => Promise<ArticleReading>;
}
