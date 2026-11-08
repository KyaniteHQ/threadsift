import { type APIRequestContext, expect, test } from "@playwright/test";

import { listForRun, postLink, postLinkRaw } from "./api.ts";
import { requireGithubBudget } from "./github.ts";
import { newRunId } from "./links.ts";
import { post } from "./thread-fixtures.ts";
import { sendThread } from "./threads.ts";
import { AUTHORED_DIGEST, comment, savedThread, threadJson } from "./threads.ts";

test.describe.configure({ timeout: 240_000 });

const SUBREDDIT = "threadsifttests";

async function sameItem(request: APIRequestContext, first: number, forms: readonly string[]) {
  for (const form of forms) {
    const pasted = await postLinkRaw(request, form);
    expect(pasted.status, form).toBe(200);
    expect(pasted.body.item.id, form).toBe(first);
  }
}

test("every spelling of one X post is one Item, and a reply, a quote post and a profile stay separate", async ({
  request,
}) => {
  const run = newRunId();
  const status = `1${run}`;
  const identity = `https://x.com/i/status/${status}`;

  const forms = [
    `https://x.com/alice/status/${status}`,
    `https://twitter.com/alice/status/${status}`,
    `https://x.com/Alice/status/${status}`,
    `https://x.com/i/web/status/${status}`,
    `https://x.com/i/status/${status}`,
    `https://x.com/alice/status/${status}/photo/1`,
    `https://x.com/alice/status/${status}/quotes?lang=en`,
    `https://www.x.com/bob/status/${status}?s=20&t=abc`,
    `https://mobile.twitter.com/alice/status/${status}`,
    `https://x.com./alice/status/${status}`,
  ];

  const [pastedFirst, ...others] = forms;
  const first = await postLinkRaw(request, pastedFirst ?? "");

  expect(first.status).toBe(201);
  expect(first.body.item).toMatchObject({ normalizedUrl: identity, originalUrl: pastedFirst });
  await sameItem(request, first.body.item.id, others);

  const reply = await postLink(request, `https://x.com/bob/status/2${run}`);
  const quote = await postLink(request, `https://x.com/carol/status/3${run}`);
  const profile = await postLink(request, `https://x.com/alice?run=${run}`);

  const ids = [first.body.item.id, reply.body.item.id, quote.body.item.id, profile.body.item.id];
  expect(new Set(ids).size).toBe(ids.length);
  expect(reply.body.item.normalizedUrl).toBe(`https://x.com/i/status/2${run}`);
  expect(profile.body.item.kind).toBe("link");
  expect(await listForRun(request, run)).toHaveLength(4);
});

test("two first pastes of two spellings of one X post at the same time make one Item", async ({
  request,
}) => {
  const run = newRunId();
  const status = `4${run}`;

  const pastes = await Promise.all([
    postLinkRaw(request, `https://x.com/alice/status/${status}`),
    postLinkRaw(request, `https://twitter.com/Bob/status/${status}/photo/1`),
  ]);

  expect(pastes.map(({ status: code }) => code).toSorted((left, right) => left - right)).toEqual([
    200, 201,
  ]);
  expect(pastes[0]?.body.item.id).toBe(pastes[1]?.body.item.id);
  expect(await listForRun(request, run)).toHaveLength(1);
});

test("every spelling of a GitHub repository root is one Item, and a rename, a deep link and a file path keep their own", async ({
  request,
}) => {
  await requireGithubBudget(16);
  const run = newRunId();
  const name = `ident-${run}`;
  const identity = `https://github.com/kyanitehq/${name}`;

  const forms = [
    `https://github.com/KyaniteHQ/${name}`,
    `https://github.com/kyanitehq/${name}`,
    `https://github.com/KyaniteHQ/${name}/`,
    `https://github.com/KyaniteHQ/${name}.git`,
    `https://github.com/Kyanitehq/${name.toUpperCase()}.git/`,
    `https://www.github.com/KYANITEHQ/${name}`,
  ];

  const [pastedFirst, ...others] = forms;
  const first = await postLinkRaw(request, pastedFirst ?? "");

  expect(first.status).toBe(201);
  expect(first.body.item).toMatchObject({ normalizedUrl: identity, originalUrl: pastedFirst });
  await sameItem(request, first.body.item.id, others);

  const issue = await postLink(request, `https://github.com/KyaniteHQ/${name}/issues/6`);
  const file = await postLink(request, `https://github.com/KyaniteHQ/${name}/blob/Main/README.md`);

  const otherCase = await postLink(
    request,
    `https://github.com/KyaniteHQ/${name}/blob/main/README.md`,
  );

  const another = await postLink(request, `https://github.com/KyaniteHQ/${name}-fork`);

  const ids = [first, issue, file, otherCase, another].map(({ body }) => body.item.id);
  expect(new Set(ids).size).toBe(ids.length);

  expect(
    [issue, file, otherCase].map(({ body }) =>
      body.item.normalizedUrl.replace(/^.*\/\/[^/]+/u, ""),
    ),
  ).toEqual([
    `/KyaniteHQ/${name}/issues/6`,
    `/KyaniteHQ/${name}/blob/Main/README.md`,
    `/KyaniteHQ/${name}/blob/main/README.md`,
  ]);
});

