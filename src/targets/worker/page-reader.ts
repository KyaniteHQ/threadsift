import { readArticle, readTitle } from "../../core/article.ts";
import type { PageReader } from "../../core/ports.ts";

const MAX_HTML_BYTES = 900 * 1024;

export const workerPageReader: PageReader = {
  maxHtmlBytes: MAX_HTML_BYTES,
  title: (html) => Promise.resolve(readTitle(html)),
  article: readArticle,
};
