import type { ZodType } from "zod";

import type {
  ChangeBudgetRequest,
  CreateTokenRequest,
} from "../../src/core/contract/access-wire.ts";
import { within } from "../../src/core/contract/deadline.ts";
import type { CreateHighlightRequest } from "../../src/core/contract/highlight-contract.ts";
import type { ImportRequest } from "../../src/core/contract/import-list.ts";

let unauthorized: (() => void) | null = null;

export function setUnauthorizedListener(listener: (() => void) | null): void {
  unauthorized = listener;
}

type WriteMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export const NO_DEADLINE = "none";

type Deadline = number | typeof NO_DEADLINE;

interface Write {
  readonly method: WriteMethod;
  readonly deadline: Deadline;
}

type Method = "GET" | Write;

export type JsonBody =
  | Readonly<Record<string, string | number | boolean | undefined>>
  | Readonly<CreateHighlightRequest>
  | Readonly<ImportRequest>
  | Readonly<CreateTokenRequest>
  | Readonly<ChangeBudgetRequest>;

interface Call {
  readonly json?: JsonBody;
  readonly bytes?: Readonly<Blob>;
  readonly signsOut?: boolean;
  readonly signal?: AbortSignal | undefined;
}

interface OkCall extends Call {
  readonly tolerates?: readonly number[];
}

export const READ_DEADLINE_MS = 20_000;

const JSON_HEADERS = { "content-type": "application/json" } as const;

const BYTES_HEADERS = { "content-type": "application/octet-stream" } as const;

export function post(deadline: Deadline): Write {
  return { method: "POST", deadline };
}

export function put(deadline: Deadline): Write {
  return { method: "PUT", deadline };
}

export function patch(deadline: Deadline): Write {
  return { method: "PATCH", deadline };
}

export function del(deadline: Deadline): Write {
  return { method: "DELETE", deadline };
}

function methodOf(method: Method): string {
  return method === "GET" ? method : method.method;
}

function deadlineOf(method: Method): AbortSignal | undefined {
  if (method === "GET") return AbortSignal.timeout(READ_DEADLINE_MS);

  return method.deadline === NO_DEADLINE ? undefined : AbortSignal.timeout(method.deadline);
}

function signalOf(method: Method, caller: AbortSignal | undefined): AbortSignal | undefined {
  const deadline = deadlineOf(method);

  return deadline === undefined ? caller : within(caller, deadline);
}

function requestInit(
  verb: string,
  json: JsonBody | undefined,
  bytes: Readonly<Blob> | undefined,
): RequestInit {
  if (json !== undefined) {
    return { method: verb, headers: JSON_HEADERS, body: JSON.stringify(json) };
  }

  return bytes === undefined
    ? { method: verb }
    : { method: verb, headers: BYTES_HEADERS, body: bytes };
}

export async function call(
  method: Method,
  path: string,
  { json, bytes, signsOut = true, signal }: Readonly<Call> = {},
): Promise<Response> {
  const verb = methodOf(method);

  const init = requestInit(verb, json, bytes);

  const limit = signalOf(method, signal);
  const response = await fetch(path, limit === undefined ? init : { ...init, signal: limit });

  if (signsOut && response.status === 401) {
    unauthorized?.();
  }

  return response;
}

export function unexpected(method: Method, path: string, status: number): Error {
  return new Error(`${methodOf(method)} ${path} answered ${status}`);
}

export async function callOk(
  method: Method,
  path: string,
  options: Readonly<OkCall> = {},
): Promise<Response> {
  const { tolerates = [] } = options;
  const response = await call(method, path, options);

  if (!response.ok && !tolerates.includes(response.status)) {
    throw unexpected(method, path, response.status);
  }

  return response;
}

export async function parsedBody<Parsed>(
  response: Response,
  schema: ZodType<Parsed>,
): Promise<Parsed> {
  return schema.parse(await response.json());
}

export async function parsedFrom<Parsed>(
  method: Method,
  path: string,
  schema: ZodType<Parsed>,
  options: Readonly<Call> = {},
): Promise<Parsed> {
  return parsedBody(await callOk(method, path, options), schema);
}

export async function parsedOrNull<Parsed>(
  method: Method,
  path: string,
  schema: ZodType<Parsed>,
  absentStatus: number,
  options: Readonly<Call> = {},
): Promise<Parsed | null> {
  const response = await callOk(method, path, { ...options, tolerates: [absentStatus] });

  return response.status === absentStatus ? null : parsedBody(response, schema);
}

export async function parsedOrGone<Parsed, Picked>(
  path: string,
  schema: ZodType<Parsed>,
  pick: (parsed: Readonly<Parsed>) => Picked,
): Promise<Picked | "gone"> {
  const found = await parsedOrNull("GET", path, schema, 404);

  return found === null ? "gone" : pick(found);
}

export function withCursor(path: string, cursor: string | null): string {
  return cursor === null ? path : `${path}?cursor=${encodeURIComponent(cursor)}`;
}