test("two first pastes of two spellings of one GitHub repository at the same time make one Item", async ({
  request,
}) => {
  await requireGithubBudget(4);
  const run = newRunId();
  const name = `race-${run}`;

  const pastes = await Promise.all([
    postLinkRaw(request, `https://github.com/KyaniteHQ/${name}`),
    postLinkRaw(request, `https://github.com/kyanitehq/${name}.git`),
  ]);

  expect(pastes.map(({ status }) => status).toSorted((left, right) => left - right)).toEqual([
    200, 201,
  ]);
  expect(pastes[0]?.body.item.id).toBe(pastes[1]?.body.item.id);
  expect(await listForRun(request, run)).toHaveLength(1);
});

function threadOf(id: string, comments: readonly string[]): string {
  return threadJson(
    post(id, "Authored post text."),
    comments.map((commentId) => comment(commentId, "reader_a", `Comment ${commentId}.`)),
  );
}

test("every spelling of a Reddit post id is one Item", async ({ request }) => {
  const run = newRunId();
  const id = `ab${run}`;
  const upper = id.toUpperCase();
  const content = threadOf(id, []);

  const forms = [
    `https://www.reddit.com/r/${SUBREDDIT}/comments/${id}/title/`,
    `https://www.reddit.com/r/${SUBREDDIT}/comments/${upper}/title/`,
    `https://old.reddit.com/r/${SUBREDDIT}/comments/${upper}/`,
    `https://www.reddit.com/user/someone/comments/${id}/title/`,
    `https://redd.it/${upper}`,
    `https://redd.it/${id}`,
  ];

  const [pastedFirst, ...others] = forms;
  const first = await savedThread(request, { url: pastedFirst ?? "", content });

  expect(first.status).toBe(201);
  expect(first.item).toMatchObject({
    kind: "reddit-post",
    normalizedUrl: `https://reddit.com/r/all/comments/${id}/`,
  });

  for (const url of others) {
    const again = await savedThread(request, { url, content });
    expect(again.status, url).toBe(200);
    expect(again.item.id, url).toBe(first.item.id);
  }

  expect(await listForRun(request, run)).toHaveLength(1);
});

test("a Reddit comment id in either case is one Item, apart from its post and from another comment", async ({
  request,
}) => {
  const run = newRunId();
  const id = `cd${run}`;
  const upper = id.toUpperCase();
  const content = threadOf(id, ["k9xyz12", "m3abc45"]);
  const base = `https://www.reddit.com/r/${SUBREDDIT}/comments`;

  const postItem = await savedThread(request, { url: `${base}/${id}/title/`, content });
  const requested = await savedThread(request, { url: `${base}/${id}/title/k9xyz12/`, content });

  const sameComment = await savedThread(request, {
    url: `${base}/${upper}/title/K9XYZ12/`,
    content,
  });

  const otherComment = await savedThread(request, { url: `${base}/${id}/title/m3abc45/`, content });

  expect(requested.item).toMatchObject({
    kind: "reddit-comment",
    normalizedUrl: `https://reddit.com/r/all/comments/${id}/_/k9xyz12/`,
  });
  expect(sameComment.status).toBe(200);
  expect(sameComment.item.id).toBe(requested.item.id);

  const ids = [postItem.item.id, requested.item.id, otherComment.item.id];
  expect(new Set(ids).size).toBe(ids.length);
  expect(await listForRun(request, run)).toHaveLength(3);
});

test("a Reddit id that is not base-36 is refused as a thread link and kept as a plain link", async ({
  request,
}) => {
  const run = newRunId();
  const id = `ab_${run}`;
  const url = `https://www.reddit.com/r/${SUBREDDIT}/comments/${id}/title/`;

  const refused = await sendThread(request, {
    url,
    content: threadOf(id, []),
    digest: AUTHORED_DIGEST,
  });

  expect(refused.status).toBe(400);

  const plain = await postLinkRaw(request, url);

  expect(plain.body.item).toMatchObject({ kind: "link", source: "other" });
});
