import { type APIRequestContext, expect, test } from "@playwright/test";

import { ItemResponseSchema, type ItemDetail } from "../src/http/schemas.ts";
import { REPOSITORY_LABELS, GITHUB_TOPICS_LABEL, NO_README } from "../web/src/reader-text.ts";
import { mainInstance } from "./access.ts";
import { itemOf, listAll, postLink, postLinkRaw, settled } from "./api.ts";
import { openLibrary, pasteForId } from "./card.ts";
import {
  DEFUDDLE,
  NO_README_REPOSITORY,
  RENAMED_REPOSITORY,
  RENAMED_TO,
  STALE,
  requireGithubBudget,
  storeStaleRepository,
  storedOf,
} from "./github.ts";
import { claimLostLines, afterFirstClaim, forgetItem, jobsOf } from "./ingest.ts";
import { newRunId, rowOf } from "./links.ts";
import { matches } from "./search.ts";

const PUSHED_AFTER = Date.parse("2020-01-01T00:00:00Z");

async function expectDefuddleItem(request: APIRequestContext, id: number) {
  const item = await settled(request, id);

  expect(item).toMatchObject({
    source: "github",
    kind: "github-repo",
    status: "ready",
    fetch: "ok",
    author: "kepano",
    title: "kepano/defuddle",
  });
  expect(item.stars, "stars").toBeGreaterThan(0);
  expect(item.postText, "the README").toContain("Defuddle");
  expect(item.postText?.length, "README length").toBeGreaterThan(1000);
  const { repository } = item;

  if (repository === null) throw new Error(`Item ${id} has no repository`);

  expect(repository.stars).toBe(item.stars);
  expect(repository.description?.length, "description").toBeGreaterThan(0);
  expect(repository.language?.length, "language").toBeGreaterThan(0);
  expect(repository.license?.length, "license").toBeGreaterThan(0);
  expect(repository.topics.length, "topics").toBeGreaterThan(0);
  expect(repository.pushedAt, "last push").toBeGreaterThan(PUSHED_AFTER);
  expect(jobsOf(id).map((job) => job.state)).toEqual(["done"]);

  return { item, repository };
}

async function expectStarsInResponses(
  request: APIRequestContext,
  id: number,
  stars: number | null,
) {
  const listedItem = (await listAll(request)).find((row) => row.id === id);
  const status = await request.get(`/api/items/${id}/status`);

  expect(listedItem?.stars).toBe(stars);
  expect(ItemResponseSchema.parse(await status.json()).item.stars).toBe(stars);
}

function expectSearchPart(id: number, repository: NonNullable<ItemDetail["repository"]>) {
  const [part] = storedOf(id).parts;

  expect(part?.body).toContain(repository.description ?? "missing");

  for (const topic of repository.topics) {
    expect(part?.body).toContain(topic);
  }
}

test("a pasted repository is read through the GitHub API: Source, metadata and README, the Reader block above the README, the stars on the row, and the description and topics in search", async ({
  page,
  request,
}) => {
  await requireGithubBudget(2);
  forgetItem(DEFUDDLE);
  await openLibrary(page);
  const id = await pasteForId(page, DEFUDDLE);
  const { item, repository } = await expectDefuddleItem(request, id);

  await expectStarsInResponses(request, id, item.stars);
  expectSearchPart(id, repository);
  await expect(rowOf(page, id).locator(".it-foot")).toHaveText(
    `${item.stars?.toLocaleString("en-US")} stars`,
  );

  await rowOf(page, id).locator("a.it-open").click();
  await expect(page.locator(".repo")).toBeVisible();
  await expect(page.locator(".repo + .rd-orig")).toContainText("Defuddle");
  await expect(page.locator(".repo-stats dt")).toHaveText(Object.values(REPOSITORY_LABELS));
  await expect(page.locator(".gh-topics")).toContainText(GITHUB_TOPICS_LABEL);
  await expect(page.locator(".gh-topics")).toContainText(repository.topics.join(", "));
});

