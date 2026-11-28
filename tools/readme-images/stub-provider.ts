import { createServer } from "node:http";

import { z } from "zod";

import { onFreePort } from "./loopback.ts";
import { OVERVIEWS } from "./stub-overviews.ts";

const RELATED_PICKS = 2;

const REASON_MAX = 140;

const CITES_MAX = 3;

const OutputSchema = z.object({
  properties: z.record(z.string(), z.object({ type: z.string() })),
});

const ChatRequestSchema = z.object({
  messages: z.array(z.object({ content: z.string() })).min(1),
  response_format: z.object({ json_schema: z.object({ schema: OutputSchema }) }),
});

const OverviewInputSchema = z.object({
  topic: z.string(),
  overview: z.json(),
  added: z.array(z.object({ id: z.number(), title: z.string() })),
});

const RelatedInputSchema = z.object({
  source: z.object({ topic: z.string() }),
  candidates: z.array(z.object({ id: z.number(), topic: z.string(), summary: z.string() })),
});

export interface StubProvider {
  readonly baseUrl: string;
  readonly stop: () => Promise<void>;
}

const titles = new Map<number, string>();

function idsAbout(about: readonly string[]): readonly number[] {
  const ids: number[] = [];

  for (const [id, title] of titles) {
    if (about.some((word) => title.includes(word))) ids.push(id);
  }

  return ids.slice(0, CITES_MAX);
}

function overviewAnswer(input: string): string {
  const parsed = OverviewInputSchema.parse(JSON.parse(input));

  for (const { id, title } of parsed.added) titles.set(id, title);
  const cited = [...JSON.stringify(parsed.overview).matchAll(/\[(\d+)\]/gu)].map(([, id]) =>
    Number(id),
  );
  const known = [...new Set([...parsed.added.map(({ id }) => id), ...cited])];
  const lines = (OVERVIEWS.get(parsed.topic) ?? []).map(({ text, about }) => {
    const matching = idsAbout(about);

    return { text, items: matching.length > 0 ? matching : [known[0] ?? 1] };
  });

  return JSON.stringify({ lines, unchanged: false });
}

function reasonOf(topic: string, summary: string): string {
  const [first = ""] = summary.split("\n");
  const plain = first.replaceAll(/["[\]{}]/gu, "");

  return `Also on ${topic.toLowerCase()}: ${plain}`.slice(0, REASON_MAX);
}

function relatedAnswer(input: string): string {
  const parsed = RelatedInputSchema.parse(JSON.parse(input));
  const ranked = parsed.candidates.toSorted(
    (a, b) => Number(b.topic === parsed.source.topic) - Number(a.topic === parsed.source.topic),
  );

  const picks = ranked
    .slice(0, RELATED_PICKS)
    .map(({ id, topic, summary }) => ({ item: id, reason: reasonOf(topic, summary) }));

  return JSON.stringify({ picks });
}

function nothing(properties: Readonly<Record<string, Readonly<{ type: string }>>>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(properties).map(([name, { type }]) => [name, type === "array" ? [] : false]),
    ),
  );
}

function answerFor(
  input: string,
  properties: Readonly<Record<string, Readonly<{ type: string }>>>,
): string {
  if ("lines" in properties) return overviewAnswer(input);

  return "picks" in properties ? relatedAnswer(input) : nothing(properties);
}

function answerTo(raw: string): string {
  const request = ChatRequestSchema.parse(JSON.parse(raw));
  const input = request.messages.at(-1)?.content ?? "";
  const { properties } = request.response_format.json_schema.schema;
  const answer = answerFor(input, properties);

  return JSON.stringify({
    id: "stub",
    object: "chat.completion",
    created: 1,
    model: "stub",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: answer },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
}

export async function startStubProvider(): Promise<StubProvider> {
  const { server, port } = await onFreePort(() =>
    createServer((request, response) => {
      let raw = "";

      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        raw += chunk;
      });
      request.on("end", () => {
        try {
          const answer = answerTo(raw);

          response.writeHead(200, { "content-type": "application/json" });
          response.end(answer);
        } catch (error) {
          process.stderr.write(`${String(error).slice(0, 300)}\n${raw.slice(0, 600)}\n`);
          response.writeHead(500);
          response.end();
        }
      });
    }),
  );

  return {
    baseUrl: `http://127.0.0.1:${String(port)}/v1`,
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      }),
  };
}
