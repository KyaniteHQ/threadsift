import { type GrokBotUnreadyReason, allowedGrokBotUrl } from "../contract/grok-bot-contract.ts";
import {
  type GrokBotPorts,
  type OpenedGrokBot,
  type SavedGrokBot,
  loadGrokBot,
} from "./grok-bot-settings.ts";

type GrokBotConnection =
  | { readonly kind: "ready"; readonly row: SavedGrokBot; readonly key: string }
  | { readonly kind: "unready"; readonly reason: GrokBotUnreadyReason };

export function connectionOf(
  secrets: GrokBotPorts["secrets"],
  opened: Readonly<OpenedGrokBot> | null,
): GrokBotConnection {
  if (secrets === null) return { kind: "unready", reason: "secret-missing" };

  if (opened === null) return { kind: "unready", reason: "not-configured" };

  const { row, key } = opened;

  if (key === null) return { kind: "unready", reason: "secret-missing" };

  if (!allowedGrokBotUrl(row.webhookUrl)) return { kind: "unready", reason: "refused" };

  return { kind: "ready", row, key };
}

export async function grokBotConnection(ports: Readonly<GrokBotPorts>): Promise<GrokBotConnection> {
  return connectionOf(ports.secrets, await loadGrokBot(ports));
}

export function unreadyAsProvider(
  reason: GrokBotUnreadyReason,
): "secret-missing" | "not-configured" {
  return reason === "secret-missing" ? "secret-missing" : "not-configured";
}
