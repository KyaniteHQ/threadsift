import { expect, test } from "@playwright/test";

import { listAll, postLink } from "./api.ts";
import { newRunId } from "./links.ts";

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

  const relative = await postLink(request, `https://httpbin.org/relative-redirect/3?run=${run}`);
  expect(relative.body.fetch).toBe("no-title");

  const twenty = await postLink(request, `https://httpbin.org/redirect/20?run=${run}`);
  expect(twenty.body.fetch).toBe("no-title");

  const twentyOne = await postLink(request, `https://httpbin.org/redirect/21?run=${run}`);
  expect(twentyOne.status).toBe(201);
  expect(twentyOne.body.fetch).toBe("redirect-limit");
  expect(twentyOne.body.item.title).toBeNull();
});
