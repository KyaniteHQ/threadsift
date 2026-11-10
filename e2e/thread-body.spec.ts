import { expect, test } from "@playwright/test";

import { fitThreadBody } from "../extension/lib/thread-body.ts";
import { post, postUrl, run } from "./thread-fixtures.ts";
import { MIB, comment, more, threadJson } from "./threads.ts";

test.describe.configure({ timeout: 300_000 });

const REQUEST_CAP_BYTES = 8 * MIB;
const FILL_FIELD_BYTES = 12;
const QUOTES_PER_BODY = 700_000;
const QUOTE_BYTES = 4;
const HIDDEN = ["p1", "p2", "p3"] as const;

const POST_ID = `tb${run}`;
const URL = postUrl(POST_ID);
const THREAD = post(POST_ID, "A post whose hidden replies fill the request.");

const MAIN = threadJson(THREAD, [
  comment("c1", "reader_a", "The first comment explains the setup in two sentences.", [
    more(...HIDDEN),
  ]),
]);

function answerFor(id: string, body: string): string {
  return threadJson(THREAD, [comment(id, "reader_b", body)], "t1_c1");
}

function bytesOf(content: readonly string[], fill = false): number {
  const body = fill ? { url: URL, content, fill: true } : { url: URL, content };

  return Buffer.byteLength(JSON.stringify(body));
}

function answersFillingTheCap(): readonly [string, ...string[]] {
  const full = '"'.repeat(QUOTES_PER_BODY);
  const first = answerFor("p1", full);
  const second = answerFor("p2", full);
  const room = REQUEST_CAP_BYTES - bytesOf([MAIN, first, second, answerFor("p3", "")]);
  const quotes = Math.floor(room / QUOTE_BYTES);
  const tail = answerFor("p3", '"'.repeat(quotes));
  const padding = REQUEST_CAP_BYTES - bytesOf([MAIN, first, second, tail]);

  return [MAIN, first, second, answerFor("p3", '"'.repeat(quotes) + "a".repeat(padding))];
}

test("the body that carries fill is fitted to the request cap as it will be sent, and the server accepts it", async ({
  request,
}) => {
  const answers = answersFillingTheCap();

  expect(bytesOf(answers), "the answers alone fill the cap").toBe(REQUEST_CAP_BYTES);
  expect(bytesOf(answers, true), "the same answers with fill").toBe(
    REQUEST_CAP_BYTES + FILL_FIELD_BYTES,
  );

  const plain = fitThreadBody(URL, answers, false);

  expect(plain?.content).toEqual(answers);

  const filled = fitThreadBody(URL, answers, true);

  expect(filled).toMatchObject({ url: URL, fill: true });
  expect(filled?.content).toEqual(answers.slice(0, 3));
  expect(Buffer.byteLength(JSON.stringify(filled))).toBeLessThanOrEqual(REQUEST_CAP_BYTES);

  const waiting = await request.post("/api/items", {
    data: { url: URL, page: { markdown: "Only a few words.", title: "A shared post" } },
  });

  expect(waiting.status()).toBe(201);

  const over = await request.post("/api/items", {
    data: { url: URL, content: answers, fill: true },
  });

  expect(over.status(), "the unfitted body with fill").toBe(413);

  const sent = await request.post("/api/items", { data: filled });

  expect(sent.status(), await sent.text()).toBe(200);
});
