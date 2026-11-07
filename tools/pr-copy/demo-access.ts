import { SessionStateSchema } from "../../src/http/schemas.ts";
import type { AccessCodes } from "./codes.ts";
import {
  type Call,
  type Copy,
  type Site,
  callCopy,
  decodeAnswer,
  refusal,
  refusalCode,
  sessionCookie,
} from "./copy-calls.ts";
import { CopyAnswerError } from "./copy-error.ts";
import { requiredEnv } from "./env.ts";
import { pause, remaining } from "./timeout.ts";

const LOCK_WAIT_LIMIT_S = 300;

async function postAccess(
  site: Readonly<Site>,
  call: Readonly<Call>,
  deadline = Date.now() + LOCK_WAIT_LIMIT_S * 1000,
): Promise<string | null> {
  const response = await callCopy(site, { ...call, deadline });

  const cookie = sessionCookie(response);

  if (response.status === 204 && cookie !== undefined) {
    return cookie;
  }

  if (response.status === 409) {
    return null;
  }

  if (response.status !== 429) {
    throw new CopyAnswerError(call.path, response.status, await refusal(response));
  }

  const retryAfter = Number(response.headers.get("retry-after"));

  if (!(retryAfter * 1000 <= remaining(deadline))) {
    throw new Error(
      `${call.path} is locked for ${String(retryAfter)} s; ${String(Math.round(remaining(deadline) / 1000))} s of the ${String(LOCK_WAIT_LIMIT_S)} s limit remain`,
    );
  }

  process.stdout.write(`${call.path} is locked; waiting ${String(retryAfter)} s\n`);
  await pause(retryAfter * 1000, deadline);

  return postAccess(site, call, deadline);
}

async function loginCookie(site: Readonly<Site>, password: string): Promise<string | null> {
  const response = await callCopy(site, { path: "/api/login", body: { password } });
  const cookie = sessionCookie(response);

  if (response.status === 204 && cookie !== undefined) {
    return cookie;
  }

  if (response.status === 401 || response.status === 429) {
    return null;
  }

  throw new CopyAnswerError("/api/login", response.status, await refusal(response));
}

async function resetDemoPassword(
  site: Readonly<Site>,
  password: string,
  resetCode: string,
): Promise<void> {
  const path = "/api/password/reset";
  const response = await callCopy(site, { path, body: { code: resetCode, password } });

  if (response.status === 409 && (await refusalCode(response)) === "reset-used") {
    process.stdout.write(
      "The reset code was used already, so an earlier try of the reset reached the copy; checking the demo password\n",
    );

    return;
  }

  if (response.status !== 204) {
    throw new CopyAnswerError(path, response.status, await refusal(response));
  }

  process.stdout.write("The demo password was wrong or locked; reset it to the demo password\n");
}

async function logIn(site: Readonly<Site>, password: string, resetCode: string): Promise<Copy> {
  const cookie = await loginCookie(site, password);

  if (cookie !== null) {
    return { ...site, cookie };
  }

  await resetDemoPassword(site, password, resetCode);
  const reset = await loginCookie(site, password);

  if (reset === null) {
    throw new Error("/api/login refused the demo password after a reset");
  }

  return { ...site, cookie: reset };
}

export async function signIn(site: Readonly<Site>, codes: Readonly<AccessCodes>): Promise<Copy> {
  const response = await callCopy(site, { path: "/api/session" });
  const state = await decodeAnswer(response, "/api/session", SessionStateSchema);
  const password = requiredEnv("DEMO_OWNER_PASSWORD");
  process.stdout.write(`${site.url}/api/session: ${JSON.stringify(state)}\n`);

  if (state.state !== "setup") {
    return logIn(site, password, codes.reset);
  }

  if (state.code !== "set") {
    throw new Error(`The copy has no usable setup code: ${state.code}`);
  }

  const cookie = await postAccess(site, {
    path: "/api/setup",
    body: { code: codes.setup, password },
  });

  return cookie === null ? logIn(site, password, codes.reset) : { ...site, cookie };
}
