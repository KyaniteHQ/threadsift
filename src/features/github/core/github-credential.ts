import { type SQL, eq, sql } from "drizzle-orm";

import { githubSettings } from "../../../core/kernel/github-tables.ts";
import type { Ports } from "../../../core/kernel/ports.ts";

export type TokenPorts = Pick<Ports, "db" | "secrets">;

const ANONYMOUS: GithubAuth = { kind: "anonymous" };

export type GithubAuth =
  | { readonly kind: "anonymous" }
  | { readonly kind: "token"; readonly token: string; readonly sealed: string }
  | { readonly kind: "unreadable"; readonly sealed: string };

export class CredentialChanged extends Error {
  constructor() {
    super("the GitHub token changed while a request was in flight");
  }
}

export function credentialCurrent(auth: Readonly<GithubAuth>): SQL {
  return auth.kind === "anonymous"
    ? sql`NOT EXISTS (SELECT 1 FROM ${githubSettings})`
    : sql`EXISTS (SELECT 1 FROM ${githubSettings} WHERE ${githubSettings.id} = 1 AND ${githubSettings.sealedToken} = ${auth.sealed})`;
}

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
