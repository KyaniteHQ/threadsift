import { eq } from "drizzle-orm";
import { z } from "zod";

import type { GuardOutcome, Page } from "./fetch-guard.ts";
import { UNAUTHORIZED, apiPolicy, getApi, parsedJson } from "./github-api.ts";
import {
  type GithubRefused,
  type GithubSettingsView,
  type GithubTokenInput,
  type GithubVerifyResult,
  refusedGithub,
} from "./github-contract.ts";
import { githubSettings } from "./github-tables.ts";
import { HOP_DEADLINE_MS, type Ports } from "./ports.ts";

export type GithubAuth =
  | { readonly kind: "anonymous" }
  | { readonly kind: "token"; readonly token: string }
  | { readonly kind: "unreadable" };

type TokenPorts = Pick<Ports, "db" | "ai">;

type VerifyPorts = TokenPorts & Pick<Ports, "network">;

const ANONYMOUS: GithubAuth = { kind: "anonymous" };

const UNREADABLE: GithubAuth = { kind: "unreadable" };

const RateLimitSchema = z.object({
  rate: z.object({
    limit: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
  }),
});

export async function loadGithubAuth({ db, ai }: Readonly<TokenPorts>): Promise<GithubAuth> {
  const [row] = await db.select().from(githubSettings).where(eq(githubSettings.id, 1));

  if (row === undefined) return ANONYMOUS;

  const token = ai.secrets === null ? null : await ai.secrets.open(row.sealedToken);

  return token === null ? UNREADABLE : { kind: "token", token };
}

function viewOf(auth: Readonly<GithubAuth>, ports: Readonly<TokenPorts>): GithubSettingsView {
  const secretReady = ports.ai.secrets !== null;

  switch (auth.kind) {
    case "anonymous":
      return { token: "none", secretReady };
    case "token":
      return { token: "saved", secretReady };
    case "unreadable":
      return { token: "unreadable", secretReady };
    default: {
      const exhaustive: never = auth;

      return exhaustive;
    }
  }
}

export async function readGithubSettings(ports: Readonly<TokenPorts>): Promise<GithubSettingsView> {
  return viewOf(await loadGithubAuth(ports), ports);
}

export async function saveGithubToken(
  ports: Readonly<TokenPorts>,
  { token }: Readonly<GithubTokenInput>,
) {
  const { secrets } = ports.ai;

  if (secrets === null) return refusedGithub("secret-missing");

  const row = { id: 1, sealedToken: await secrets.seal(token) };

  await ports.db
    .insert(githubSettings)
    .values(row)
    .onConflictDoUpdate({ target: githubSettings.id, set: row });

  return viewOf({ kind: "token", token }, ports);
}

export async function removeGithubToken(ports: Readonly<TokenPorts>): Promise<GithubSettingsView> {
  await ports.db.delete(githubSettings).where(eq(githubSettings.id, 1));

  return viewOf(ANONYMOUS, ports);
}

function refusalOf(outcome: Exclude<GuardOutcome, Page>): GithubRefused {
  if (outcome.kind === "stopped") return refusedGithub("github-error");

  if (outcome.reason === "rate-limited") {
    return refusedGithub("github-error", outcome.httpStatus);
  }

  if (outcome.reason === "status") {
    return outcome.httpStatus === UNAUTHORIZED
      ? refusedGithub("wrong-token", outcome.httpStatus)
      : refusedGithub("github-error", outcome.httpStatus);
  }

  return refusedGithub(outcome.reason === "timeout" ? "timeout" : "unreachable");
}

export async function verifyGithubToken(
  ports: Readonly<VerifyPorts>,
  signal: AbortSignal,
): Promise<GithubVerifyResult> {
  if (ports.ai.secrets === null) return refusedGithub("secret-missing");

  const auth = await loadGithubAuth(ports);

  if (auth.kind === "anonymous") return refusedGithub("not-configured");

  if (auth.kind === "unreadable") return refusedGithub("secret-missing");

  const outcome = await getApi(
    ports.network,
    "/rate_limit",
    apiPolicy(auth.token),
    AbortSignal.any([signal, AbortSignal.timeout(HOP_DEADLINE_MS)]),
  );

  if (outcome.kind !== "page") return refusalOf(outcome);

  const limits = parsedJson(RateLimitSchema, outcome.text);

  return outcome.cut || limits === null
    ? refusedGithub("github-error")
    : { kind: "verified", ...limits.rate };
}
