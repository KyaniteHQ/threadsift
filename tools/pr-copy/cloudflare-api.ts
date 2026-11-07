import { z } from "zod";

import { requiredEnv } from "./env.ts";
import { callTimeout } from "./timeout.ts";

const API = "https://api.cloudflare.com/client/v4";

const PER_PAGE = 100;

type RequestMethod = "GET" | "DELETE" | "POST" | "PATCH";

const ErrorBody = z.object({ errors: z.array(z.object({ code: z.number().int() })) });

export class CloudflareAnswerError extends Error {
  readonly status: number;
  readonly codes: readonly number[];

  constructor(method: RequestMethod, path: string, status: number, codes: readonly number[] = []) {
    super(`Cloudflare ${method} ${path} answered ${String(status)}`);
    this.status = status;
    this.codes = codes;
  }
}

export async function accountRequest(
  method: RequestMethod,
  path: string,
  body?: string,
  deadline?: number,
): Promise<Response> {
  const request = body === undefined ? { method } : { method, body };

  const response = await fetch(`${API}/accounts/${requiredEnv("CLOUDFLARE_ACCOUNT_ID")}/${path}`, {
    ...request,
    headers: {
      authorization: `Bearer ${requiredEnv("CLOUDFLARE_API_TOKEN")}`,
      "content-type": "application/json",
    },
    signal: callTimeout(deadline),
  });

  if (!response.ok) {
    const answer = ErrorBody.safeParse(await response.json().catch(() => null));
    const codes = answer.success ? answer.data.errors.map((entry) => entry.code) : [];

    throw new CloudflareAnswerError(method, path, response.status, codes);
  }

  return response;
}

export const PageSchema = z.object({
  success: z.literal(true),
  result_info: z.object({ total_count: z.number().int() }).optional(),
});

export async function cloudflareCall<Body>(
  method: RequestMethod,
  path: string,
  schema: z.ZodType<Body>,
  body?: string,
  deadline?: number,
): Promise<Body> {
  const response = await accountRequest(method, path, body, deadline);

  return schema.parse(await response.json());
}

export function cloudflareGet<Body>(path: string, schema: z.ZodType<Body>): Promise<Body> {
  return cloudflareCall("GET", path, schema);
}

export async function listFrom<Row>(
  path: string,
  rows: z.ZodType<Row>,
  page: number,
): Promise<Row[]> {
  const separator = path.includes("?") ? "&" : "?";

  const body = await cloudflareGet(
    `${path}${separator}per_page=${String(PER_PAGE)}&page=${String(page)}`,
    PageSchema.extend({ result: z.array(rows) }),
  );

  const seen = (page - 1) * PER_PAGE + body.result.length;
  const more = body.result.length === PER_PAGE && seen < (body.result_info?.total_count ?? 0);

  return more ? [...body.result, ...(await listFrom(path, rows, page + 1))] : body.result;
}
