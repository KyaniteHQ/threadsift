import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { AiSaveResponseSchema, DigestSchema } from "../src/core/ai-contract.ts";
import { catalogKey } from "../src/core/catalog.ts";
import { TopicPageSchema } from "../src/core/topic-overview-contract.ts";
import { topicApiPath } from "../src/core/topic-path.ts";
import {
  ItemDetailResponseSchema,
  ItemResponseSchema,
  SavedItemResponseSchema,
} from "../src/http/schemas.ts";

const PASSWORD = "a live check password of fifteen or more";

const ARTICLE_LINK = "https://www.sqlite.org/whentouse.html";

const REPOSITORY_LINK = "https://github.com/KyaniteHQ/threadsift";

const SECOND_ARTICLE_LINK = "https://www.sqlite.org/wal.html";

const DIGEST_WAIT_MS = 300_000;

const RELATED_WAIT_MS = 300_000;

const TARGET = z.enum(["worker", "container"]).parse(process.env["THREADSIFT_TARGET"]);

const SETUP_CODE = z.string().min(16).parse(process.env["SETUP_CODE"]);

const GITHUB_TOKEN = z.string().optional().parse(process.env["GITHUB_TOKEN"]);

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

async function pasteAndSettle(
  request: APIRequestContext,
  url: string,
  digest?: z.infer<typeof DigestSchema>,
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

async function digestedTopic(
  request: APIRequestContext,
  ids: readonly number[],
): Promise<string | null> {
  const topics = await Promise.all(
    ids.map(async (id) => {
      const answer = await request.get(`/api/items/${String(id)}`);

      return ItemDetailResponseSchema.parse(await answer.json()).item.digestTopic;
    }),
  );

  return topics.find((topic) => topic !== null) ?? null;
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

async function expectCallerDigest(
  request: APIRequestContext,
  id: number,
  sent: z.infer<typeof DigestSchema>,
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
}

async function runWorkerCheck(request: APIRequestContext): Promise<void> {
  await setUpOwner(request);

  await test.step("Paste an article page with a Digest and read it", async () => {
    const id = await pasteAndSettle(request, ARTICLE_LINK, ARTICLE_DIGEST);

    await expectCallerDigest(request, id, ARTICLE_DIGEST);
  });

  await test.step("Paste a GitHub repo with a Digest and read it", async () => {
    const id = await pasteAndSettle(request, REPOSITORY_LINK, REPOSITORY_DIGEST);

    await expectCallerDigest(request, id, REPOSITORY_DIGEST);
  });
}

async function runContainerCheck(request: APIRequestContext): Promise<void> {
  const ids: number[] = [];
  let second = 0;

  await setUpOwner(request);

  await test.step("Paste an article page and read it", async () => {
    ids.push(await pasteAndSettle(request, ARTICLE_LINK));
  });

  await test.step("Paste a GitHub repo and read it", async () => {
    ids.push(await pasteAndSettle(request, REPOSITORY_LINK));
  });

  await test.step("save the Claude Code Provider", async () => {
    const saved = await request.put("/api/settings/ai", {
      data: { provider: "claude-code", model: "" },
    });

    expect(saved.status()).toBe(200);
    expect(AiSaveResponseSchema.parse(await saved.json())).toMatchObject({
      settings: { provider: "claude-code" },
    });
  });

  await test.step("wait for one real Digest", async () => {
    await expect
      .poll(() => digestStates(request, ids), {
        message: "one of the two Items holds a Digest",
        timeout: DIGEST_WAIT_MS,
        intervals: [2000, 5000],
      })
      .toContain("digest");
  });

  await test.step("wait for the Topic overview of that Digest", async () => {
    const topic = await digestedTopic(request, ids);

    expect(topic, "a Digest names a Topic").not.toBeNull();

    await expect
      .poll(() => overviewText(request, topic ?? ""), {
        message: "the Topic page holds a written overview",
        timeout: DIGEST_WAIT_MS,
        intervals: [2000, 5000],
      })
      .not.toBeNull();
  });

  await test.step("Paste a second article on the same subject and wait for its Digest", async () => {
    second = await pasteAndSettle(request, SECOND_ARTICLE_LINK);

    await expect
      .poll(() => digestStates(request, [second]), {
        message: "the second article holds a Digest",
        timeout: DIGEST_WAIT_MS,
        intervals: [2000, 5000],
      })
      .toContain("digest");
  });

  await test.step("write the first article's Digest again and wait for the second article as its Related Item", async () => {
    const [first] = ids;

    await expect
      .poll(() => itemIdle(request, first ?? 0), {
        message: "the first article has no open job",
        timeout: DIGEST_WAIT_MS,
        intervals: [2000, 5000],
      })
      .toBe(true);

    const queued = await request.post(`/api/items/${String(first)}/digest`);

    expect(queued.status()).toBe(200);

    await expect
      .poll(() => relatedOf(request, first ?? 0), {
        message: "the first article lists the second article as a Related Item",
        timeout: RELATED_WAIT_MS,
        intervals: [2000, 5000],
      })
      .toContain(second);
  });
}

test(
  TARGET === "worker"
    ? "real Pastes of an article and a GitHub repo are read, and their caller-sent Digests publish"
    : "real Pastes of an article and a GitHub repo are read, and the Claude Code Provider writes a Digest",
  async ({ request }) => {
    await (TARGET === "worker" ? runWorkerCheck(request) : runContainerCheck(request));
  },
);
