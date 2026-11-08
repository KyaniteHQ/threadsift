import type { z } from "zod";

import {
  type FetchPolicy,
  NO_HEADERS,
  SMALL_BODY_BYTES,
  guardedFetch,
  type GuardOutcome,
} from "./fetch-guard.ts";
import { isRedditOrXLink } from "./links.ts";
import type { Network, RequestHeaders } from "./ports.ts";

const API_ORIGIN = "https://api.github.com";

export const UNAUTHORIZED = 401;

const API_HEADERS: RequestHeaders = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
};

function headersFor(token: string | null): (url: string) => RequestHeaders {
  const sent = token === null ? API_HEADERS : { ...API_HEADERS, authorization: `Bearer ${token}` };

  return (url) => (new URL(url).origin === API_ORIGIN ? sent : NO_HEADERS);
}

export function apiPolicy(token: string | null): FetchPolicy {
  return {
    stopAt: isRedditOrXLink,
    followMetaRefresh: () => false,
    readsBody: () => true,
    headers: headersFor(token),
    htmlMaxBytes: SMALL_BODY_BYTES,
    dataMaxBytes: SMALL_BODY_BYTES,
  };
}

export function getApi(
  network: Network,
  path: string,
  policy: Readonly<FetchPolicy>,
  deadline: AbortSignal,
): Promise<GuardOutcome> {
  return guardedFetch(network, `${API_ORIGIN}${path}`, policy, deadline);
}

export function parsedJson<Schema extends z.ZodType>(
  schema: Schema,
  text: string,
): z.output<Schema> | null {
  try {
    const result = schema.safeParse(JSON.parse(text));

    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
