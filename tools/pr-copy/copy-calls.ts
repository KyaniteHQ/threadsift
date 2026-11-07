import { ErrorResponseSchema } from "../../src/http/schemas.ts";
import { callTimeout, pause } from "./timeout.ts";

export const POLL_MS = 1000;

export interface Site {
  readonly url: string;
  readonly retryUntil: number;
}

export type Copy = Readonly<Site & { cookie: string }>;

export interface Call {
  readonly path: string;
  readonly cookie?: string;
  readonly body?: Readonly<Record<string, string>>;
  readonly deadline?: number;
}

export function send(url: string, call: Readonly<Call>): Promise<Response> {
  const headers = new Headers({ origin: url });

  if (call.cookie !== undefined) {
    headers.set("cookie", call.cookie);
  }

  const request =
    call.body === undefined
      ? { method: "GET" }
      : { method: "POST", body: JSON.stringify(call.body) };

  if (call.body !== undefined) headers.set("content-type", "application/json");

  return fetch(`${url}${call.path}`, { ...request, headers, signal: callTimeout(call.deadline) });
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

export async function callCopy(site: Readonly<Site>, call: Readonly<Call>): Promise<Response> {
  const response = await send(site.url, call);

  if (fromApp(response) || Date.now() >= site.retryUntil) {
    return response;
  }

  await response.body?.cancel();
  process.stdout.write(
    `${call.path} got ${String(response.status)} from Cloudflare, not the app; retrying\n`,
  );
  await pause(POLL_MS, call.deadline);

  return callCopy(site, call);
}

export async function refusal(response: Response): Promise<string> {
  const body = ErrorResponseSchema.safeParse(await response.json().catch(() => null));

  return body.success ? body.data.error : "no error body";
}
