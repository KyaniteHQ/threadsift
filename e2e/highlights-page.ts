import type { APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

import { HighlightsPageResponseSchema } from "../src/http/highlights-page-schemas.ts";

export const PAGE_SIZE = 50;

export type Page = ReturnType<typeof HighlightsPageResponseSchema.parse>;

export async function pageAt(
  request: APIRequestContext,
  params: Readonly<Record<string, string>> = {},
  headers: Readonly<Record<string, string>> = {},
) {
  const response = await request.get("/api/highlights", { params, headers });

  return { status: response.status(), response };
}

export async function pageOf(
  request: APIRequestContext,
  params: Readonly<Record<string, string>> = {},
  headers: Readonly<Record<string, string>> = {},
): Promise<Page> {
  const { status, response } = await pageAt(request, params, headers);
  expect(status, await response.text()).toBe(200);

  return HighlightsPageResponseSchema.parse(await response.json());
}

export async function allPages(
  request: APIRequestContext,
  params: Readonly<Record<string, string>> = {},
): Promise<Page[]> {
  const pages: Page[] = [];
  let cursor: string | null = null;

  do {
    const page: Page = await pageOf(request, cursor === null ? params : { ...params, cursor });
    pages.push(page);
    cursor = page.next;
  } while (cursor !== null);

  return pages;
}

export function summary(page: Readonly<Page>) {
  return page.entries.map(({ kind, id, text }) => `${kind}:${String(id)}:${text}`);
}

export function textsOf(page: Readonly<Page>): string[] {
  return page.entries.map(({ text }) => text);
}
