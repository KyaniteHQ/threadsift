import type { Browser } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { itemOf } from "./api.ts";
import { pasteLive } from "./articles.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { MIXED_PAGE } from "./media-pages.ts";
import { routesIn } from "./media.ts";
import { seedRows } from "./reader.ts";

export interface ArticleScreen {
  readonly screen: FreshScreen;
  readonly articleId: number;
  readonly plainId: number;
  readonly routes: readonly string[];
}

export async function openArticleScreen(browser: Browser): Promise<ArticleScreen> {
  const screen = await openSignedIn(browser, newCode(), newPassword());

  try {
    const { last } = await pasteLive(screen.context.request, { name: "mixed", url: MIXED_PAGE });

    const [plainId = 0] = seedRows(screen, [
      {
        url: "https://example.com/plain",
        title: "A plain article",
        source: "article",
        kind: "article",
        postText: "Words only.",
        savedAt: Date.now() + 1000,
      },
    ]);

    return { screen, articleId: last.item.id, plainId, routes: routesIn(last.item.postText) };
  } catch (error) {
    await screen.close();
    throw error;
  }
}

export interface Refreshed {
  readonly before: readonly string[];
  readonly after: readonly string[];
}

export async function refreshArticle({
  screen,
  articleId,
}: Readonly<Pick<ArticleScreen, "screen" | "articleId">>): Promise<Refreshed> {
  const { request } = screen.context;
  const before = routesIn((await itemOf(request, articleId)).postText);
  const { last } = await pasteLive(request, { name: "refresh", url: MIXED_PAGE });

  if (last.item.id !== articleId) throw new Error("a refresh of the Article made a new Item");

  return { before, after: routesIn(last.item.postText) };
}
