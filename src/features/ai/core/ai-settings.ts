import { type SQL, sql } from "drizzle-orm";

import type { AiRefused } from "../../../core/contract/ai-contract.ts";
import type {
  AiSettingsInput,
  AiSettingsView,
} from "../../../core/contract/ai-settings-contract.ts";
import { GROK_BOT_PROVIDER, hasKind } from "../../../core/contract/provider-families.ts";
import { CURRENT_REVISION } from "../../../core/kernel/ai-settings-revision.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { requeuedDigests } from "../../../core/kernel/digest-opening.ts";
import type { JobWrites } from "../../../core/kernel/job-outcome.ts";
import type { Ports, SettingsPorts } from "../../../core/kernel/ports.ts";
import { type Closed, heldBatch, isClosed, whileOpen } from "../../../core/kernel/restore-hold.ts";
import { settings } from "../../../core/kernel/schema.ts";
import { type LoadedAi, type Snapshot, loadAiConfig } from "./ai-load.ts";
import { type ModelSettingsInput, nextSettings } from "./ai-next-settings.ts";
import { providersOf, recommendationsOf, signedIn } from "./ai-run.ts";
import { type BotFirst, leaveGrokBotWrites, preparedBot } from "./bot-provider.ts";

async function aiView(loaded: LoadedAi, ports: SettingsPorts): Promise<AiSettingsView> {
  return {
    settings: viewOf(loaded, loaded.state !== "secret-missing"),
    providers: providersOf(ports.ai),
    signedIn: await signedIn(ports.ai),
    recommendations: recommendationsOf(ports.ai),
    secretReady: ports.secrets !== null,
    publicOnly: ports.ai.publicOnly,
    revision: loaded.revision,
    connect: ports.config.publicOrigin !== null,
  };
}

function viewOf(
  { saved, botSelected }: Readonly<Snapshot>,
  keyReadable: boolean,
): AiSettingsView["settings"] {
  if (botSelected) return { provider: GROK_BOT_PROVIDER, model: "" };

  return saved?.view(keyReadable) ?? null;
}

export async function readAiSettings(ports: SettingsPorts): Promise<AiSettingsView> {
  return aiView(await loadAiConfig(ports), ports);
}

export async function prepareAiSettings(ports: SettingsPorts, input: Readonly<ModelSettingsInput>) {
  const loaded = await loadAiConfig(ports);
  const next = await nextSettings(ports, loaded, input);

  return "kind" in next
    ? next
    : ({
        row: { id: 1, ...next },
        revision: loaded.revision,
        leavesBot: loaded.botSelected,
      } as const);
}

type Prepared = Exclude<
  Awaited<ReturnType<typeof prepareAiSettings>>,
  { readonly kind: "refused" | "recommendation-unavailable" }
>;

export type PreparedSave = Prepared;

export function providerWrites(db: Database, { row, leavesBot }: Readonly<Prepared>): JobWrites {
  return [
    db.insert(settings).values(row).onConflictDoUpdate({ target: settings.id, set: row }),
    ...(leavesBot ? leaveGrokBotWrites(db, Date.now()) : []),
  ];
}

async function preparedSave(ports: SettingsPorts, input: Readonly<AiSettingsInput>) {
  if (hasKind("bot", input)) return preparedBot(ports);

  const prepared = await prepareAiSettings(ports, input);

  if ("kind" in prepared) return prepared;

  return {
    guard: sql`${CURRENT_REVISION} = ${prepared.revision}`,
    writes: providerWrites(ports.db, prepared),
  };
}

type SavedAi =
  | { readonly kind: "saved"; readonly view: AiSettingsView }
  | AiRefused
  | { readonly kind: "changed" }
  | { readonly kind: "recommendation-unavailable" }
  | { readonly kind: "provider-not-offered" }
  | Closed
  | BotFirst;

export async function saveWithDigests(
  ports: Pick<Ports, "db" | "jobs">,
  guard: SQL,
  writes: JobWrites,
): Promise<boolean | Closed> {
  const saved = await whileOpen(async () => {
    const written = await heldBatch(ports.db, [...writes, ...requeuedDigests(ports.db)], guard);

    return written !== null;
  });

  if (saved === true) ports.jobs.wake();

  return saved;
}

export async function saveAiSettings(
  ports: SettingsPorts & Pick<Ports, "jobs">,
  input: Readonly<AiSettingsInput>,
): Promise<SavedAi> {
  if (!providersOf(ports.ai).includes(input.provider)) return { kind: "provider-not-offered" };

  const prepared = await preparedSave(ports, input);

  if ("kind" in prepared) return prepared;

  const written = await saveWithDigests(ports, prepared.guard, prepared.writes);

  if (isClosed(written)) return written;

  if (written) return { kind: "saved", view: await readAiSettings(ports) };

  return { kind: "changed" };
}
