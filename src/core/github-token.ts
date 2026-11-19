import { eq } from "drizzle-orm";
import { z } from "zod";

import type { GuardOutcome, Page } from "./fetch-guard.ts";
import { apiPolicy, rejectsToken, requestApi } from "./github-api.ts";
import {
  type GithubRefused,
  type GithubSettingsView,
  type GithubTokenInput,
  type GithubVerifyResult,
  refusedGithub,
} from "./github-contract.ts";
import { endCooldown } from "./github-cooldown.ts";
import {
  type GithubAuth,
  type TokenPorts,
  loadGithubAuth,
  withCurrentCredential,
} from "./github-credential.ts";
import type { RateLimit } from "./github-rate-limit.ts";
import { githubSettings } from "./github-tables.ts";
import { parsedJson } from "./parsed-json.ts";
import type { Ports } from "./ports.ts";
import { HOP_DEADLINE_MS } from "./request-waits.ts";
import { WholeCount } from "./whole-count.ts";

type VerifyPorts = TokenPorts & Pick<Ports, "network">;

const RateLimitSchema = z.object({
  rate: z.object({
    limit: WholeCount,
    remaining: WholeCount,
  }),
});

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

function refusalOf(outcome: Exclude<GuardOutcome<RateLimit>, Page>): GithubRefused {
  if (outcome.kind === "stopped") return refusedGithub("github-error");

  if (outcome.reason === "status") {
    return refusedGithub(
      rejectsToken(outcome) ? "wrong-token" : "github-error",
      outcome.httpStatus,
    );
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
