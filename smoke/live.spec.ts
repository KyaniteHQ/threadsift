import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { AiSaveResponseSchema, DigestSchema, VerifyResultSchema } from "../src/core/ai-contract.ts";
import { catalogKey } from "../src/core/catalog-key.ts";
import { TopicPageSchema } from "../src/core/topic-overview-contract.ts";
import { topicApiPath } from "../src/core/topic-path.ts";
import {
  ItemDetailResponseSchema,
  ItemResponseSchema,
  SavedItemResponseSchema,
} from "../src/http/schemas.ts";

const PASSWORD = "a live check password of fifteen or more";

const SECOND_ARTICLE_LINK = "https://www.sqlite.org/wal.html";

const STEP_WAIT_MS = 300_000;

const CLAUDE_MODEL = "claude-haiku-5-5";

const TARGET = z.enum(["worker", "container"]).parse(process.env["THREADSIFT_TARGET"]);

const SETUP_CODE = z.string().min(16).parse(process.env["SETUP_CODE"]);

const GITHUB_TOKEN = z.string().optional().parse(process.env["GITHUB_TOKEN"]);

type Digest = z.infer<typeof DigestSchema>;

const ARTICLE_DIGEST = DigestSchema.parse({
  title: "When to use SQLite",
  topic: "SQLite",
  tags: ["database", "embedded"],
  summary:
    "SQLite suits devices, websites and files that applications share.\nIt gives way to client-server databases under heavy concurrent writes.",
  keyPoints: ["Embedded devices and application files are a good fit"],
  keptComments: [],
});

const REPOSITORY_DIGEST = DigestSchema.parse({
  title: "Threadsift, a reading library",
  topic: "Reading tools",
  tags: ["library", "self-hosted"],
  summary:
    "Threadsift keeps the useful parts of saved links and grows a small wiki of the library.\nThe owner reads everything on one page.",
  keyPoints: ["One owner runs one Instance"],
  keptComments: [],
});

const ARTICLE = {
  label: "an article page",
  link: "https://www.sqlite.org/whentouse.html",
  digest: ARTICLE_DIGEST,
};

const REPOSITORY = {
  label: "a GitHub repo",
  link: "https://github.com/KyaniteHQ/threadsift",
  digest: REPOSITORY_DIGEST,
};

async function pasteAndSettle(
  request: APIRequestContext,
  url: string,
  digest?: Digest,
): Promise<number> {
  const saved = await request.post("/api/items", { data: { url, digest } });

  expect(saved.status(), `Paste of ${url}`).toBe(201);

  const { item } = SavedItemResponseSchema.parse(await saved.json());

  await expect
    .poll(
      async () => {
        const status = await request.get(`/api/items/${String(item.id)}/status`);

        return ItemResponseSchema.parse(await status.json()).item.status;
      },
      { message: `${url} leaves processing`, timeout: 60_000 },
    )
    .not.toBe("processing");

  const settled = await request.get(`/api/items/${String(item.id)}/status`);
  const { fetch: result, status } = ItemResponseSchema.parse(await settled.json()).item;

  expect({ status, fetch: result }, `${url} is read`).toEqual({ status: "ready", fetch: "ok" });

  return item.id;
}

function digestStates(request: APIRequestContext, ids: readonly number[]) {
  return Promise.all(
    ids.map(async (id) => {
      const answer = await request.get(`/api/items/${String(id)}`);
      const { item } = ItemDetailResponseSchema.parse(await answer.json());

      return item.digest === null ? item.digestOutcome : "digest";
    }),
  );
}

async function digestedTopic(request: APIRequestContext, ids: readonly number[]): Promise<string> {
  const topics = await Promise.all(
    ids.map(async (id) => {
      const answer = await request.get(`/api/items/${String(id)}`);

      return ItemDetailResponseSchema.parse(await answer.json()).item.digestTopic;
    }),
  );

  const topic = topics.find((name) => name !== null);

  if (topic === undefined || topic === null) throw new Error("no Item holds a Digest with a Topic");

  return topic;
}

async function overviewText(request: APIRequestContext, topic: string): Promise<string | null> {
  const answer = await request.get(topicApiPath(catalogKey(topic)));

  expect(answer.status(), `the Topic page of ${topic}`).toBe(200);

  return TopicPageSchema.parse(await answer.json()).overview.text;
}

async function relatedOf(request: APIRequestContext, id: number): Promise<readonly number[]> {
  const answer = await request.get(`/api/items/${String(id)}`);

  return ItemDetailResponseSchema.parse(await answer.json()).item.related.map((entry) => entry.id);
}

async function itemIdle(request: APIRequestContext, id: number): Promise<boolean> {
  const status = await request.get(`/api/items/${String(id)}/status`);

  return ItemResponseSchema.parse(await status.json()).item.status !== "processing";
}

