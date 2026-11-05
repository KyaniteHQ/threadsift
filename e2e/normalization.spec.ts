import { setTimeout as sleep } from "node:timers/promises";

import { type APIRequestContext, expect, test } from "@playwright/test";

import { postLink } from "./api.ts";
import { newRunId, rowOf } from "./links.ts";

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

  const withCredentials = await postLink(request, `https://user:secret@example.com/${run}/page`);
  expect(withCredentials.status).toBe(200);
  expect(withCredentials.body.item.id).toBe(first.body.item.id);
  expect(withCredentials.body.item.normalizedUrl).not.toContain("secret");
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

  const posted = await Promise.all(links.map((url) => postLink(request, url)));

  expect(posted.map(({ status }) => status)).toEqual(links.map(() => 201));
  expect(new Set(posted.map(({ body }) => body.item.id)).size).toBe(links.length);
});

test("x.com and twitter.com drop their share parameters but keep other hosts' s and t", async ({
  request,
}) => {
  const run = newRunId();
  const x = await postLink(request, `https://x.com/someone/status/${run}1?s=20&t=abc&lang=en`);
  const other = await postLink(request, `https://example.com/${run}?s=1&t=2`);
  expect(x.body.item.normalizedUrl).toBe(`https://x.com/someone/status/${run}1?lang=en`);
  expect(other.body.item.normalizedUrl).toBe(`https://example.com/${run}?s=1&t=2`);

  const mobile = await postLink(
    request,
    `https://mobile.x.com/someone/status/${run}1?s=20&lang=en`,
  );

  expect(mobile.body.item.id).toBe(x.body.item.id);
});

const SOURCE_LABELS = { reddit: "Reddit", x: "X", github: "GitHub", other: "Other" } as const;

function linkCases(run: string) {
  return [
    [
      `https://www.reddit.com/r/typescript/comments/r${run}a/title/`,
      "reddit-post",
      "reddit",
      "r/typescript",
    ],
    [
      `https://www.reddit.com/r/typescript/comments/r${run}b/title/k9xyz12/`,
      "reddit-comment",
      "reddit",
      "r/typescript",
    ],
    [
      `https://www.reddit.com/user/someone/comments/r${run}c/title/`,
      "reddit-post",
      "reddit",
      "u/someone",
    ],
    [`https://www.reddit.com/r/typescript/?run=${run}`, "link", "other", "reddit.com"],
    [`https://x.com/someone/status/${run}1`, "x-post", "x", "@someone"],
    [`https://twitter.com/someone/status/${run}2`, "x-post", "x", "@someone"],
    [`https://x.com/someone?run=${run}`, "link", "other", "x.com"],
    [`https://github.com/KyaniteHQ/repo-${run}`, "github-repo", "github", `KyaniteHQ/repo-${run}`],
    [
      `https://github.com/KyaniteHQ/repo-${run}/pull/9`,
      "github-repo",
      "github",
      `KyaniteHQ/repo-${run}`,
    ],
    [`https://github.com/topics/typescript?run=${run}`, "link", "other", "github.com"],
    [`https://blog.example.com/${run}/an-article`, "link", "other", "blog.example.com"],
    [`https://github.com/user-attachments/assets/${run}`, "link", "other", "github.com"],
    [`https://github.com/resources/articles?run=${run}`, "link", "other", "github.com"],
    [`https://mobile.twitter.com/someone/status/${run}3`, "x-post", "x", "@someone"],
  ] as const;
}

async function postTogether(request: APIRequestContext, cases: ReturnType<typeof linkCases>) {
  const reddit = cases.filter(([, , source]) => source === "reddit");
  const others = cases.filter(([, , source]) => source !== "reddit");
  const pending = Promise.all(others.map(([url]) => postLink(request, url)));
  const spaced = [];

  for (const [url] of reddit) {
    spaced.push(await postLink(request, url));
  }

  const together = await pending;

  return {
    ordered: [...reddit, ...others],
    saved: [...spaced, ...together].map(({ body }) => body.item),
  };
}

test("each link shape gets its kind and Source, and its row says where it is from", async ({
  page,
  request,
}) => {
  const { ordered, saved } = await postTogether(request, linkCases(newRunId()));

  expect(saved.map((item) => [item.kind, item.source])).toEqual(
    ordered.map(([, kind, source]) => [kind, source]),
  );

  await page.goto("/");

  for (const [index, item] of saved.entries()) {
    const [, , source, where] = ordered[index] ?? ["", "", "other", ""];
    const meta = rowOf(page, item.id).locator(".it-meta > span");
    await expect(meta.nth(0)).toHaveText(SOURCE_LABELS[source]);
    await expect(meta.nth(1)).toHaveText(where);
  }
});
