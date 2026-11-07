import type { ZodType } from "zod";

import { announceSignedOut } from "./signed-out.ts";

type Method = "GET" | "POST" | "PUT" | "DELETE";

export type JsonBody = Readonly<Record<string, string | undefined>>;

interface Call {
  readonly json?: JsonBody;
  readonly signsOut?: boolean;
}

const JSON_HEADERS = { "content-type": "application/json" } as const;

export async function call(
  method: Method,
  path: string,
  { json, signsOut = true }: Readonly<Call> = {},
): Promise<Response> {
  const init: RequestInit =
    json === undefined ? { method } : { method, headers: JSON_HEADERS, body: JSON.stringify(json) };

  const response = await fetch(path, init);

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
