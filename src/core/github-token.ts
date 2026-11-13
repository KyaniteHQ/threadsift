import { eq } from "drizzle-orm";
import { z } from "zod";

import type { GuardOutcome, Page, RateLimited } from "./fetch-guard.ts";
import { UNAUTHORIZED, apiPolicy, requestApi } from "./github-api.ts";
import {
  type GithubRefused,
  type GithubSettingsView,
  type GithubTokenInput,
  type GithubVerifyResult,
  refusedGithub,
} from "./github-contract.ts";
import { endCooldown } from "./github-cooldown.ts";
import { CredentialChanged, type GithubAuth } from "./github-credential.ts";
import { githubSettings } from "./github-tables.ts";
import { parsedJson } from "./parsed-json.ts";
import { HOP_DEADLINE_MS, type Ports } from "./ports.ts";

type TokenPorts = Pick<Ports, "db" | "secrets">;

type VerifyPorts = TokenPorts & Pick<Ports, "network">;

const ANONYMOUS: GithubAuth = { kind: "anonymous" };

const RateLimitSchema = z.object({
  rate: z.object({
    limit: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
  }),
});

export async function loadGithubAuth({ db, secrets }: Readonly<TokenPorts>): Promise<GithubAuth> {
  const [row] = await db.select().from(githubSettings).where(eq(githubSettings.id, 1));

  if (row === undefined) return ANONYMOUS;

  const { sealedToken: sealed } = row;
  const token = secrets === null ? null : await secrets.open(sealed);

  return token === null ? { kind: "unreadable", sealed } : { kind: "token", token, sealed };
}

export async function withCurrentCredential<Result>(
  ports: Readonly<TokenPorts>,
  work: (auth: Readonly<GithubAuth>) => Promise<Result>,
): Promise<Result> {
  try {
    return await work(await loadGithubAuth(ports));
  } catch (error) {
    if (error instanceof CredentialChanged) return withCurrentCredential(ports, work);

    throw error;
  }
}

function viewOf(kind: GithubAuth["kind"], ports: Readonly<TokenPorts>): GithubSettingsView {
  const secretReady = ports.secrets !== null;

  switch (kind) {
    case "anonymous":
      return { token: "none", secretReady };
    case "token":
      return { token: "saved", secretReady };
    case "unreadable":
      return { token: "unreadable", secretReady };
    default: {
      const exhaustive: never = kind;

      return exhaustive;
    }
  }
}

export async function readGithubSettings(ports: Readonly<TokenPorts>): Promise<GithubSettingsView> {
  return viewOf((await loadGithubAuth(ports)).kind, ports);
}

export async function saveGithubToken(
  ports: Readonly<TokenPorts>,
  { token }: Readonly<GithubTokenInput>,
) {
  const { secrets } = ports;

  if (secrets === null) return refusedGithub("secret-missing");

  const row = { id: 1, sealedToken: await secrets.seal(token) };

  await ports.db.batch([
    ports.db
      .insert(githubSettings)
      .values(row)
      .onConflictDoUpdate({ target: githubSettings.id, set: row }),
    endCooldown(ports.db),
  ]);

  return viewOf("token", ports);
}

export async function removeGithubToken(ports: Readonly<TokenPorts>): Promise<GithubSettingsView> {
  await ports.db.batch([
    ports.db.delete(githubSettings).where(eq(githubSettings.id, 1)),
    endCooldown(ports.db),
  ]);

  return viewOf("anonymous", ports);
}

function refusalOf(outcome: Exclude<GuardOutcome, Page | RateLimited>): GithubRefused {
  if (outcome.kind === "stopped") return refusedGithub("github-error");

  if (outcome.reason === "status") {
    return outcome.httpStatus === UNAUTHORIZED
      ? refusedGithub("wrong-token", outcome.httpStatus)
      : refusedGithub("github-error", outcome.httpStatus);
  }

  return refusedGithub(outcome.reason === "timeout" ? "timeout" : "unreachable");
}

async function verifiedWith(
  ports: Readonly<VerifyPorts>,
  auth: Readonly<GithubAuth>,
  signal: AbortSignal,
): Promise<GithubVerifyResult> {
  if (auth.kind === "anonymous") return refusedGithub("not-configured");

  if (auth.kind === "unreadable") return refusedGithub("secret-missing");

  const outcome = await requestApi(
    { ports, attempts: 0, auth },
    "/rate_limit",
    apiPolicy(auth.token),
    AbortSignal.any([signal, AbortSignal.timeout(HOP_DEADLINE_MS)]),
  );

  if (outcome.kind === "waiting") return refusedGithub("rate-limited");

  if (outcome.kind !== "page") return refusalOf(outcome);

  const limits = parsedJson(RateLimitSchema, outcome.text);

  return outcome.cut || limits === null
    ? refusedGithub("github-error")
    : { kind: "verified", ...limits.rate };
}

export function verifyGithubToken(
  ports: Readonly<VerifyPorts>,
  signal: AbortSignal,
): Promise<GithubVerifyResult> {
  if (ports.secrets === null) return Promise.resolve(refusedGithub("secret-missing"));

  return withCurrentCredential(ports, (auth) => verifiedWith(ports, auth, signal));
}
