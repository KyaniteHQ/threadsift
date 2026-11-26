import { request as httpsRequest } from "node:https";

import { errnoCodeOf, errorClassOf } from "../src/core/kernel/failure-log.ts";
import type { PlannedRequest } from "./x-api-probe-plan.ts";

const API_ORIGIN = "https://api.x.com";
const REQUEST_DEADLINE_MS = 30_000;
const KEPT_HEADERS = [
  "content-type",
  "date",
  "x-rate-limit-limit",
  "x-rate-limit-remaining",
  "x-rate-limit-reset",
  "x-transaction-id",
  "x-response-time",
] as const;

export type Answer =
  | {
      readonly kind: "answer";
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly text: string;
    }
  | { readonly kind: "no-answer"; readonly errorClass: string };

type Headers = Readonly<Record<string, string | readonly string[] | undefined>>;

function keptHeaders(headers: Headers): Readonly<Record<string, string>> {
  return Object.fromEntries(
    KEPT_HEADERS.flatMap((name) => {
      const value = headers[name];

      return value === undefined ? [] : [[name, [value].flat().join(", ")]];
    }),
  );
}

function answerOf(url: string, token: string): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const outgoing = httpsRequest(
      url,
      {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
        agent: false,
        signal: AbortSignal.timeout(REQUEST_DEADLINE_MS),
      },
      (response) => {
        const chunks: string[] = [];

        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          resolve({
            kind: "answer",
            status: response.statusCode ?? 0,
            headers: keptHeaders(response.headers),
            text: chunks.join(""),
          });
        });
      },
    );

    outgoing.on("error", reject);
    outgoing.end();
  });
}

export async function sentOnce(request: PlannedRequest, token: string): Promise<Answer> {
  const url = new URL(request.path, API_ORIGIN);

  for (const [key, value] of Object.entries(request.query)) url.searchParams.set(key, value);
  try {
    return await answerOf(url.href, token);
  } catch (error) {
    return { kind: "no-answer", errorClass: `${errorClassOf(error)}/${errnoCodeOf(error)}` };
  }
}
