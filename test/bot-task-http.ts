import { z } from "zod";

import type { Instance, Json } from "./instance.ts";

export interface Credential {
  readonly id: number | string;
  readonly token: string | null;
}

export function answerTo(
  instance: Instance,
  who: Readonly<Credential>,
  body: Json,
  extra: Readonly<Record<string, string>> = {},
): Promise<Response> {
  return rawAnswerTo(instance, who, JSON.stringify(body), extra);
}

export function rawAnswerTo(
  instance: Instance,
  { id, token }: Readonly<Credential>,
  body: string,
  extra: Readonly<Record<string, string>> = {},
): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json", ...extra });

  if (token !== null) headers.set("authorization", `Bearer ${token}`);

  return instance.fetch(`/api/ai-tasks/${String(id)}/result`, {
    method: "POST",
    headers,
    body,
  });
}

export async function answered(
  instance: Instance,
  who: Readonly<Credential>,
  body: Json,
): Promise<{ readonly status: number; readonly text: string }> {
  const response = await answerTo(instance, who, body);

  return { status: response.status, text: await response.text() };
}

const ErrorBodySchema = z.object({ error: z.string() });

export function errorOf(text: string): string {
  return ErrorBodySchema.parse(JSON.parse(text)).error;
}
