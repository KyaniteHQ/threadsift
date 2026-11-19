import { and, eq, exists, sql } from "drizzle-orm";

import { type GrokBotInput, type GrokBotView, grokBotAddressOf } from "./grok-bot-contract.ts";
import { grokBotSettings } from "./grok-bot-tables.ts";
import { guardedBatch, holdsNoRow } from "./guards.ts";
import type { Ports } from "./ports.ts";

export type GrokBotPorts = Pick<Ports, "db" | "secrets">;

export type SavedGrokBot = typeof grokBotSettings.$inferSelect;

export interface OpenedGrokBot {
  readonly row: SavedGrokBot;
  readonly key: string | null;
}

type GrokBotSaveOutcome =
  | { readonly kind: "saved"; readonly view: GrokBotView }
  | { readonly kind: "secret-missing" }
  | { readonly kind: "key-needed" }
  | { readonly kind: "changed" };

export async function openedGrokBot(
  secrets: GrokBotPorts["secrets"],
  row: Readonly<SavedGrokBot> | undefined,
): Promise<OpenedGrokBot | null> {
  if (row === undefined) return null;

  return { row, key: secrets === null ? null : await secrets.open(row.sealedKey) };
}

export async function loadGrokBot(ports: Readonly<GrokBotPorts>): Promise<OpenedGrokBot | null> {
  const [row] = await ports.db.select().from(grokBotSettings).where(eq(grokBotSettings.id, 1));

  return openedGrokBot(ports.secrets, row);
}

function viewOf(secretReady: boolean, opened: Readonly<OpenedGrokBot> | null): GrokBotView {
  if (opened === null) {
    return { configured: false, webhookUrl: null, key: secretReady ? "none" : "missing" };
  }

  const { webhookUrl } = opened.row;

  if (!secretReady) return { configured: true, webhookUrl, key: "missing" };

  return { configured: true, webhookUrl, key: opened.key === null ? "unreadable" : "usable" };
}

export async function readGrokBot(ports: Readonly<GrokBotPorts>): Promise<GrokBotView> {
  return viewOf(ports.secrets !== null, await loadGrokBot(ports));
}

function unchangedSince(ports: Readonly<GrokBotPorts>, opened: Readonly<OpenedGrokBot> | null) {
  if (opened === null) {
    return holdsNoRow(ports.db, grokBotSettings, sql`${grokBotSettings.id} = 1`);
  }

  const { row } = opened;

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
): Promise<GrokBotSaveOutcome> {
  const { secrets } = ports;

  if (secrets === null) return { kind: "secret-missing" };

  const opened = await loadGrokBot(ports);
  const webhookUrl = grokBotAddressOf(input.webhookUrl);

  if (input.key === undefined) {
    return opened?.key !== null && opened?.row.webhookUrl === webhookUrl
      ? { kind: "saved", view: viewOf(true, opened) }
      : { kind: "key-needed" };
  }

  const row = {
    id: 1,
    webhookUrl,
    sealedKey: await secrets.seal(input.key),
    updatedAt: Date.now(),
  };

  const written = await guardedBatch(ports.db, unchangedSince(ports, opened), [
    ports.db
      .insert(grokBotSettings)
      .values(row)
      .onConflictDoUpdate({ target: grokBotSettings.id, set: row }),
  ]);

  if (written) return { kind: "saved", view: await readGrokBot(ports) };

  return { kind: "changed" };
}

export async function removeGrokBot(
  ports: Readonly<GrokBotPorts>,
): Promise<{ readonly kind: "removed"; readonly view: GrokBotView } | { readonly kind: "in-use" }> {
  await ports.db
    .delete(grokBotSettings)
    .where(and(eq(grokBotSettings.id, 1), eq(grokBotSettings.useAsProvider, false)));

  const [kept] = await ports.db
    .select({ id: grokBotSettings.id })
    .from(grokBotSettings)
    .where(eq(grokBotSettings.id, 1));

  return kept === undefined
    ? { kind: "removed", view: viewOf(ports.secrets !== null, null) }
    : { kind: "in-use" };
}
