import { expect, test } from "@playwright/test";

import { listAll, postLink } from "./api.ts";
import { httpbinPagePath, newRunId } from "./links.ts";

const SHORT_LINK = "https://is.gd/hK2a1W";
const SHORT_LINK_TARGET = "https://www.iana.org/help/example-domains";
const SHORT_LINK_TARGET_NORMALIZED = "https://iana.org/help/example-domains";

test("a short link and its target pasted separately are one Item under the target's URL", async ({
  request,
}) => {
  const viaShortLink = await postLink(request, SHORT_LINK);
  const direct = await postLink(request, SHORT_LINK_TARGET);

  expect(viaShortLink.body.fetch).toBe("ok");
  expect(viaShortLink.body.item).toMatchObject({
    normalizedUrl: SHORT_LINK_TARGET_NORMALIZED,
    originalUrl: SHORT_LINK,
    title: "Example Domains",
  });

  expect(direct.status).toBe(200);
  expect(direct.body.item.id).toBe(viaShortLink.body.item.id);
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

  expect(saved.body.fetch).toBe("ok");
  expect(saved.body.item.title).toBe(`Stays here ${run}`);
});

test("a renamed GitHub repository gets the final page's title and keeps the pasted URL as its identity", async ({
  request,
}) => {
  const renamed = await postLink(request, "https://github.com/KyaniteHQ/commonplace");
  const current = await postLink(request, "https://github.com/KyaniteHQ/threadsift");

  expect(renamed.body.fetch).toBe("ok");
  expect(renamed.body.item.normalizedUrl).toBe("https://github.com/KyaniteHQ/commonplace");
  expect(renamed.body.item.title).toContain("KyaniteHQ/threadsift");
  expect(current.body.item.id).not.toBe(renamed.body.item.id);
});

test("redirects are followed by hand: absolute, relative, up to 20, and a 21st fails", async ({
  request,
}) => {
  test.setTimeout(90_000);
  const run = newRunId();

  const absolute = await postLink(
    request,
    `https://httpbin.org/redirect-to?url=${encodeURIComponent("https://example.com/")}&run=${run}`,
  );

  expect(absolute.body.fetch).toBe("ok");
  expect(absolute.body.item.title).toBe("Example Domain");
  expect(absolute.body.item.normalizedUrl).toContain("httpbin.org/redirect-to");

  const page = `<!doctype html><html><head><title>Relative hop ${run}</title></head></html>`;

  const relative = await postLink(
    request,
    `https://httpbin.org/redirect-to?url=${encodeURIComponent(httpbinPagePath(page))}&run=${run}`,
  );

  expect(relative.body.fetch).toBe("ok");
  expect(relative.body.item.title).toBe(`Relative hop ${run}`);

  const twenty = await postLink(request, `https://httpbin.org/redirect/20?run=${run}`);
  expect(twenty.body.fetch).toBe("no-title");

  const twentyOne = await postLink(request, `https://httpbin.org/redirect/21?run=${run}`);
  expect(twentyOne.status).toBe(201);
  expect(twentyOne.body.fetch).toBe("redirect-limit");
  expect(twentyOne.body.item.title).toBeNull();
});

const REDIRECTOR = "https://httpbin.dev/redirect-to?url=";
const X_POST = "https://x.com/jack/status/20";
const REDDIT_POST = "https://www.reddit.com/r/selfhosted/comments/2a4qo6/x/";

function throughRedirects(target: string, count: number): string {
  let url = target;

  for (let hop = 0; hop < count; hop += 1) {
    url = `${REDIRECTOR}${encodeURIComponent(url)}`;
  }

  return url;
}

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
    expect(saved.body.fetch, target).toBe("redirect-stopped");
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
  expect(twentyFirst.body.fetch).toBe("redirect-limit");
  expect(twentyFirst.body.item.title).toBeNull();

  const twentieth = await postLink(request, `${throughRedirects(X_POST, 20)}&run=${run}`);
  expect(twentieth.body.fetch).toBe("redirect-stopped");
});

test("a short link whose host ends in a dot is followed like the short link", async ({
  request,
}) => {
  const dotted = await postLink(request, "https://is.gd./hK2a1W");

  expect(dotted.body.fetch).toBe("ok");
  expect(dotted.body.item).toMatchObject({
    normalizedUrl: SHORT_LINK_TARGET_NORMALIZED,
    title: "Example Domains",
  });
});
