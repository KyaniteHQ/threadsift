import { and, eq, gt, lte, notExists, or, sql } from "drizzle-orm";

import { base64url, digestOf, randomSecret } from "../../../core/contract/encoding.ts";
import {
  CONNECT_CALLBACK_PATH,
  CONNECT_LIFETIME_MS,
  type ConnectStartInput,
} from "../../../core/contract/openrouter-contract.ts";
import { CURRENT_REVISION } from "../../../core/kernel/ai-settings-revision.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { guardedBatch } from "../../../core/kernel/guards.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { openrouterConnectTransactions, sessions } from "../../../core/kernel/schema.ts";
import type { Sealer } from "../../../core/kernel/sealed-secret.ts";
import { DATABASE_NOW } from "../../../core/kernel/sql-expressions.ts";
import { type Sender, sentByOwnPage } from "../../access/core/own-origin.ts";
import { sessionIsLive } from "../../access/core/sessions.ts";

const AUTHORIZATION_URL = "https://openrouter.ai/auth";
const KEY_LABEL = "Threadsift";
const RANDOM_BYTES = 32;

type StartRefusal =
  | { readonly kind: "no-origin" }
  | { readonly kind: "not-own-page" }
  | { readonly kind: "no-session" }
  | { readonly kind: "unavailable" };

type StartResult =
  | { readonly kind: "started"; readonly authorizationUrl: string; readonly expiresAt: number }
  | { readonly kind: "stale" }
  | StartRefusal;

type StartRequest = ConnectStartInput & {
  readonly sender: Sender;
  readonly sessionId: string | undefined;
};

function authorizationUrl(origin: string, state: string, challenge: string): string {
  const url = new URL(AUTHORIZATION_URL);

  url.searchParams.set("callback_url", `${origin}${CONNECT_CALLBACK_PATH}`);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("key_label", KEY_LABEL);

  return url.href;
}

async function sealedAttempt(
  { crypto }: Readonly<Pick<Ports, "crypto">>,
  { origin, sealer, sessionId }: Readonly<Ready>,
  { model, revision }: Readonly<ConnectStartInput>,
) {
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

  return { state, verifier, row };
}

interface Ready {
  readonly origin: string;
  readonly sealer: Sealer;
  readonly sessionId: string;
}

function readyToStart(
  ports: Ports,
  sender: Readonly<Sender>,
  sessionId: string | undefined,
): Ready | StartRefusal {
  const { publicOrigin: origin } = ports.config;
  const sealer = ports.secrets;

  if (origin === null) return { kind: "no-origin" };

  if (!sentByOwnPage(sender, origin)) return { kind: "not-own-page" };

  if (sessionId === undefined) return { kind: "no-session" };

  if (sealer === null) return { kind: "unavailable" };

  return { origin, sealer, sessionId };
}

export async function startOpenRouterConnect(
  ports: Ports,
  { sender, sessionId, ...input }: Readonly<StartRequest>,
): Promise<StartResult> {
  const ready = readyToStart(ports, sender, sessionId);

  if ("kind" in ready) return ready;

  const { crypto } = ports;
  const { state, verifier, row } = await sealedAttempt(ports, ready, input);

  const inserted = await guardedBatch(
    ports.db,
    sql`${sessionIsLive(crypto, ready.sessionId)} and ${CURRENT_REVISION} = ${input.revision}`,
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
        authorizationUrl: authorizationUrl(ready.origin, state, base64url(crypto.sha256(verifier))),
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
