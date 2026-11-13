import type { ZodType } from "zod";

import type { CreateHighlightRequest } from "../../src/core/highlight-contract.ts";
import type { ImportRequest } from "../../src/core/import-list.ts";
import type { ChangeBudgetRequest, CreateTokenRequest } from "../../src/http/schemas.ts";
import { announceSignedOut } from "./signed-out.ts";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type JsonBody =
  | Readonly<Record<string, string | number | boolean | undefined>>
  | Readonly<CreateHighlightRequest>
  | Readonly<ImportRequest>
  | Readonly<CreateTokenRequest>
  | Readonly<ChangeBudgetRequest>;

interface Call {
  readonly json?: JsonBody;
  readonly signsOut?: boolean;
  readonly signal?: AbortSignal;
}

interface OkCall extends Call {
  readonly tolerates?: readonly number[];
}

const JSON_HEADERS = { "content-type": "application/json" } as const;

export async function call(
  method: Method,
  path: string,
  { json, signsOut = true, signal }: Readonly<Call> = {},
): Promise<Response> {
  const init: RequestInit =
    json === undefined ? { method } : { method, headers: JSON_HEADERS, body: JSON.stringify(json) };

  const response = await fetch(path, signal === undefined ? init : { ...init, signal });

  if (signsOut && response.status === 401) {
    announceSignedOut();
  }

  return response;
}

function unexpected(method: Method, path: string, status: number): Error {
  return new Error(`${method} ${path} answered ${status}`);
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

export function withCursor(path: string, cursor: string | null): string {
  return cursor === null ? path : `${path}?cursor=${encodeURIComponent(cursor)}`;
}
