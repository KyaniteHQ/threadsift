import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { type APIRequestContext, expect, test } from "@playwright/test";
import { parseHTML } from "linkedom";
import { z } from "zod";

import { ItemDetailResponseSchema, SavedItemResponseSchema } from "../src/http/schemas.ts";

const RELAY = "https://webhook.site";

const OEMBED = "https://publish.x.com/oembed";

const CALL_MS = 15_000;

const STEP_WAIT_MS = 120_000;

const IDS = z
  .object({ post: z.string(), replies: z.array(z.string()) })
  .parse(JSON.parse(readFileSync(join(import.meta.dirname, "x-live-thread.json"), "utf8")));

const WEBHOOK = z.object({ taskId: z.number().int(), callbackToken: z.string() });

const TOKEN = z.object({ uuid: z.string() });

const RELAYED = z.object({ data: z.array(z.object({ content: z.string() })) });

const OEMBED_ANSWER = z.object({ author_url: z.string(), html: z.string() });

async function relayed(what: string, call: () => Promise<Response>): Promise<Response> {
  try {
    return await call();
  } catch (error) {
    throw new Error(`the relay ${RELAY} did not answer while ${what}`, { cause: error });
  }
}

async function relayToken(): Promise<string> {
  const created = await relayed("creating an address", () =>
    fetch(`${RELAY}/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(CALL_MS),
    }),
  );

  return TOKEN.parse(await created.json()).uuid;
}

async function sentWebhook(token: string): Promise<z.infer<typeof WEBHOOK> | null> {
  const answer = await relayed("reading the sent task", () =>
    fetch(`${RELAY}/token/${token}/requests`, { signal: AbortSignal.timeout(CALL_MS) }),
  );

  if (!answer.ok) return null;

  const [sent] = RELAYED.parse(await answer.json()).data;

  return sent === undefined ? null : WEBHOOK.parse(JSON.parse(sent.content));
}

async function shownPost(id: string) {
  const answer = await fetch(
    `${OEMBED}?url=${encodeURIComponent(`https://x.com/i/status/${id}`)}&omit_script=1`,
    {
      signal: AbortSignal.timeout(CALL_MS),
    },
  );

  if (!answer.ok) return null;

  const { author_url: authorUrl, html } = OEMBED_ANSWER.parse(await answer.json());

  const paragraph = parseHTML(
    html.replaceAll("<br>", "\n").replaceAll("<a ", " <a ").replaceAll("</a>", "</a> "),
  ).document.querySelector("blockquote p");

  const author = new URL(authorUrl).pathname.split("/").find((part) => part !== "");

  return paragraph === null || author === undefined
    ? null
    : { id, author, text: (paragraph.textContent ?? "").trim() };
}

async function shownThread(): Promise<string> {
  const root = await shownPost(IDS.post);

  if (root === null) throw new Error(`X does not show the post ${IDS.post} of the live check`);

  const replies = (await Promise.all(IDS.replies.map((id) => shownPost(id)))).flatMap((reply) =>
    reply === null ? [] : [{ ...reply, parentId: IDS.post, postedAt: null, likes: null }],
  );

  return JSON.stringify({
    post: { ...root, postedAt: null, replies: replies.length },
    replies,
  });
}

async function signedIn(
  request: APIRequestContext,
  { password, setupCode }: Readonly<{ password: string; setupCode: string }>,
): Promise<void> {
  const login = await request.post("/api/login", { data: { password } });

  if (login.status() === 204) return;

  const created = await request.post("/api/setup", { data: { code: setupCode, password } });

  expect(created.status(), "the owner of the live check").toBe(204);
}

async function savedThroughIntake(request: APIRequestContext): Promise<void> {
  const content = await shownThread();
  const relay = await relayToken();

  const saved = await request.put("/api/settings/grok-bot", {
    data: { webhookUrl: `${RELAY}/${relay}`, key: randomUUID() },
  });

  expect(saved.status(), "the Grok Bot settings save").toBe(200);

  const pasted = await request.post("/api/items", {
    data: { url: `https://x.com/i/status/${IDS.post}` },
  });

  expect(pasted.status(), "the Paste of the X link").toBe(201);

  const { item } = SavedItemResponseSchema.parse(await pasted.json());

  await expect
    .poll(async () => (await sentWebhook(relay)) !== null, {
      message: `Threadsift sends the task to the relay ${RELAY}`,
      timeout: STEP_WAIT_MS,
      intervals: [3000, 5000],
    })
    .toBe(true);

  const webhook = await sentWebhook(relay);

  if (webhook === null) throw new Error(`the relay ${RELAY} lost the sent task`);

  const answered = await request.post(`/api/ai-tasks/${String(webhook.taskId)}/intake`, {
    headers: { authorization: `Bearer ${webhook.callbackToken}` },
    data: { content },
  });

  expect(answered.status(), "the answer of the Grok Bot").toBe(204);

  await expect
    .poll(
      async () => {
        const detail = await request.get(`/api/items/${String(item.id)}`);
        const { item: read } = ItemDetailResponseSchema.parse(await detail.json());

        return read.status === "ready" && read.comments.received >= 1;
      },
      {
        message: "the thread is shown after X confirms its posts",
        timeout: STEP_WAIT_MS,
        intervals: [2000, 5000],
      },
    )
    .toBe(true);
}

export function savedXThreadThroughIntake(
  request: APIRequestContext,
  owner: Readonly<{ password: string; setupCode: string }>,
): Promise<void> {
  return test.step("save a real public X thread through the Grok Bot intake", async () => {
    await signedIn(request, owner);
    await savedThroughIntake(request);
  });
}
