import { z } from "zod";

import { type AiConnection, PROVIDERS } from "../src/core/ai-contract.ts";
import type { AiRuntime } from "../src/core/ports.ts";
import { claudeCode } from "../src/targets/node/claude-code.ts";
import { Slots } from "../src/targets/node/cli-slots.ts";
import { codexCli } from "../src/targets/node/codex-cli.ts";
import { type CliRunner, aiAndSecrets } from "../src/targets/shared/ai-runtime.ts";
import { bindingRunner } from "../src/targets/worker/ai-binding.ts";

export const ProvidersSchema = z
  .array(
    z.strictObject({
      id: z.string().regex(/^[a-z0-9-]+$/u),
      provider: z.enum(["claude-code", "codex", "workers-ai", "openrouter", "grok-bot"]),
      model: z.string().max(240),
    }),
  )
  .min(1)
  .readonly();

export type ProviderSpec = z.infer<typeof ProvidersSchema>[number];
type Adapters = Pick<Parameters<typeof aiAndSecrets>[0], "cli" | "binding">;

export type PreparedProvider =
  | { readonly kind: "unavailable"; readonly reason: string }
  | {
      readonly kind: "ready";
      readonly config: AiConnection;
      readonly run: AiRuntime["run"];
      readonly stop: () => void;
    };

async function ready(
  config: AiConnection,
  adapters: Readonly<Adapters> = {},
): Promise<PreparedProvider> {
  const { ai } = await aiAndSecrets({
    publicOnly: false,
    secretKey: undefined,
    request: fetch,
    openRouterMaxPriceZero: "true",
    ...adapters,
  });

  return {
    kind: "ready",
    config,
    run: ai.run,
    stop: () => {
      for (const runner of adapters.cli ?? []) runner.stop();
    },
  };
}

async function preparedCli(
  runner: CliRunner | null,
  spec: Readonly<ProviderSpec>,
): Promise<PreparedProvider> {
  if (runner === null) return { kind: "unavailable", reason: "cli-missing-or-surface-refused" };
  if (!(await runner.signedIn())) {
    runner.stop();

    return { kind: "unavailable", reason: "cli-not-signed-in" };
  }

  return ready({ kind: "cli", provider: runner.provider, model: spec.model }, { cli: [runner] });
}

function workersAi(spec: Readonly<ProviderSpec>): Promise<PreparedProvider> {
  const account = process.env["CLOUDFLARE_ACCOUNT_ID"];
  const token = process.env["CLOUDFLARE_WORKERS_AI_TOKEN"];

  if (account === undefined || account === "" || token === undefined || token === "")
    return Promise.resolve({ kind: "unavailable", reason: "workers-ai-credentials-missing" });
  const runner = bindingRunner({
    run: async (model, inputs, { signal }) => {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${model}`,
        {
          method: "POST",
          signal,
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify(inputs),
        },
      );

      if (!response.ok) throw new Error("Workers AI request refused");
      const body = z
        .object({ success: z.literal(true), result: z.json() })
        .parse(await response.json());

      return body.result;
    },
  });

  return ready({ kind: "binding", provider: "workers-ai", model: spec.model }, { binding: runner });
}

function openRouter(spec: Readonly<ProviderSpec>): Promise<PreparedProvider> {
  if (!spec.model.endsWith(":free") && spec.model !== "openrouter/free")
    return Promise.resolve({ kind: "unavailable", reason: "openrouter-model-must-be-free" });
  const key = process.env["OPENROUTER_API_KEY"];

  if (key === undefined || key === "")
    return Promise.resolve({ kind: "unavailable", reason: "openrouter-key-missing" });

  return ready({
    kind: "http",
    provider: "openrouter",
    baseUrl: PROVIDERS.openrouter.url,
    model: spec.model,
    key,
  });
}

export async function prepareProvider(
  spec: Readonly<ProviderSpec>,
  stateDir: string,
): Promise<PreparedProvider> {
  const slots = new Slots(1);
  const path = process.env["PATH"] ?? "";

  switch (spec.provider) {
    case "claude-code":
      return preparedCli(
        await claudeCode(
          {
            path,
            configDir: process.env["CLAUDE_CONFIG_DIR"],
            token: process.env["CLAUDE_CODE_OAUTH_TOKEN"],
          },
          slots,
        ),
        spec,
      );
    case "codex":
      return preparedCli(
        await codexCli({ path, home: process.env["CODEX_HOME"], dataDir: stateDir }, slots),
        spec,
      );
    case "workers-ai":
      return workersAi(spec);
    case "grok-bot":
      return { kind: "unavailable", reason: "bot-callback-fixed-to-live-instance" };
    case "openrouter":
      return openRouter(spec);
    default: {
      const exhaustive: never = spec.provider;

      return exhaustive;
    }
  }
}
