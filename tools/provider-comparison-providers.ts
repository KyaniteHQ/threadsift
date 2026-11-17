import { z } from "zod";

import {
  type AiExecution,
  type AiTaskRequest,
  PROVIDERS,
  ModelDigestSchema,
} from "../src/core/ai-contract.ts";
import { claudeCode } from "../src/targets/node/claude-code.ts";
import { Slots } from "../src/targets/node/cli-slots.ts";
import { codexCli } from "../src/targets/node/codex-cli.ts";
import { runHttp } from "../src/targets/shared/ai-executor.ts";
import type { CliRunner } from "../src/targets/shared/ai-runtime.ts";
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
type DigestRequest = Omit<AiTaskRequest<z.infer<typeof ModelDigestSchema>>, "config">;

export type PreparedProvider =
  | { readonly kind: "unavailable"; readonly reason: string }
  | {
      readonly kind: "ready";
      readonly run: (
        task: Readonly<DigestRequest>,
        signal: AbortSignal,
      ) => Promise<AiExecution<z.infer<typeof ModelDigestSchema>>>;
      readonly stop: () => void;
    };

async function preparedCli(
  runner: CliRunner | null,
  spec: Readonly<ProviderSpec>,
): Promise<PreparedProvider> {
  if (runner === null) return { kind: "unavailable", reason: "cli-missing-or-surface-refused" };
  if (!(await runner.signedIn())) {
    runner.stop();

    return { kind: "unavailable", reason: "cli-not-signed-in" };
  }

  return {
    kind: "ready",
    stop: () => {
      runner.stop();
    },
    run: (task, signal) =>
      runner.run(
        { ...task, config: { kind: "cli", provider: runner.provider, model: spec.model } },
        signal,
      ),
  };
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

      if (!response.ok) throw new Error("Workers AI request refused");
      const body = z
        .object({ success: z.literal(true), result: z.json() })
        .parse(await response.json());

      return body.result;
    },
  });

  return {
    kind: "ready",
    stop: () => {},
    run: (task, signal) =>
      runner(
        { ...task, config: { kind: "binding", provider: "workers-ai", model: spec.model } },
        signal,
      ),
  };
}

function openRouter(spec: Readonly<ProviderSpec>): PreparedProvider {
  if (!spec.model.endsWith(":free") && spec.model !== "openrouter/free")
    return { kind: "unavailable", reason: "openrouter-model-must-be-free" };
  const key = process.env["OPENROUTER_API_KEY"];

  if (key === undefined || key === "")
    return { kind: "unavailable", reason: "openrouter-key-missing" };

  return {
    kind: "ready",
    stop: () => {},
    run: (task, signal) =>
      runHttp(
        fetch,
        {
          ...task,
          config: {
            kind: "http",
            provider: "openrouter",
            baseUrl: PROVIDERS.openrouter.url,
            model: spec.model,
            key,
          },
        },
        signal,
        true,
      ),
  };
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
