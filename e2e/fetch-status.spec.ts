import { type APIRequestContext, expect, test } from "@playwright/test";

import { type Instance, launchFresh, newCode } from "./access.ts";
import { postLink } from "./api.ts";
import { fetchStatusCodes } from "./fetch-status-log.ts";
import { ownerOf } from "./files.ts";
import { newRunId } from "./links.ts";

const MISSING_PAGE_STATUS = 404;
const HTTPBIN_STATUS = 503;

let instance: Instance;
let owner: APIRequestContext;

test.beforeAll(async () => {
  const code = newCode();
  instance = launchFresh(code);
  owner = await ownerOf(instance, code, "s".repeat(20));
});

test.afterAll(async () => {
  await owner.dispose();
  instance.stop();
});

function statusCodes(): number[] {
  return fetchStatusCodes(instance.logs());
}

test("a page that answers a non-2xx logs its HTTP status and nothing else about the link, and a page that answers 200 logs none", async () => {
  const run = newRunId();

  const pages = [
    [`https://example.com/missing-${run}`, MISSING_PAGE_STATUS],
    [`https://httpbin.org/status/${HTTPBIN_STATUS}?run=${run}`, HTTPBIN_STATUS],
  ] as const;

  for (const [url] of pages) {
    expect((await postLink(owner, url)).body.item.fetch, url).toBe("status");
  }

  expect((await postLink(owner, `https://example.com/?run=${run}`)).body.item.fetch).toBe("ok");

  await expect
    .poll(() => statusCodes().length, { timeout: 30_000, intervals: [500] })
    .toBe(pages.length);

  expect(statusCodes(), "one line per failed fetch, in paste order").toEqual(
    pages.map(([, httpStatus]) => httpStatus),
  );
  expect(instance.logs()).not.toContain(run);
});
