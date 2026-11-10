import { expect, test } from "@playwright/test";

import { HIGHLIGHTS_PAGE } from "../web/src/highlights-page-text.ts";
import { screenForFile } from "./highlight-screen.ts";
import { entries, openPage, results, searchBox } from "./highlights-page-ui.ts";
import { putPost } from "./highlights.ts";
import { DESKTOP } from "./look.ts";
import { saved } from "./notes.ts";
import { run } from "./thread-fixtures.ts";

const screenOf = screenForFile();

test("a library with no Highlight and no Note shows the empty state and no search box, one Note makes it the list of one, and clearing that Note empties the page again", async () => {
  const { page, context } = screenOf();
  const { request } = context;
  const id = await putPost(request, `em${run}`, "A post with nothing kept in it.");
  const empty = page.getByRole("heading", { level: 2, name: HIGHLIGHTS_PAGE.emptyHeading });

  await openPage(page, DESKTOP.width);
  await expect(empty).toBeVisible();
  await expect(page.getByText(HIGHLIGHTS_PAGE.emptyLine)).toBeVisible();
  await expect(searchBox(page)).toHaveCount(0);
  await expect(entries(page)).toHaveCount(0);

  await saved(request, id, "A note that makes one entry.", 0);
  await page.reload();
  await expect(entries(page)).toHaveCount(1);
  await expect(results(page)).toHaveText("1 highlight or note");
  await expect(empty).toHaveCount(0);

  await saved(request, id, "", 1);
  await page.reload();
  await expect(empty).toBeVisible();
  await expect(entries(page)).toHaveCount(0);
});
