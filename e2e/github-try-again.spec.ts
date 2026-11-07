import { type Locator, type Page, expect, test } from "@playwright/test";

import { DIGEST_NOT_UPDATED, RETRY_LABEL } from "../web/src/text.ts";
import { mainInstance } from "./access.ts";
import { itemOf, postLinkRaw, settled } from "./api.ts";
import { openLibrary, unreachableUrl } from "./card.ts";
import {
  KEPT_DIGEST,
  NO_README_REPOSITORY,
  STALE,
  generationOf,
  markDigestFailed,
  requireGithubBudget,
  storeKeptDigest,
  storeStaleRepository,
} from "./github.ts";
import { forgetItem, jobsOf, storeItem } from "./ingest.ts";
import { newRunId } from "./links.ts";
import { openRow, reader, row } from "./reader.ts";

type Surface = Readonly<{
  name: string;
  width: number;
  control: (page: Page, id: number) => Locator;
  open: (page: Page, id: number) => Promise<void>;
}>;

const ROW: Surface = {
  name: "the list row",
  width: 1440,
  control: row,
  open: () => Promise.resolve(),
};

const READER_OPEN = async (page: Page, id: number) => {
  await openRow(page, id);
};

const SURFACES: readonly Surface[] = [
  ROW,
  { name: "the Reader beside the list", width: 1440, control: reader, open: READER_OPEN },
  { name: "the Reader over the list on a phone", width: 390, control: reader, open: READER_OPEN },
];

async function tryAgainOn(page: Page, id: number, surface: Surface = ROW) {
  await openLibrary(page, surface.width);
  await surface.open(page, id);
  const control = surface.control(page, id);

  await expect(control.getByText(DIGEST_NOT_UPDATED, { exact: true })).toBeVisible();

  const answered = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/api/items"),
  );

  await control.getByRole("button", { name: RETRY_LABEL, exact: true }).click();

  return new URL((await answered).url()).pathname;
}

function seedMarkedItem(url: string, text: string | null): number {
  const id = storeItem({
    normalized_url: url,
    title: "Marked item",
    post_text: text,
    fetch_result: "ok",
    fetched_at: STALE.fetchedAt,
  });

  storeKeptDigest(id);
  markDigestFailed(id);

  return id;
}

test("a refresh that finds no README clears the text, moves the content generation on and marks the kept Digest not updated, so a Digest that started on the old text cannot publish, and Try again fetches the README again", async ({
  page,
  request,
}) => {
  await requireGithubBudget(4);
  forgetItem(NO_README_REPOSITORY);
  const id = storeStaleRepository(NO_README_REPOSITORY, "zzcleared");

  storeKeptDigest(id);
  expect(await itemOf(request, id)).toMatchObject({ digestOutcome: "none" });

  const pasted = await postLinkRaw(request, NO_README_REPOSITORY);

  expect(pasted.status).toBe(200);

  const item = await settled(request, id);

  expect(item).toMatchObject({
    id,
    status: "ready",
    fetch: "ok",
    postText: null,
    digestTitle: KEPT_DIGEST.title,
    digestOutcome: "failed",
    retry: "paste",
  });
  expect(generationOf(id)).toBe(KEPT_DIGEST.generation + 1);
  expect(item.repository?.description).not.toContain(STALE.description);

  const fetches = jobsOf(id, mainInstance(), "fetch").length;

  expect(await tryAgainOn(page, id)).toBe("/api/items");
  await expect.poll(() => jobsOf(id, mainInstance(), "fetch").length).toBe(fetches + 1);
  expect(jobsOf(id, mainInstance(), "digest")).toEqual([]);
  expect(await settled(request, id)).toMatchObject({
    id,
    status: "ready",
    postText: null,
    digestOutcome: "failed",
    retry: "paste",
  });
  expect(generationOf(id)).toBe(KEPT_DIGEST.generation + 2);
});

for (const surface of SURFACES) {
  test(`Try again in ${surface.name} on a kept Digest of an Item with no Digest source fetches the link again`, async ({
    page,
    request,
  }) => {
    const id = seedMarkedItem(unreachableUrl(newRunId()), null);

    expect(await itemOf(request, id)).toMatchObject({
      postText: null,
      digestOutcome: "failed",
      retry: "paste",
    });
    expect(await tryAgainOn(page, id, surface)).toBe("/api/items");
    await expect.poll(() => jobsOf(id, mainInstance(), "fetch").length).toBe(1);
    expect(jobsOf(id, mainInstance(), "digest")).toEqual([]);
  });

  test(`Try again in ${surface.name} on a kept Digest of an Item that still has text queues a Digest and fetches nothing`, async ({
    page,
    request,
  }) => {
    const id = seedMarkedItem(unreachableUrl(newRunId()), STALE.readme);

    expect(await itemOf(request, id)).toMatchObject({
      postText: STALE.readme,
      digestOutcome: "failed",
      retry: "digest",
    });
    expect(await tryAgainOn(page, id, surface)).toBe(`/api/items/${id}/digest`);
    await expect.poll(() => jobsOf(id, mainInstance(), "digest").length).toBe(1);
    expect(jobsOf(id, mainInstance(), "fetch")).toEqual([]);
  });
}
