import type { ArticleReading } from "../../core/kernel/article.ts";
import type { PageRequest } from "../../core/kernel/page-reader.ts";

export type RequestMessage = PageRequest & { readonly id: number };

export type Reply =
  | { readonly id: number; readonly ok: true; readonly value: string | ArticleReading }
  | { readonly id: number; readonly ok: false; readonly message: string };
