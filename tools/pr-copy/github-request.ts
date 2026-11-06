import type { z } from "zod";

import { requiredEnv } from "./env.ts";
import { callTimeout } from "./timeout.ts";

export async function github<Body>(
  path: string,
  schema: z.ZodType<Body>,
  body?: string,
): Promise<Body> {
  const method = body === undefined ? "GET" : "POST";

  const response = await fetch(
    `${requiredEnv("GITHUB_API_URL", "https://api.github.com")}/repos/${requiredEnv("GITHUB_REPOSITORY")}/${path}`,
    {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${requiredEnv("GITHUB_TOKEN")}`,
        "x-github-api-version": "2022-11-28",
      },
      body: body ?? null,
      signal: callTimeout(),
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub ${method} ${path} answered ${String(response.status)}`);
  }

  return schema.parse(response.status === 204 ? null : await response.json());
}
