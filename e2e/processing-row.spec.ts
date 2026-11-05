import { expect, test } from "@playwright/test";

import { mainInstance } from "./access.ts";
import { openLibrary } from "./card.ts";
import { itemIdAt } from "./ingest.ts";
import { newRunId, rowOf } from "./links.ts";

const TITLE = "Example Domain";

for (const width of [390, 1440]) {
  test(`a processing row has the height of the ready row it becomes at ${width} px`, async ({
    page,
  }, info) => {
    const url = `https://example.com/${newRunId()}/height`;
    const instance = mainInstance();

    instance.sql(
      `INSERT INTO items (source, kind, normalized_url, original_url, saved_at, status) VALUES ('other', 'link', '${url}', '${url}', ${Date.now()}, 'processing')`,
    );

    const id = itemIdAt(url);
    await openLibrary(page, width);
    const row = rowOf(page, id);
    await expect(row.locator(".skel i")).toBeVisible();

    const height = async () => Math.round((await row.boundingBox())?.height ?? 0);
    const processing = await height();

    instance.sql(
      `UPDATE items SET status = 'ready', title = '${TITLE}', fetch_result = 'ok' WHERE id = ${id}`,
    );
    await expect(row.locator(".skel")).toHaveCount(0, { timeout: 10_000 });
    await expect(row).toContainText(TITLE);
    const ready = await height();

    await info.attach(`row-heights-${width}.json`, {
      body: JSON.stringify({ width, processing, ready }),
      contentType: "application/json",
    });
    console.log(`ROW-HEIGHTS width=${width} processing=${processing} ready=${ready}`);
    expect(processing).toBe(ready);
  });
}

test("under forced colours the skeleton bar and the icons keep a visible system-colour edge", async ({
  page,
}) => {
  const url = `https://example.com/${newRunId()}/forced`;
  mainInstance().sql(
    `INSERT INTO items (source, kind, normalized_url, original_url, saved_at, status) VALUES ('other', 'link', '${url}', '${url}', ${Date.now()}, 'processing')`,
  );

  await page.emulateMedia({ forcedColors: "active" });
  await openLibrary(page, 1440);
  const row = rowOf(page, itemIdAt(url));
  await expect(row.locator(".skel i")).toBeVisible();

  const seen = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "CanvasText";
    document.body.append(probe);
    const canvasText = getComputedStyle(probe).color;
    probe.remove();

    const bar = document.querySelector(".skel i");
    const icon = document.querySelector(".ic");

    if (bar === null || icon === null) {
      throw new Error("the skeleton or an icon is missing");
    }

    const barStyle = getComputedStyle(bar);

    return {
      canvasText,
      outlineStyle: barStyle.outlineStyle,
      outlineWidth: barStyle.outlineWidth,
      outlineColor: barStyle.outlineColor,
      stroke: getComputedStyle(icon).stroke,
    };
  });

  expect(seen.outlineStyle).toBe("solid");
  expect(seen.outlineWidth).toBe("1px");
  expect(seen.outlineColor).toBe(seen.canvasText);
  expect(seen.stroke).toBe(seen.canvasText);
});
