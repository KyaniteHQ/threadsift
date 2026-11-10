import { type APIRequestContext, expect, test } from "@playwright/test";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { settled } from "./api.ts";
import { keepBetween, marks, openReader, removeButton } from "./highlight-reader.ts";
import { screenForFile } from "./highlight-screen.ts";
import { DESKTOP } from "./look.ts";
import { reader } from "./reader.ts";

const screenOf = screenForFile();

const RED_PICTURE =
  "iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAAKklEQVR4nO3NMQ0AAAgDsAmb/yALGXA06d9MeyJisVgsFovFYrFYLP4bL9HP3Ew1mJ9PAAAAAElFTkSuQmCC";

const BLUE_PICTURE =
  "iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAAKklEQVR4nO3NMQ0AAAgDsAmb/yALGXA06d+0cyJisVgsFovFYrFYLP4bL7EE3EwxEylPAAAAAElFTkSuQmCC";

const GAP_BETWEEN_PICTURES = "12px";

async function savedLamps(request: APIRequestContext): Promise<number> {
  const response = await request.post("/api/items", {
    data: {
      url: `https://adjacent-pictures-${Date.now()}.invalid/lamps`,
      page: {
        title: "Two lamps",
        markdown: [
          "The first lamp on the quay burned until dawn and the keeper logged each hour.",
          `![First lamp](data:image/png;base64,${RED_PICTURE})\n![Second lamp](data:image/png;base64,${BLUE_PICTURE})`,
          "By morning the second lamp had gone dark and the keeper closed the log.",
          Array.from({ length: 120 }, (_, word) => `word${word}`).join(" "),
        ].join("\n\n"),
      },
    },
  });

  expect(response.status()).toBe(201);

  const { id } = await settled(
    request,
    SavedItemResponseSchema.parse(await response.json()).item.id,
  );

  return id;
}

test("a passage across two adjacent stored pictures keeps the gap between them while kept and after it is removed", async () => {
  const screen = screenOf();
  const { page, context } = screen;

  const id = await savedLamps(context.request);

  await openReader(page, id, DESKTOP.width);

  const body = reader(page).locator(".md").first();
  const second = body.locator(".rd-media").nth(1);
  const gap = () => second.evaluate((picture) => getComputedStyle(picture).marginTop);

  await expect(body.locator(".rd-media img")).toHaveCount(2);
  expect(await gap(), "before Keep").toBe(GAP_BETWEEN_PICTURES);

  const kept = await keepBetween(
    screen,
    id,
    body,
    "first lamp on the quay",
    "keeper closed the log",
  );

  await expect(marks(body).first()).toBeVisible();
  expect(await gap(), "after Keep").toBe(GAP_BETWEEN_PICTURES);
  await expect(body.locator(`.rd-media mark[data-highlights~="${kept.id}"] img`)).toHaveCount(2);

  await marks(body).first().click();
  await expect(removeButton(page)).toBeVisible();
  await removeButton(page).click();
  await expect(marks(body)).toHaveCount(0);
  await expect(body.locator(".rd-media img")).toHaveCount(2);
  expect(await gap(), "after Remove").toBe(GAP_BETWEEN_PICTURES);
});
