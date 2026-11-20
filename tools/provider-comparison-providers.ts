import { z } from "zod";

import type { AiConnection } from "../src/core/ai-contract.ts";
import { type AiRunner, runAi } from "../src/core/ai-run.ts";
import type { AiRuntime, CliRunner } from "../src/core/ai-runtime.ts";
import { bestEffort } from "../src/core/failure-log.ts";
import { AI_MODEL_MAX, PROVIDERS, isCliProvider } from "../src/core/provider-families.ts";
import { claudeCode } from "../src/targets/node/claude-code.ts";
import { findBinary } from "../src/targets/node/cli-process.ts";
import { Slots } from "../src/targets/node/cli-slots.ts";
import { codexCli } from "../src/targets/node/codex-cli.ts";
import { unsetWhenEmpty } from "../src/targets/shared/settings.ts";
import { bindingRunner } from "../src/targets/worker/ai-binding.ts";

const Id = z.string().regex(/^[a-z0-9-]+$/u);

export const ProvidersSchema = z
  .array(
    z.discriminatedUnion("provider", [
      z.strictObject({
        id: Id,
        provider: z.literal(PROVIDERS["claude-code"].id),
        model: PROVIDERS["claude-code"].fields.model.min(1),
        effort: PROVIDERS["claude-code"].fields.effort,
      }),
      z.strictObject({
        id: Id,
        provider: z.literal(PROVIDERS.codex.id),
        model: PROVIDERS.codex.fields.model.min(1),
        effort: PROVIDERS.codex.fields.effort,
      }),
      z.strictObject({
        id: Id,
        provider: z.literal(PROVIDERS["workers-ai"].id),
        model: PROVIDERS["workers-ai"].fields.model,
      }),
      z.strictObject({
        id: Id,
        provider: z.literal(PROVIDERS.openrouter.id),
        model: PROVIDERS.openrouter.fields.model,
      }),
      z.strictObject({
        id: Id,
        provider: z.literal(PROVIDERS["grok-bot"].id),
        model: z.string().trim().min(1).max(AI_MODEL_MAX),
      }),
    ]),
  )
  .min(1)
  .readonly();

export type ProviderSpec = z.infer<typeof ProvidersSchema>[number];
type Adapters = Partial<Pick<AiRuntime, "cli" | "binding">>;

export type PreparedProvider =
  | { readonly kind: "unavailable"; readonly reason: string }
  | {
      readonly kind: "ready";
      readonly config: AiConnection;
      readonly run: AiRunner;
      readonly stop: () => void;
    };

function ready(
  config: AiConnection,
  { cli = [], binding = null }: Readonly<Adapters> = {},
): PreparedProvider {
  const ai: AiRuntime = {
    publicOnly: false,
    zeroOpenRouterPrice: true,
    request: fetch,
    binding,
    cli,
  };

  return {
    kind: "ready",
    config,
    run: (task, signal) => runAi(ai, task, signal),
    stop: () => {
      for (const runner of cli) runner.stop();
    },
  };
}

async function preparedCli(
  runner: CliRunner | null,
  spec: Readonly<ProviderSpec>,
): Promise<PreparedProvider> {
  if (runner === null) return { kind: "unavailable", reason: "cli-setup-refused" };

  try {
    const config = runner.resolve({
      kind: "cli",
      provider: runner.provider,
      choice: "custom",
      model: spec.model,
      effort: "effort" in spec ? spec.effort : undefined,
    });
    if (config.kind === "refused") {
      runner.stop();
      return { kind: "unavailable", reason: config.reason };
    }
    if (await runner.signedIn()) return ready(config, { cli: [runner] });
    runner.stop();

    return { kind: "unavailable", reason: "cli-not-signed-in" };
  } catch (error) {
    await bestEffort({ event: "comparison-cli-not-stopped", fields: {} }, () => {
      runner.stop();
      return Promise.resolve();
    });
    throw error;
  }
}

function workersAi(spec: Readonly<ProviderSpec>): PreparedProvider {
  const account = process.env["CLOUDFLARE_ACCOUNT_ID"];
  const token = process.env["CLOUDFLARE_WORKERS_AI_TOKEN"];

  if (account === undefined || account === "" || token === undefined || token === "")
    return { kind: "unavailable", reason: "workers-ai-credentials-missing" };
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

      if (!response.ok) {
        const body = z
          .object({
            errors: z.array(z.object({ code: z.number().int(), message: z.string() })).min(1),
          })
          .parse(await response.json());
        const error = body.errors[0];

        if (error !== undefined) throw new Error(`${error.code}: ${error.message}`);
        throw new Error("Workers AI request refused");
      }
      const body = z
        .object({ success: z.literal(true), result: z.json() })
        .parse(await response.json());

      return body.result;
    },
  });

  return ready({ kind: "binding", provider: "workers-ai", model: spec.model }, { binding: runner });
}

function openRouter(spec: Readonly<ProviderSpec>): PreparedProvider {
  if (spec.model === "openrouter/free")
    return { kind: "unavailable", reason: "openrouter-router-not-comparable" };
  if (!spec.model.endsWith(":free"))
    return { kind: "unavailable", reason: "openrouter-model-must-be-free" };
  const key = process.env["OPENROUTER_API_KEY"];

  if (key === undefined || key === "")
    return { kind: "unavailable", reason: "openrouter-key-missing" };

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

  if (
    isCliProvider(spec.provider) &&
    (await findBinary(path, spec.provider === "codex" ? "codex" : "claude")) === null
  )
    return { kind: "unavailable", reason: "cli-missing" };

  switch (spec.provider) {
    case "claude-code":
      return preparedCli(
        await claudeCode(
          {
            path,
            configDir: unsetWhenEmpty(process.env["CLAUDE_CONFIG_DIR"]),
            token: unsetWhenEmpty(process.env["CLAUDE_CODE_OAUTH_TOKEN"]),
          },
          slots,
        ),
        spec,
      );
    case "codex":
      return preparedCli(
        await codexCli(
          { path, home: unsetWhenEmpty(process.env["CODEX_HOME"]), dataDir: stateDir },
          slots,
        ),
        spec,
      );
    case "workers-ai":
      return workersAi(spec);
    case "grok-bot":
      return { kind: "unavailable", reason: "bot-callback-fixed-to-live-instance" };
    case "openrouter":
      return openRouter(spec);
    default: {
      const exhaustive: never = spec;

      return exhaustive;
    }
  }
}
