import { expect, test } from "@playwright/test";

import { mainInstance } from "./access.ts";
import { listAll, postLink, postLinkRaw, settled } from "./api.ts";
import { jobsAt, jobsOf, storeItem } from "./ingest.ts";
import {
  SHORT_LINK,
  SHORT_LINK_TARGET,
  SHORT_LINK_TARGET_NORMALIZED,
  X_POST,
  httpbinPagePath,
  newRunId,
  throughRedirects,
} from "./links.ts";

test("a short link and its target pasted separately are one Item under the target's URL", async ({
  request,
}) => {
  const jobsBefore = jobsAt(SHORT_LINK_TARGET_NORMALIZED);
  const viaShortLink = await postLinkRaw(request, SHORT_LINK);
  const jobsAfterShortLink = jobsAt(SHORT_LINK_TARGET_NORMALIZED);

  expect(viaShortLink.body.item).toMatchObject({
    status: "processing",
    normalizedUrl: SHORT_LINK_TARGET_NORMALIZED,
    originalUrl: SHORT_LINK,
  });

  expect(jobsAfterShortLink.length, "a short link opens one job at the target").toBe(
    jobsBefore.length + 1,
  );

  const viaShortLinkItem = await settled(request, viaShortLink.body.item.id);

  expect(viaShortLinkItem).toMatchObject({
    status: "ready",
    fetch: "ok",
    title: "Example Domains",
  });

  const direct = await postLink(request, SHORT_LINK_TARGET);

  expect(direct.status).toBe(200);
  expect(direct.body.item.id).toBe(viaShortLink.body.item.id);
  const jobsAfterDirect = jobsAt(SHORT_LINK_TARGET_NORMALIZED);

  expect(jobsAfterDirect.length, "the direct Paste opens a second job").toBe(jobsBefore.length + 2);
  expect(jobsAfterDirect.map((job) => job.state)).toEqual(jobsAfterDirect.map(() => "done"));
  expect((await listAll(request)).filter((item) => item.normalizedUrl === SHORT_LINK)).toEqual([]);
});

test("a meta refresh on a host that is not a short link service is not followed", async ({
  request,
}) => {
  const run = newRunId();
  const markup = `<meta http-equiv=refresh content=0;url=https://example.com/><title>Stays here ${run}</title>`;

  const saved = await postLink(
    request,
    `https://httpbin.dev/response-headers?Content-Type=text/html&t=${encodeURIComponent(markup)}`,
  );

  expect(saved.body.item.fetch).toBe("ok");
  expect(saved.body.item.title).toBe(`Stays here ${run}`);
});

test("redirects are followed by hand, absolute and relative", async ({ request }) => {
  const run = newRunId();

  const pasted = `https://httpbin.org/redirect-to?url=${encodeURIComponent("https://example.com/")}&run=${run}`;
  const absolute = await postLink(request, pasted);

  expect(absolute.body.item.fetch).toBe("ok");
  expect(absolute.body.item.title).toBe("Example Domain");
  expect(absolute.body.item.normalizedUrl).toBe(pasted);

  const page = `<!doctype html><html><head><title>Relative hop ${run}</title></head></html>`;

  const relative = await postLink(
    request,
    `https://httpbin.org/redirect-to?url=${encodeURIComponent(httpbinPagePath(page))}&run=${run}`,
  );

  expect(relative.body.item.fetch).toBe("ok");
  expect(relative.body.item.title).toBe(`Relative hop ${run}`);
});

const REDDIT_POST = "https://www.reddit.com/r/selfhosted/comments/2a4qo6/x/";

test("a redirect to Reddit or X stops without a request, with or without a trailing dot on the host", async ({
  request,
}) => {
  const run = newRunId();

  for (const target of [
    X_POST,
    "https://x.com./jack/status/20",
    REDDIT_POST,
    "https://www.reddit.com./r/selfhosted/comments/2a4qo6/x/",
  ]) {
    const saved = await postLink(request, `${throughRedirects(target, 1)}&run=${run}`);

    expect(saved.status, target).toBe(201);
    expect(saved.body.item.fetch, target).toBe("redirect-stopped");
    expect(saved.body.item.title, target).toBeNull();
  }
});

test("the 21st redirect fails with the limit even when it points to X, and the 20th stops at X", async ({
  request,
}) => {
  test.setTimeout(120_000);
  const run = newRunId();

  const twentyFirst = await postLink(request, `${throughRedirects(X_POST, 21)}&run=${run}`);
  expect(twentyFirst.status).toBe(201);
  expect(twentyFirst.body.item.fetch).toBe("redirect-limit");
  expect(twentyFirst.body.item.title).toBeNull();

  const twentieth = await postLink(request, `${throughRedirects(X_POST, 20)}&run=${run}`);
  expect(twentieth.body.item.fetch).toBe("redirect-stopped");
});

test("a short link whose host ends in a dot is followed like the short link", async ({
  request,
}) => {
  const dotted = await postLink(request, "https://is.gd./hK2a1W");

  expect(dotted.body.item.fetch).toBe("ok");
  expect(dotted.body.item).toMatchObject({
    normalizedUrl: SHORT_LINK_TARGET_NORMALIZED,
    title: "Example Domains",
  });
});

test("a short link pasted while its target's fetch job is open leaves the Item processing and the job alone", async ({
  request,
}) => {
  const instance = mainInstance();
  const now = Date.now();

  instance.sql(
    `DELETE FROM jobs WHERE item_id IN (SELECT id FROM items WHERE normalized_url = '${SHORT_LINK_TARGET_NORMALIZED}')`,
  );
  instance.sql(`DELETE FROM items WHERE normalized_url = '${SHORT_LINK_TARGET_NORMALIZED}'`);

  const id = storeItem({
    normalized_url: SHORT_LINK_TARGET_NORMALIZED,
    original_url: SHORT_LINK_TARGET,
    status: "processing",
  });

  instance.sql(
    `INSERT INTO jobs (kind, item_id, address, state, attempts, next_attempt_at) VALUES ('fetch', ${id}, '${SHORT_LINK_TARGET}', 'queued', 0, ${now + 3_600_000})`,
  );

  const before = jobsOf(id);
  const pasted = await postLinkRaw(request, SHORT_LINK);

  expect(pasted.status).toBe(200);
  expect(pasted.body.item).toMatchObject({ id, status: "processing", reason: null });
  expect(jobsOf(id)).toEqual(before);

  instance.sql(`DELETE FROM jobs WHERE item_id = ${id}`);
  instance.sql(`DELETE FROM items WHERE id = ${id}`);
});
