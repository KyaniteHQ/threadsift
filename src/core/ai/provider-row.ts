import { z } from "zod";

import type { ModelAi } from "../contract/ai-contract.ts";
import type { AiSettingsView } from "../contract/ai-settings-contract.ts";
import {
  BindingProviderSchema,
  CliChoiceSchema,
  CliPreferenceSchema,
  CliProviderSchema,
  HttpProviderSchema,
} from "../contract/provider-families.ts";
import type { Sealer } from "../kernel/sealed-secret.ts";

const BindingRowSchema = z
  .object({
    provider: BindingProviderSchema,
    model: z.string(),
    baseUrl: z.null(),
    sealedKey: z.null(),
  })
  .transform(
    (row) =>
      ({
        ...row,
        connect: (): Promise<ModelAi> =>
          Promise.resolve({
            state: "ready",
            config: { kind: "binding", provider: row.provider, model: row.model },
          }),
        view: (): AiSettingsView["settings"] => ({ provider: row.provider, model: row.model }),
      }) as const,
  );

const CliRowSchema = z
  .object({
    provider: CliProviderSchema,
    model: z.string(),
    baseUrl: z.null(),
    sealedKey: z.null(),
    effort: z.string().nullable(),
    cliChoice: CliChoiceSchema,
  })
  .transform(({ provider, model, baseUrl, sealedKey, effort, cliChoice: choice }) => {
    const preference = CliPreferenceSchema.parse(
      choice === "custom" ? { choice, model, effort: effort ?? undefined } : { choice },
    );

    return {
      provider,
      baseUrl,
      sealedKey,
      preference,
      connect: (): Promise<ModelAi> =>
        Promise.resolve({ state: "ready", config: { kind: "cli", provider, ...preference } }),
      view: (): AiSettingsView["settings"] =>
        preference.choice === "custom"
          ? { provider, ...preference, effort: preference.effort ?? "" }
          : { provider, ...preference, model: "", effort: "" },
    } as const;
  });

const HttpRowSchema = z
  .object({
    provider: HttpProviderSchema,
    model: z.string(),
    baseUrl: z.string(),
    sealedKey: z.string(),
  })
  .transform(
    (row) =>
      ({
        ...row,
        connect: async (sealer: Readonly<Sealer> | null): Promise<ModelAi> => {
          const key = sealer === null ? null : await sealer.open(row.sealedKey);

          return key === null
            ? { state: "secret-missing" }
            : {
                state: "ready",
                config: {
                  kind: "http",
                  provider: row.provider,
                  baseUrl: row.baseUrl,
                  model: row.model,
                  key,
                },
              };
        },
        view: (keyReadable: boolean): AiSettingsView["settings"] => ({
          provider: row.provider,
          baseUrl: row.baseUrl,
          model: row.model,
          keySet: true,
          keyReadable,
        }),
      }) as const,
  );

export const StoredSettingsSchema = z.union([BindingRowSchema, CliRowSchema, HttpRowSchema]);

export type Stored = z.infer<typeof StoredSettingsSchema>;
