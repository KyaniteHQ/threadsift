import {
  type ArticleReading,
  readArticle,
  readSuppliedPage,
  readTitle,
} from "../kernel/article.ts";
import type { PageRequest, RequestsAnswering } from "../kernel/page-reader.ts";

export function answerPage(request: Readonly<RequestsAnswering<string>>): Promise<string>;
export function answerPage(
  request: Readonly<RequestsAnswering<ArticleReading>>,
): Promise<ArticleReading>;
export function answerPage(request: Readonly<PageRequest>): Promise<string | ArticleReading>;
export function answerPage(request: Readonly<PageRequest>): Promise<string | ArticleReading> {
  switch (request.kind) {
    case "title":
      return Promise.resolve(readTitle(request.html));
    case "article":
      return readArticle(request.html, request.url);
    case "page":
      return Promise.resolve(readSuppliedPage(request.page));
    default: {
      const exhaustive: never = request;

      throw new Error(JSON.stringify(exhaustive));
    }
  }
}
