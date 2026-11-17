import type { ArticleReading } from "../../core/article.ts";
import type { SuppliedPage } from "../../core/supplied-page.ts";

export type PageRequest =
  | { readonly kind: "title"; readonly html: string }
  | { readonly kind: "article"; readonly html: string; readonly url: string }
  | { readonly kind: "page"; readonly page: SuppliedPage };

export type RequestMessage = PageRequest & { readonly id: number };

export type Reply =
  | { readonly id: number; readonly ok: true; readonly value: string | ArticleReading }
  | { readonly id: number; readonly ok: false; readonly message: string };
