import { and, eq, gt, lte, notExists, or, sql } from "drizzle-orm";

import { base64url, digestOf, randomSecret } from "./encoding.ts";
import { guardedBatch } from "./guards.ts";
import {
  CONNECT_CALLBACK_PATH,
  CONNECT_LIFETIME_MS,
  type ConnectStartInput,
} from "./openrouter-contract.ts";
import { CURRENT_REVISION, DATABASE_NOW } from "./openrouter-tables.ts";
import type { Database, Ports } from "./ports.ts";
import { openrouterConnectTransactions, sessions } from "./schema.ts";
import { sessionIsLive } from "./sessions.ts";

const AUTHORIZATION_URL = "https://openrouter.ai/auth";
const KEY_LABEL = "Threadsift";
const RANDOM_BYTES = 32;

export type StartResult =
  | { readonly kind: "started"; readonly authorizationUrl: string; readonly expiresAt: number }
  | { readonly kind: "unavailable" }
  | { readonly kind: "stale" };

function authorizationUrl(origin: string, state: string, challenge: string): string {
  const url = new URL(AUTHORIZATION_URL);

  url.searchParams.set("callback_url", `${origin}${CONNECT_CALLBACK_PATH}`);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("key_label", KEY_LABEL);

  return url.href;
}

export async function startOpenRouterConnect(
  ports: Ports,
  { sessionId, model, revision }: Readonly<ConnectStartInput & { sessionId: string }>,
): Promise<StartResult> {
  const { publicOrigin: origin, crypto } = ports;
  const sealer = ports.secrets;

  if (origin === null || sealer === null) return { kind: "unavailable" };

  const state = randomSecret(crypto, RANDOM_BYTES);
  const verifier = randomSecret(crypto, RANDOM_BYTES);

  const row = {
    stateDigest: digestOf(crypto, state),
    sessionDigest: digestOf(crypto, sessionId),
    sealedVerifier: await sealer.seal(verifier),
    model,
    expectedRevision: revision,
    publicOrigin: origin,
    createdAt: DATABASE_NOW,
    expiresAt: sql<number>`${DATABASE_NOW} + ${CONNECT_LIFETIME_MS}`,
  };

  const inserted = await guardedBatch(
    ports.db,
    sql`${sessionIsLive(crypto, sessionId)} and ${CURRENT_REVISION} = ${revision}`,
    [ports.db.insert(openrouterConnectTransactions).values(row)],
  );

  if (!inserted) return { kind: "stale" };

  const [stored] = await ports.db
    .select({ expiresAt: openrouterConnectTransactions.expiresAt })
    .from(openrouterConnectTransactions)
    .where(eq(openrouterConnectTransactions.stateDigest, row.stateDigest));

  return stored === undefined
    ? { kind: "stale" }
    : {
        kind: "started",
        authorizationUrl: authorizationUrl(origin, state, base64url(crypto.sha256(verifier))),
        expiresAt: stored.expiresAt,
      };
}

export function sweepConnectTransactions(db: Database) {
  const live = db
    .select({ one: sql`1` })
    .from(sessions)
    .where(
      and(
        eq(sessions.digest, openrouterConnectTransactions.sessionDigest),
        gt(sessions.expiresAt, DATABASE_NOW),
      ),
    );

  return db
    .delete(openrouterConnectTransactions)
    .where(or(lte(openrouterConnectTransactions.expiresAt, DATABASE_NOW), notExists(live)));
}
