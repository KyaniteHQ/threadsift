import { type SQL, sql } from "drizzle-orm";

import { githubSettings } from "./github-tables.ts";

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
