import { ErrorResponseSchema } from "../../src/http/schemas.ts";
import { callTimeout, pause, remaining } from "./timeout.ts";

export const POLL_MS = 1000;

export interface Site {
  readonly url: string;
  readonly retryUntil: number;
}

export type Copy = Readonly<Site & { cookie: string }>;

export interface Call {
  readonly path: string;
  readonly method?: "POST" | "PUT";
  readonly cookie?: string;
  readonly body?: Readonly<Record<string, string>>;
  readonly deadline?: number;
}

function build(url: string, call: Readonly<Call>): Request {
  const headers = new Headers({ origin: url });

  if (call.cookie !== undefined) {
    headers.set("cookie", call.cookie);
  }

  const method = call.method ?? (call.body === undefined ? "GET" : "POST");

  const request =
    call.body === undefined ? { method } : { method, body: JSON.stringify(call.body) };

  if (call.body !== undefined) headers.set("content-type", "application/json");

  const built = new Request(`${url}${call.path}`, { ...request, headers });
  const { protocol } = new URL(built.url);

  if (protocol !== "https:" && protocol !== "http:") {
    throw new Error(`${built.url} is not an HTTP address`);
  }

  return built;
}

export function send(url: string, call: Readonly<Call>): Promise<Response> {
  return fetch(build(url, call), { signal: callTimeout(call.deadline) });
}

export function sessionCookie(response: Response): string | undefined {
  const [setCookie] = response.headers.getSetCookie();

  return setCookie?.split(";")[0];
}

export function isJson(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").startsWith("application/json");
}

function fromApp(response: Response): boolean {
  return (response.status !== 404 && response.status < 500) || isJson(response);
}

async function transport(
  site: Readonly<Site>,
  call: Readonly<Call>,
  timeoutAt: number | undefined,
): Promise<Response | TypeError> {
  const request = build(site.url, call);
  const signal = callTimeout(timeoutAt);

  try {
    return await fetch(request, { signal });
  } catch (error) {
    if (error instanceof TypeError) {
      return error;
    }

    throw error;
  }
}

async function attempt(
  site: Readonly<Site>,
  call: Readonly<Call>,
  retry: boolean,
): Promise<Response> {
  const limit = Math.min(site.retryUntil, call.deadline ?? Number.POSITIVE_INFINITY);
  const outcome = await transport(site, call, retry ? limit : call.deadline);

  if (outcome instanceof Response && fromApp(outcome)) {
    return outcome;
  }

  const settle = () => {
    if (outcome instanceof Response) {
      return outcome;
    }

    throw outcome;
  };

  if (remaining(limit) <= POLL_MS) {
    return settle();
  }

  const answer =
    outcome instanceof Response
      ? `${String(outcome.status)} from Cloudflare, not the app`
      : "no answer";

  process.stdout.write(`${call.path} got ${answer}; retrying\n`);
  await pause(POLL_MS, limit);

  if (remaining(limit) === 0) {
    return settle();
  }

  if (outcome instanceof Response) {
    await outcome.body?.cancel();
  }

  return attempt(site, call, true);
}

export function callCopy(site: Readonly<Site>, call: Readonly<Call>): Promise<Response> {
  return attempt(site, call, false);
}

async function refusalBody(response: Response) {
  return ErrorResponseSchema.safeParse(await response.json().catch(() => null));
}

export async function refusal(response: Response): Promise<string> {
  const body = await refusalBody(response);

  return body.success ? body.data.error : "no error body";
}

export async function refusalCode(response: Response): Promise<string | undefined> {
  const body = await refusalBody(response.clone());

  return body.success ? body.data.code : undefined;
}
