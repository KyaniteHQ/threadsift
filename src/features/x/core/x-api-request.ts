import { THREAD_CONTENT_BYTES } from "../../../core/contract/limits.ts";
import { REQUEST_DEADLINE_MS } from "../../../core/contract/request-waits.ts";
import { readCapped } from "../../../core/kernel/capped.ts";
import { reportFailure } from "../../../core/kernel/failure-log.ts";
import { REQUEST_HEADERS } from "../../../core/kernel/network.ts";
import { originFetch } from "../../../core/kernel/origin-fetch.ts";
import { type XApiAnswer, answerOf } from "./x-api-answer.ts";
import type { Resources } from "./x-api-plan.ts";
import { resourcesOf } from "./x-api-posts.ts";

const OK = 200;

const NOTHING: Resources = { posts: 0, users: 0 };

export interface XApiCall {
  readonly origin: string;
  readonly token: string;
  readonly path: string;
  readonly signal: AbortSignal;
}

export interface XApiSent {
  readonly answer: XApiAnswer;
  readonly counted: Resources | null;
}

const UNREACHABLE: XApiAnswer = { kind: "refused", reason: "api-unreachable", status: null };

async function sent({ origin, token, path, signal }: Readonly<XApiCall>): Promise<Response | null> {
  try {
    return await originFetch(`${origin}${path}`, {
      headers: { ...REQUEST_HEADERS, accept: "application/json", authorization: `Bearer ${token}` },
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_DEADLINE_MS)]),
    });
  } catch (cause) {
    reportFailure({ event: "x-api-request-failed", fields: {} }, cause);

    return null;
  }
}

export async function xApiGet(call: Readonly<XApiCall>): Promise<XApiSent> {
  const response = await sent(call);

  if (response === null) return { answer: UNREACHABLE, counted: NOTHING };

  const { status } = response;

  try {
    const { bytes, cut } = await readCapped(
      response.body ?? new ReadableStream<Uint8Array>(),
      THREAD_CONTENT_BYTES,
    );
    const text = new TextDecoder().decode(bytes);

    if (cut)
      return { answer: { kind: "refused", reason: "api-answer-refused", status }, counted: null };

    return {
      answer: answerOf({ status, header: (name) => response.headers.get(name), text }, Date.now()),
      counted: status === OK ? resourcesOf(text) : NOTHING,
    };
  } catch (cause) {
    reportFailure({ event: "x-api-answer-unread", fields: { status } }, cause);

    return { answer: UNREACHABLE, counted: null };
  }
}
