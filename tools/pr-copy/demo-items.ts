import type { z } from "zod";

import type { ItemResponseSchema } from "../../src/http/schemas.ts";

export const CHECKED_FIELDS = ["status", "source", "title", "fetch"] as const;

type Item = z.infer<typeof ItemResponseSchema>["item"];

export interface DemoItem {
  readonly url: string;
  readonly expected: Readonly<Partial<Pick<Item, (typeof CHECKED_FIELDS)[number]>>>;
}

export const DEMO_ITEMS: readonly DemoItem[] = [
  {
    url: "https://stephango.com/saw",
    expected: { status: "ready", source: "article", fetch: "ok" },
  },
  {
    url: "https://matklad.github.io/2023/10/12/lsp-could-have-been-better.html",
    expected: { status: "ready", source: "article", fetch: "ok" },
  },
  {
    url: "https://example.com/",
    expected: { status: "ready", source: "other", title: "Example Domain", fetch: "ok" },
  },
  {
    url: "https://threadsift-demo.invalid/",
    expected: { status: "failed", title: null, fetch: "network" },
  },
];