test("a repository pasted again under its old name is refreshed in place: stale metadata, README and search part are replaced, and the Item id, URL and Read state stay", async ({
  request,
}) => {
  await requireGithubBudget(3);
  const word = `zzstale${newRunId()}`;
  forgetItem(RENAMED_REPOSITORY);
  const id = storeStaleRepository(RENAMED_REPOSITORY, word);

  expect(await matches(request, word)).toEqual([id]);

  const pasted = await postLinkRaw(request, RENAMED_REPOSITORY);

  expect(pasted.status).toBe(200);
  expect(pasted.body.item.id).toBe(id);

  const item = await settled(request, id);

  expect(item).toMatchObject({
    id,
    readState: "read",
    status: "ready",
    fetch: "ok",
    title: RENAMED_TO,
    normalizedUrl: RENAMED_REPOSITORY,
  });
  expect(item.postText).toContain("Threadsift");
  expect(item.postText).not.toContain("stale");
  expect(item.repository).toMatchObject({ language: "TypeScript" });
  expect(item.repository?.description).not.toContain("stale");
  expect(item.repository?.topics).not.toContain(STALE.topic);
  expect(item.stars).not.toBe(STALE.stars);
  expect(item.fetchedAt).toBeGreaterThan(STALE.fetchedAt);
  expect(storedOf(id)).toMatchObject({ repository: [{}], parts: [{}] });
  expect(await matches(request, word)).toEqual([]);
  expect(await matches(request, "reading library")).toContain(id);
});

test("a repository without a README is ready with its metadata and no post text, and the Reader says so", async ({
  page,
  request,
}) => {
  await requireGithubBudget(2);
  forgetItem(NO_README_REPOSITORY);
  const { status, body } = await postLink(request, NO_README_REPOSITORY);
  const item = body.item;

  expect(status).toBe(201);
  expect(item).toMatchObject({
    source: "github",
    kind: "github-repo",
    status: "ready",
    fetch: "ok",
    postText: null,
  });
  expect(item.repository?.stars).toBe(item.stars);
  expect(item.repository?.description?.length, "description").toBeGreaterThan(0);
  expect(storedOf(item.id).parts).toHaveLength(1);

  await openLibrary(page);
  await page.goto(`/items/${item.id}`);
  await expect(page.locator(".repo")).toBeVisible();
  await expect(page.locator(".rd-note")).toHaveText(NO_README);
});

test("a repository that does not exist stays a Link-only Item with the fetch result status", async ({
  request,
}) => {
  await requireGithubBudget(1);
  const { body } = await postLink(request, `https://github.com/KyaniteHQ/missing-${newRunId()}`);

  expect(body.item).toMatchObject({
    source: "github",
    kind: "github-repo",
    status: "ready",
    fetch: "status",
    title: null,
    author: null,
    postText: null,
    stars: null,
    repository: null,
  });
  expect(jobsOf(body.item.id).map((job) => job.state)).toEqual(["done"]);
});

test("a fetch whose claim was taken over publishes no metadata, README or search part, even though it read both from GitHub", async ({
  request,
}) => {
  test.setTimeout(150_000);
  await requireGithubBudget(2);
  const run = newRunId();
  const url = `${DEFUDDLE}?takeover=${run}`;
  const word = `zzlost${run}`;
  const id = storeStaleRepository(url, word);
  const instance = mainInstance();
  const stopTrap = afterFirstClaim(instance, `takeover=${run}`, "attempts = attempts + 1");

  try {
    await postLinkRaw(request, url);
    await expect.poll(() => jobsOf(id)[0]?.attempts, { timeout: 30_000 }).toBe(1);
  } finally {
    stopTrap();
  }

  const [job] = jobsOf(id);

  await expect
    .poll(() => claimLostLines(instance, job?.id ?? 0).length, {
      timeout: 60_000,
      intervals: [500],
    })
    .toBe(1);

  expect(storedOf(id)).toEqual({
    repository: [
      {
        description: `${STALE.description} ${word}`,
        stars: STALE.stars,
        language: STALE.language,
        license: STALE.license,
        topics: `["${STALE.topic}"]`,
        pushed_at: STALE.pushedAt,
      },
    ],
    parts: [{ kind: "repository", body: `${STALE.description} ${word}\n${STALE.topic}` }],
  });
  expect(await itemOf(request, id)).toMatchObject({
    status: "processing",
    title: STALE.title,
    postText: `${STALE.readme} ${word}`,
    stars: STALE.stars,
  });
  forgetItem(url);
});
