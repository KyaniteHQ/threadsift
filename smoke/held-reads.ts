import type { Route } from "@playwright/test";

const REFUSED_READ_MS = 1000;

export async function refuseLater(route: Route): Promise<void> {
  if (route.request().method() !== "GET") {
    await route.fallback();

    return;
  }

  await new Promise<void>((wait) => {
    setTimeout(wait, REFUSED_READ_MS);
  });
  await route.abort("connectionrefused");
}

const LIST_READ_HOLD_MS = 1500;

export const listReads = (url: URL) => url.pathname === "/api/items";

export async function holdListRead(route: Route): Promise<void> {
  if (route.request().method() === "GET") {
    await new Promise<void>((wait) => {
      setTimeout(wait, LIST_READ_HOLD_MS);
    });
  }

  await route.fallback();
}
