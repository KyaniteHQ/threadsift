import type { ZodType } from "zod";

import type { CreateHighlightRequest } from "../../src/core/highlight-contract.ts";
import { announceSignedOut } from "./signed-out.ts";

type Method = "GET" | "POST" | "PUT" | "DELETE";

export type JsonBody =
  | Readonly<Record<string, string | number | undefined>>
  | Readonly<CreateHighlightRequest>;

interface Call {
  readonly json?: JsonBody;
  readonly signsOut?: boolean;
  readonly signal?: AbortSignal;
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

export function unexpected(method: Method, path: string, status: number): Error {
  return new Error(`${method} ${path} answered ${status}`);
}

export async function callOk(
  method: Method,
  path: string,
  options: Readonly<Call> = {},
): Promise<Response> {
  const response = await call(method, path, options);

  if (!response.ok) {
    throw unexpected(method, path, response.status);
  }

  return response;
}

export async function parsedFrom<Parsed>(
  method: Method,
  path: string,
  schema: ZodType<Parsed>,
  options: Readonly<Call> = {},
): Promise<Parsed> {
  const response = await callOk(method, path, options);

  return schema.parse(await response.json());
}
