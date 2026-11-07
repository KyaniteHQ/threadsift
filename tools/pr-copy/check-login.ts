import { randomBytes } from "node:crypto";

import { INGEST_DEADLINE_MS, SENTINEL_ROUTE, idleMinutes } from "./check-measure.ts";
import type { Run } from "./check-run.ts";
import type { Findings } from "./check-types.ts";
import { type Copy, send, sessionCookie } from "./copy-calls.ts";
import { logIn } from "./copy-client.ts";
import { requiredEnv } from "./env.ts";
import { SKEW_MS } from "./pace.ts";
import { type Invocation, awaitInvocations } from "./telemetry.ts";

const LOGIN_ROUTE = "/api/login";

const LABELS = ["first after idle", "wrong password", "subsequent"] as const;

interface SignIn {
  readonly status: number;
  readonly clientMs: number;
  readonly cookie: string | undefined;
}

async function signInWith(url: string, password: string): Promise<SignIn> {
  const started = performance.now();
  const response = await send(url, { path: LOGIN_ROUTE, body: { password } });
  const clientMs = performance.now() - started;
  const cookie = sessionCookie(response);
  await response.body?.cancel();

  return { status: response.status, clientMs, cookie };
}

async function loginRecords(run: Readonly<Run>, start: number) {
  await send(run.url, { path: SENTINEL_ROUTE });

  const { found } = await awaitInvocations(
    run.stage,
    { version: run.version, trigger: "fetch" },
    { from: start - SKEW_MS, to: Date.now() + INGEST_DEADLINE_MS },
    {
      deadlineMs: INGEST_DEADLINE_MS,
      enough: (seen) =>
        seen.filter((entry) => entry.name === LOGIN_ROUTE).length >= LABELS.length &&
        seen.some((entry) => entry.name === SENTINEL_ROUTE && entry.at >= start),
    },
  );

  return found.filter((entry) => entry.name === LOGIN_ROUTE);
}

function report(
  findings: Readonly<Findings>,
  calls: readonly Readonly<SignIn>[],
  logins: readonly Readonly<Invocation>[],
): void {
  findings.used(logins);
  findings.check(
    "every sign-in has an invocation record",
    logins.length === calls.length,
    `${String(logins.length)} of ${String(calls.length)}`,
  );
  findings.check(
    "statuses are 204, 401, 204",
    calls.map((call) => call.status).join(",") === "204,401,204",
    calls.map((call) => String(call.status)).join(","),
  );

  for (const [index, call] of calls.entries()) {
    const label = LABELS[index] ?? "";
    const record = logins[index];
    findings.measure(`${label}: client elapsed ms`, Math.round(call.clientMs));
    findings.check(
      `${label}: outcome ok`,
      record?.outcome === "ok",
      record?.outcome ?? "no record",
    );

    if (record !== undefined) {
      findings.measure(`${label}: cpu ms`, record.cpuMs);
      findings.measure(`${label}: wall ms`, record.wallMs);
    }
  }
}

export async function loginCheck(run: Readonly<Run>, findings: Readonly<Findings>): Promise<Copy> {
  const password = requiredEnv("DEMO_OWNER_PASSWORD");
  const start = Date.now();

  findings.measure(
    "idle minutes before the first sign-in (180 when none earlier)",
    await idleMinutes(run, "fetch", start),
  );

  const calls = [
    await signInWith(run.url, password),
    await signInWith(run.url, randomBytes(12).toString("hex")),
    await signInWith(run.url, password),
  ];

  report(findings, calls, await loginRecords(run, start));

  const cookie = calls[2]?.cookie;

  return cookie === undefined
    ? logIn({ url: run.url, retryUntil: 0 }, password)
    : { url: run.url, retryUntil: 0, cookie };
}
