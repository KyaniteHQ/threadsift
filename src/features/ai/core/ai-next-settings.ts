import {
  type AiRefused,
  type CliAiConnection,
  refusedAi,
} from "../../../core/contract/ai-contract.ts";
import type { AiSettingsInput } from "../../../core/contract/ai-settings-contract.ts";
import {
  PROVIDERS,
  type ProviderOf,
  hasKind,
  keyApplies,
  withoutTrailingSlashes,
} from "../../../core/contract/provider-families.ts";
import type { settings } from "../../../core/kernel/ai-settings-tables.ts";
import type { AiPorts } from "../../../core/kernel/ports.ts";
import type { Sealer } from "../../../core/kernel/sealed-secret.ts";
import { allowsUrl, recommendationsOf, resolveCli, signedIn } from "./ai-run.ts";
import type { Stored } from "./provider-row.ts";

export type ModelSettingsInput = Exclude<AiSettingsInput, { readonly provider: ProviderOf<"bot"> }>;
type SettingsRow = Readonly<Omit<typeof settings.$inferSelect, "id">>;
type SettingsRefusal = AiRefused | { readonly kind: "recommendation-unavailable" };

async function nextCliSettings(
  ports: AiPorts,
  config: Readonly<CliAiConnection>,
  saved: Readonly<Stored> | undefined,
): Promise<SettingsRow | SettingsRefusal> {
  const { provider, choice } = config;
  if (
    choice === "recommended" &&
    recommendationsOf(ports.ai)[provider] === undefined &&
    !(saved?.provider === provider && saved.preference.choice === "recommended")
  )
    return { kind: "recommendation-unavailable" } as const;

  const selection = resolveCli(ports.ai, config);
  if (selection.kind === "refused") return selection;
  if (!(await signedIn(ports.ai)).includes(provider)) return refusedAi("not-configured");

  return {
    provider,
    model: choice === "custom" ? config.model : "",
    effort: choice === "custom" ? (config.effort ?? null) : null,
    cliChoice: choice,
    baseUrl: null,
    sealedKey: null,
  } as const;
}

export async function nextSettings(
  ports: AiPorts,
  { sealer, saved }: Readonly<{ sealer: Sealer | null; saved: Stored | undefined }>,
  input: Readonly<ModelSettingsInput>,
): Promise<SettingsRow | SettingsRefusal> {
  if (hasKind("binding", input))
    return { ...input, effort: null, cliChoice: "custom", baseUrl: null, sealedKey: null } as const;

  if (hasKind("cli", input)) return nextCliSettings(ports, { ...input, kind: "cli" }, saved);

  if (sealer === null) return refusedAi("secret-missing");

  const baseUrl =
    "baseUrl" in input ? withoutTrailingSlashes(input.baseUrl) : PROVIDERS[input.provider].url;

  if (!allowsUrl(ports.ai, baseUrl)) return refusedAi("refused");

  const same =
    saved !== undefined &&
    saved.sealedKey !== null &&
    keyApplies(saved, { provider: input.provider, baseUrl, model: input.model });

  if (input.key === undefined && !same) return refusedAi("key-needed");

  const key = input.key ?? (same ? await sealer.open(saved.sealedKey) : null);

  if (key === null) return refusedAi("secret-missing");

  return {
    provider: input.provider,
    model: input.model,
    baseUrl,
    sealedKey: await sealer.seal(key),
    effort: null,
    cliChoice: "custom",
  } as const;
}