async function setUpOwner(request: APIRequestContext): Promise<void> {
  await test.step("set up the owner", async () => {
    const created = await request.post("/api/setup", {
      data: { code: SETUP_CODE, password: PASSWORD },
    });

    expect(created.status()).toBe(204);
  });

  await test.step("save the GitHub token so the anonymous rate limit does not apply", async () => {
    if (GITHUB_TOKEN === undefined || GITHUB_TOKEN === "") return;

    const saved = await request.put("/api/settings/github", { data: { token: GITHUB_TOKEN } });

    expect(await saved.json()).toEqual({ token: "saved", secretReady: true });
  });
}

function pasteStep(
  request: APIRequestContext,
  { label, link }: { readonly label: string; readonly link: string },
  digest?: Digest,
): Promise<number> {
  return test.step(`Paste ${label} and read it`, () => pasteAndSettle(request, link, digest));
}

async function expectCallerDigest(
  request: APIRequestContext,
  id: number,
  sent: Digest,
): Promise<void> {
  const answer = await request.get(`/api/items/${String(id)}`);
  const { item } = ItemDetailResponseSchema.parse(await answer.json());

  expect(
    { topic: item.digestTopic, digest: item.digest },
    "the caller-sent Digest published with its Topic and Tags",
  ).toEqual({
    topic: sent.topic,
    digest: { summary: sent.summary, keyPoints: sent.keyPoints, tags: sent.tags },
  });

  const page = await request.get(topicApiPath(catalogKey(sent.topic)));

  expect(page.status(), `the Topic page of ${sent.topic}`).toBe(200);
  expect(
    TopicPageSchema.parse(await page.json()).items.map((entry) => entry.id),
    `the Topic page of ${sent.topic} lists the Item`,
  ).toContain(id);
}

async function saveAndVerifyClaudeCode(request: APIRequestContext): Promise<void> {
  await test.step("save the Claude Code Provider", async () => {
    const saved = await request.put("/api/settings/ai", {
      data: { provider: "claude-code", model: CLAUDE_MODEL },
    });

    expect(saved.status()).toBe(200);
    expect(AiSaveResponseSchema.parse(await saved.json())).toMatchObject({
      settings: { provider: "claude-code", model: CLAUDE_MODEL },
    });
  });

  await test.step("Verify the Provider with one real Digest", async () => {
    const verified = await request.post("/api/settings/ai/verify", { data: {} });

    expect(VerifyResultSchema.parse(await verified.json())).toMatchObject({ kind: "done" });
  });
}

async function waitForWikiWork(
  request: APIRequestContext,
  ids: readonly [number, number],
): Promise<void> {
  const [first] = ids;

  await test.step("wait for one real Digest", async () => {
    await expect
      .poll(() => digestStates(request, ids), {
        message: "one of the two Items holds a Digest",
        timeout: STEP_WAIT_MS,
        intervals: [2000, 5000],
      })
      .toContain("digest");
  });

  await test.step("wait for the Topic overview of that Digest", async () => {
    const topic = await digestedTopic(request, ids);

    await expect
      .poll(() => overviewText(request, topic), {
        message: "the Topic page holds a written overview",
        timeout: STEP_WAIT_MS,
        intervals: [2000, 5000],
      })
      .not.toBeNull();
  });

  const second =
    await test.step("Paste a second article on the same subject and wait for its Digest", async () => {
      const id = await pasteAndSettle(request, SECOND_ARTICLE_LINK);

      await expect
        .poll(() => digestStates(request, [id]), {
          message: "the second article holds a Digest",
          timeout: STEP_WAIT_MS,
          intervals: [2000, 5000],
        })
        .toContain("digest");

      return id;
    });

  await test.step("write the first article's Digest again and wait for the second article as its Related Item", async () => {
    await expect
      .poll(() => itemIdle(request, first), {
        message: "the first article has no open job",
        timeout: STEP_WAIT_MS,
        intervals: [2000, 5000],
      })
      .toBe(true);

    const queued = await request.post(`/api/items/${String(first)}/digest`, { data: {} });

    expect(queued.status()).toBe(200);

    await expect
      .poll(() => relatedOf(request, first), {
        message: "the first article lists the second article as a Related Item",
        timeout: STEP_WAIT_MS,
        intervals: [2000, 5000],
      })
      .toContain(second);
  });
}

if (TARGET === "worker") {
  test("real Pastes of an article and a GitHub repo are read, and their caller-sent Digests publish", async ({
    request,
  }) => {
    await setUpOwner(request);

    await Promise.all(
      [ARTICLE, REPOSITORY].map(async (paste) => {
        const id = await pasteStep(request, paste, paste.digest);

        await expectCallerDigest(request, id, paste.digest);
      }),
    );
  });
} else {
  test("real Pastes of an article and a GitHub repo are read, and the Claude Code Provider writes a Digest", async ({
    request,
  }) => {
    await setUpOwner(request);

    const ids = await Promise.all([pasteStep(request, ARTICLE), pasteStep(request, REPOSITORY)]);

    await saveAndVerifyClaudeCode(request);
    await waitForWikiWork(request, ids);
  });
}
