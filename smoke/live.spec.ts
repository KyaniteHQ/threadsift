import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { AiSaveResponseSchema } from "../src/core/ai-contract.ts";
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

const DIGEST_WAIT_MS = 300_000;

const SCHEDULED_ROUTE = "/cdn-cgi/local/scheduled";

const TARGET = z.enum(["worker", "container"]).parse(process.env["THREADSIFT_TARGET"]);

const SETUP_CODE = z.string().min(16).parse(process.env["SETUP_CODE"]);

const GITHUB_TOKEN = z.string().optional().parse(process.env["GITHUB_TOKEN"]);

function requiredEnv(name: string, hint: string): string {
  const value = process.env[name];

  if (value === undefined || value === "") throw new Error(`${name} is empty: ${hint}`);

  return value;
}

async function pasteAndSettle(request: APIRequestContext, url: string): Promise<number> {
  const saved = await request.post("/api/items", { data: { url } });

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

async function fireScheduledHandler(request: APIRequestContext): Promise<void> {
  if (TARGET !== "worker") return;

  const fired = await request.get(SCHEDULED_ROUTE);

  expect(fired.status(), "the scheduled handler runs").toBe(200);
}

test("real Pastes of an article and a GitHub repo are read, and the OpenRouter Provider writes a Digest", async ({
  request,
}) => {
  const ids: number[] = [];

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

  await test.step("Paste an article page and read it", async () => {
    ids.push(await pasteAndSettle(request, ARTICLE_LINK));
  });

  await test.step("Paste a GitHub repo and read it", async () => {
    ids.push(await pasteAndSettle(request, REPOSITORY_LINK));
  });

  await test.step("save the OpenRouter Provider", async () => {
    const key = requiredEnv(
      "OPENROUTER_API_KEY",
      "add it as a secret of the post-merge environment",
    );

    const model = requiredEnv("OPENROUTER_MODEL", "set it to one :free OpenRouter model");

    const saved = await request.put("/api/settings/ai", {
      data: { provider: "openrouter", model, key },
    });

    expect(saved.status()).toBe(200);
    expect(AiSaveResponseSchema.parse(await saved.json())).toMatchObject({
      settings: { provider: "openrouter", model, keySet: true },
    });
  });

  await test.step("wait for one real Digest", async () => {
    await expect
      .poll(
        async () => {
          await fireScheduledHandler(request);

          return digestStates(request, ids);
        },
        {
          message: "one of the two Items holds a Digest",
          timeout: DIGEST_WAIT_MS,
          intervals: [2000, 5000],
        },
      )
      .toContain("digest");
  });

  await test.step("wait for the Topic overview of that Digest", async () => {
    const topic = await digestedTopic(request, ids);

    expect(topic, "a Digest names a Topic").not.toBeNull();

    await expect
      .poll(
        async () => {
          await fireScheduledHandler(request);

          return overviewText(request, topic ?? "");
        },
        {
          message: "the Topic page holds a written overview",
          timeout: DIGEST_WAIT_MS,
          intervals: [2000, 5000],
        },
      )
      .not.toBeNull();
  });
});
