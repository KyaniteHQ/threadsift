import { eq, exists, sql } from "drizzle-orm";

import {
  type GrokBotInput,
  type GrokBotResult,
  type GrokBotView,
  allowedGrokBotUrl,
  grokBotAddressOf,
} from "./grok-bot-contract.ts";
import { grokBotSettings } from "./grok-bot-tables.ts";
import { guardedBatch, holdsNoRow } from "./guards.ts";
import {
  HOP_DEADLINE_MS,
  type Network,
  NetworkFailure,
  type NetworkFailureReason,
  type Ports,
} from "./ports.ts";

type GrokBotPorts = Pick<Ports, "db" | "secrets">;

type PingPorts = GrokBotPorts & Pick<Ports, "network">;

type SavedRow = typeof grokBotSettings.$inferSelect;

interface Stored {
  readonly row: SavedRow;
  readonly key: string | null;
}

type GrokBotSaveOutcome =
  | { readonly kind: "saved"; readonly view: GrokBotView }
  | { readonly kind: "secret-missing" }
  | { readonly kind: "key-needed" };

const SAVE_ATTEMPTS = 5;

const ANSWER_BYTES = 16 * 1024;

const PING_BODY = JSON.stringify({ kind: "ping" });

const OK = 200;

const WRONG_KEY_STATUSES: ReadonlySet<number> = new Set([401, 403]);

const NOT_FOUND = 404;

async function loadStored(ports: Readonly<GrokBotPorts>): Promise<Stored | null> {
  const [row] = await ports.db.select().from(grokBotSettings).where(eq(grokBotSettings.id, 1));

  if (row === undefined) return null;

  const { secrets } = ports;

  return { row, key: secrets === null ? null : await secrets.open(row.sealedKey) };
}

function viewOf(secretReady: boolean, stored: Readonly<Stored> | null): GrokBotView {
  if (stored === null) {
    return { configured: false, webhookUrl: null, key: secretReady ? "none" : "missing" };
  }

  const { webhookUrl } = stored.row;

  if (!secretReady) return { configured: true, webhookUrl, key: "missing" };

  return { configured: true, webhookUrl, key: stored.key === null ? "unreadable" : "usable" };
}

export async function readGrokBot(ports: Readonly<GrokBotPorts>): Promise<GrokBotView> {
  return viewOf(ports.secrets !== null, await loadStored(ports));
}

function unchangedSince(ports: Readonly<GrokBotPorts>, stored: Readonly<Stored> | null) {
  if (stored === null) return holdsNoRow(ports.db, grokBotSettings, sql`${grokBotSettings.id} = 1`);

  const { row } = stored;

  return exists(
    ports.db
      .select({ one: sql`1` })
      .from(grokBotSettings)
      .where(
        sql`${grokBotSettings.id} = 1
          and ${grokBotSettings.webhookUrl} = ${row.webhookUrl}
          and ${grokBotSettings.sealedKey} = ${row.sealedKey}
          and ${grokBotSettings.updatedAt} = ${row.updatedAt}`,
      ),
  );
}

export async function saveGrokBot(
  ports: Readonly<GrokBotPorts>,
  input: Readonly<GrokBotInput>,
  attemptsLeft = SAVE_ATTEMPTS,
): Promise<GrokBotSaveOutcome> {
  const { secrets } = ports;

  if (secrets === null) return { kind: "secret-missing" };

  const stored = await loadStored(ports);
  const webhookUrl = grokBotAddressOf(input.webhookUrl);

  if (input.key === undefined) {
    return stored?.key !== null && stored?.row.webhookUrl === webhookUrl
      ? { kind: "saved", view: viewOf(true, stored) }
      : { kind: "key-needed" };
  }

  const row = {
    id: 1,
    webhookUrl,
    sealedKey: await secrets.seal(input.key),
    updatedAt: Date.now(),
  };

  const written = await guardedBatch(ports.db, unchangedSince(ports, stored), [
    ports.db
      .insert(grokBotSettings)
      .values(row)
      .onConflictDoUpdate({ target: grokBotSettings.id, set: row }),
  ]);

  if (written) return { kind: "saved", view: await readGrokBot(ports) };

  if (attemptsLeft <= 1)
    throw new Error("The Grok Bot settings changed during every attempt to save.");

  return saveGrokBot(ports, input, attemptsLeft - 1);
}

export async function removeGrokBot(ports: Readonly<GrokBotPorts>): Promise<GrokBotView> {
  await ports.db.delete(grokBotSettings).where(eq(grokBotSettings.id, 1));

  return viewOf(ports.secrets !== null, null);
}

export function resultOfStatus(status: number): GrokBotResult {
  if (status === OK) return "ok";

  if (WRONG_KEY_STATUSES.has(status)) return "wrong-key";

  return status === NOT_FOUND ? "not-found" : "bot-error";
}

function resultOfFailure(
  reason: NetworkFailureReason | null,
  deadline: AbortSignal,
): GrokBotResult {
  if (deadline.aborted) return "timeout";

  return reason ?? "unreachable";
}

function anySignal(deadline: AbortSignal, signal: AbortSignal | undefined): AbortSignal {
  return signal === undefined ? deadline : AbortSignal.any([signal, deadline]);
}

async function discarded(body: AsyncIterable<Uint8Array>): Promise<void> {
  let seen = 0;

  for await (const chunk of body) {
    seen += chunk.length;

    if (seen >= ANSWER_BYTES) break;
  }
}

export interface GrokBotPost {
  readonly result: GrokBotResult;
  readonly status: number | null;
}

type GrokBotConnection =
  | { readonly kind: "ready"; readonly row: SavedRow; readonly key: string }
  | { readonly kind: "unready"; readonly reason: "secret-missing" | "not-configured" | "refused" };

export async function grokBotConnection(ports: Readonly<GrokBotPorts>): Promise<GrokBotConnection> {
  if (ports.secrets === null) return { kind: "unready", reason: "secret-missing" };

  const stored = await loadStored(ports);

  if (stored === null) return { kind: "unready", reason: "not-configured" };

  const { row, key } = stored;

  if (key === null) return { kind: "unready", reason: "secret-missing" };

  if (!allowedGrokBotUrl(row.webhookUrl)) return { kind: "unready", reason: "refused" };

  return { kind: "ready", row, key };
}

export async function postToGrokBot(
  network: Network,
  { row, key }: Readonly<{ row: SavedRow; key: string }>,
  { body, signal }: Readonly<{ body: string; signal?: AbortSignal | undefined }>,
): Promise<GrokBotPost> {
  const deadline = AbortSignal.timeout(HOP_DEADLINE_MS);

  try {
    const response = await network.post(row.webhookUrl, body, anySignal(deadline, signal), {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "x-automation-key": key,
    });

    await discarded(response.body).catch(() => null);

    return { result: resultOfStatus(response.status), status: response.status };
  } catch (error) {
    return {
      result: resultOfFailure(error instanceof NetworkFailure ? error.reason : null, deadline),
      status: null,
    };
  }
}

export async function pingGrokBot(
  ports: Readonly<PingPorts>,
  signal: AbortSignal,
): Promise<GrokBotResult> {
  const connection = await grokBotConnection(ports);

  if (connection.kind === "unready") return connection.reason;

  const sent = await postToGrokBot(ports.network, connection, { body: PING_BODY, signal });

  console.warn(JSON.stringify({ event: "grok-bot-ping", ...sent }));

  return sent.result;
}
