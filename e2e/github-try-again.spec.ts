import { type Page, expect, test } from "@playwright/test";

import { DIGEST_NOT_UPDATED, RETRY_LABEL } from "../web/src/text.ts";
import { mainInstance } from "./access.ts";
import { itemOf, postLinkRaw, settled } from "./api.ts";
import { openLibrary } from "./card.ts";
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
import { forgetItem, jobsOf } from "./ingest.ts";
import { newRunId } from "./links.ts";

async function tryAgainOn(page: Page, id: number) {
  await openLibrary(page);
  const row = page.locator(`article[data-key='${id}']`);

  await expect(row.getByText(DIGEST_NOT_UPDATED, { exact: true })).toBeVisible();

  const answered = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/api/items"),
  );

  await row.getByRole("button", { name: RETRY_LABEL, exact: true }).click();

  return new URL((await answered).url()).pathname;
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

test("Try again on a kept Digest of an Item that still has text queues a Digest and fetches nothing", async ({
  page,
  request,
}) => {
  const url = `https://github.com/kyanite-proof/kept-${newRunId()}`;
  const id = storeStaleRepository(url, "zzkept");

  storeKeptDigest(id);
  markDigestFailed(id);

  expect(await itemOf(request, id)).toMatchObject({
    postText: expect.stringContaining(STALE.readme),
    digestOutcome: "failed",
    retry: "digest",
  });
  expect(await tryAgainOn(page, id)).toBe(`/api/items/${id}/digest`);
  await expect.poll(() => jobsOf(id, mainInstance(), "digest").length).toBe(1);
  expect(jobsOf(id, mainInstance(), "fetch")).toEqual([]);
});
