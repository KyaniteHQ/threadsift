import { z } from "zod";

import { THREAD_CONTENT_BYTES } from "../../../core/contract/limits.ts";
import { REQUEST_DEADLINE_MS } from "../../../core/contract/request-waits.ts";
import { type Capped, readCapped } from "../../../core/kernel/capped.ts";
import { errnoCodeOf, reportFailure } from "../../../core/kernel/failure-log.ts";
import { REQUEST_HEADERS } from "../../../core/kernel/network.ts";
import { originFetch } from "../../../core/kernel/origin-fetch.ts";
import { type XApiAnswer, answerOf } from "./x-api-answer.ts";
const EMPTY: Capped = { bytes: new Uint8Array(), cut: false };

const NOT_CONNECTED = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]);

const CausedSchema = z.looseObject({ cause: z.unknown() });

export interface XApiCall {
  readonly origin: string;
  readonly token: string;
  readonly path: string;
  readonly signal: AbortSignal;
}

export type Delivery =
  | { readonly kind: "not-sent" }
  | { readonly kind: "unknown" }
  | { readonly kind: "answered"; readonly status: number; readonly text: string };

export interface XApiSent {
  readonly answer: XApiAnswer;
  readonly delivery: Delivery;
}

const UNREACHABLE: XApiAnswer = { kind: "refused", reason: "api-unreachable", status: null };

async function sent({
  origin,
  token,
  path,
  signal,
}: Readonly<XApiCall>): Promise<Response | "not-sent" | "unknown"> {
  if (signal.aborted) return "not-sent";

  try {
    return await originFetch(`${origin}${path}`, {
      headers: { ...REQUEST_HEADERS, accept: "application/json", authorization: `Bearer ${token}` },
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_DEADLINE_MS)]),
    });
  } catch (cause) {
    reportFailure({ event: "x-api-request-failed", fields: {} }, cause);
    const caused = CausedSchema.safeParse(cause);
    const codes = [cause, caused.success ? caused.data.cause : null].map((failure) =>
      errnoCodeOf(failure),
    );

    return codes.some((code) => NOT_CONNECTED.has(code)) ? "not-sent" : "unknown";
  }
}

export async function xApiGet(call: Readonly<XApiCall>): Promise<XApiSent> {
  const response = await sent(call);

  if (response === "not-sent" || response === "unknown")
    return { answer: UNREACHABLE, delivery: { kind: response } };

  const { status } = response;

  try {
    const { bytes, cut } =
      response.body === null ? EMPTY : await readCapped(response.body, THREAD_CONTENT_BYTES);
    const text = new TextDecoder().decode(bytes);

    if (cut)
      return {
        answer: { kind: "refused", reason: "api-answer-refused", status },
        delivery: { kind: "unknown" },
      };

    return {
      answer: answerOf({ status, header: (name) => response.headers.get(name), text }, Date.now()),
      delivery: { kind: "answered", status, text },
    };
  } catch (cause) {
    reportFailure({ event: "x-api-answer-unread", fields: { status } }, cause);

    return { answer: UNREACHABLE, delivery: { kind: "unknown" } };
  }
}
