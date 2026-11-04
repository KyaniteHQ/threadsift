import { setTimeout as sleep } from "node:timers/promises";

import { expect, test } from "@playwright/test";

import { listAll, postLink } from "./api.ts";
import { newRunId } from "./links.ts";

test("one link pasted a second way is one Item with the same id and saved date", async ({
  request,
}) => {
  const run = newRunId();
  const first = await postLink(request, `https://example.com/${run}/page`);
  await sleep(20);

  const second = await postLink(
    request,
    `https://WWW.Example.COM/${run}/page?utm_source=a&fbclid=b#fragment`,
  );

  expect(first.status).toBe(201);
  expect(second.status).toBe(200);
  expect(second.body.item.id).toBe(first.body.item.id);
  expect(second.body.item.savedAt).toBe(first.body.item.savedAt);
  expect(second.body.url).toBe(first.body.url);
  expect(first.body.url).toContain(String(first.body.item.id));
});

test("links that differ in a kept query parameter or in path case stay separate", async ({
  request,
}) => {
  const run = newRunId();

  const links = [
    `https://example.com/${run}/page?id=alpha`,
    `https://example.com/${run}/page?id=beta`,
    `https://github.com/Owner/Repo-${run}`,
    `https://github.com/owner/repo-${run}`,
  ];

  const ids = new Set<number>();

  for (const url of links) {
    const { status, body } = await postLink(request, url);
    expect(status).toBe(201);
    ids.add(body.item.id);
  }

  expect(ids.size).toBe(links.length);
});

test("x.com and twitter.com drop their share parameters but keep other hosts' s and t", async ({
  request,
}) => {
  const run = newRunId();
  const x = await postLink(request, `https://x.com/someone/status/${run}1?s=20&t=abc&lang=en`);
  const other = await postLink(request, `https://example.com/${run}?s=1&t=2`);
  expect(x.body.item.normalizedUrl).toBe(`https://x.com/someone/status/${run}1?lang=en`);
  expect(other.body.item.normalizedUrl).toBe(`https://example.com/${run}?s=1&t=2`);
});

test("each link shape gets its kind and Source", async ({ request }) => {
  const run = newRunId();

  const cases = [
    [`https://www.reddit.com/r/typescript/comments/r${run}/title/`, "reddit-post", "reddit"],
    [
      `https://www.reddit.com/r/typescript/comments/r${run}/title/k9xyz12/`,
      "reddit-comment",
      "reddit",
    ],
    [`https://www.reddit.com/r/typescript/?run=${run}`, "link", "other"],
    [`https://x.com/someone/status/${run}1`, "x-post", "x"],
    [`https://twitter.com/someone/status/${run}2`, "x-post", "x"],
    [`https://x.com/someone?run=${run}`, "link", "other"],
    [`https://github.com/KyaniteHQ/repo-${run}`, "github-repo", "github"],
    [`https://github.com/KyaniteHQ/repo-${run}/pull/9`, "github-repo", "github"],
    [`https://github.com/topics/typescript?run=${run}`, "link", "other"],
    [`https://blog.example.com/${run}/an-article`, "link", "other"],
  ] as const;

  const saved = [];

  for (const [url] of cases) {
    saved.push((await postLink(request, url)).body.item);
  }

  expect(saved.map((item) => [item.kind, item.source])).toEqual(
    cases.map(([, kind, source]) => [kind, source]),
  );
  expect((await listAll(request)).length).toBeGreaterThanOrEqual(cases.length);
});
