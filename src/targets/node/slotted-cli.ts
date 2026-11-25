import { z } from "zod";

import {
  type AiExecution,
  type AiTaskRequest,
  type CliAiConnection,
  type CliSelection,
  type ResolvedCliConnection,
  refusedAi,
} from "../../core/contract/ai-contract.ts";
import type { CliProvider } from "../../core/contract/provider-families.ts";
import type { CliRunner, RunnerTask } from "../../core/kernel/ai-runtime.ts";
import { report } from "../../core/kernel/failure-log.ts";
import { type ProcessEnd, type UnfinishedEnd, answerWithin } from "./cli-process.ts";
import { type Slots, inSlot } from "./cli-slots.ts";

export const STDOUT_CAP = 1024 * 1024;

export function exitCode(end: Readonly<ProcessEnd>): number | null {
  return end.kind === "exited" ? end.code : null;
}

export function endRefusal(end: UnfinishedEnd) {
  switch (end.kind) {
    case "aborted":
      return refusedAi("timeout");
    case "over-cap":
      return refusedAi("no-json");
    case "spawn-failed":
      return refusedAi("not-configured");
    default: {
      const exhaustive: never = end;

      return exhaustive;
    }
  }
}

export function outputSchema(schema: z.ZodType): string {
  return JSON.stringify(z.toJSONSchema(schema, { target: "draft-7" }));
}

export function promptOf({ instructions, input }: Readonly<AiTaskRequest<unknown>>): string {
  return `${instructions}\n\n${input}`;
}

const UNANSWERED_COUNTS_AS_SIGNED_IN = true;

const SIGN_IN_UNKNOWN = { kind: "sign-in-unknown" } as const;

export interface Attempt<Result> {
  readonly result: AiExecution<Result> | typeof SIGN_IN_UNKNOWN;
  readonly code: number | null;
}

export abstract class SlottedCli implements CliRunner {
  abstract readonly provider: CliProvider;
  abstract readonly recommendation: CliRunner["recommendation"];
  private readonly shutdown = new AbortController();
  private readonly slots: Slots;

  constructor(slots: Slots) {
    this.slots = slots;
  }

  protected abstract modelChoice(
    model: string,
  ): { readonly slug: string; readonly levels: readonly string[] } | undefined;

  resolve(config: Readonly<CliAiConnection>): CliSelection {
    const base = { kind: config.kind, provider: config.provider } as const;
    const defaults = { ...base, model: "", effort: undefined };
    const recommendation = this.recommendation;

    switch (config.choice) {
      case "cli-defaults":
        return defaults;
      case "recommended":
        return recommendation === undefined
          ? defaults
          : this.select({ ...base, ...recommendation });
      case "custom":
        return this.select({
          ...base,
          model: config.model === "" ? (recommendation?.model ?? "") : config.model,
          effort: config.effort,
        });
      default: {
        const exhaustive: never = config;
        return exhaustive;
      }
    }
  }

  private select(config: Readonly<ResolvedCliConnection>): CliSelection {
    const choice = this.modelChoice(config.model);
    if (choice === undefined) return refusedAi("model-not-found", 404);
    if (config.effort !== undefined && !choice.levels.includes(config.effort))
      return { ...refusedAi("invalid-effort"), levels: choice.levels };
    return { ...config, model: choice.slug };
  }

  protected abstract probe(signal: AbortSignal): Promise<boolean>;

  protected abstract attempt<Result>(
    task: RunnerTask<Result, "cli">,
    signal: AbortSignal,
  ): Promise<Attempt<Result>>;

  protected outcome<Result>(
    end: Readonly<ProcessEnd>,
    read: (
      exited: Readonly<Extract<ProcessEnd, { readonly kind: "exited" }>>,
    ) => AiExecution<Result> | null,
  ): Attempt<Result>["result"] {
    if (end.kind !== "exited") return endRefusal(end);

    return read(end) ?? SIGN_IN_UNKNOWN;
  }

  private async signInRefusal(stop: AbortSignal) {
    const signedIn = await answerWithin(
      stop,
      (signal) => this.probe(signal),
      UNANSWERED_COUNTS_AS_SIGNED_IN,
    );

    if (stop.aborted) return refusedAi("timeout");

    return refusedAi(signedIn ? "unreachable" : "not-configured");
  }

  stop(): void {
    this.shutdown.abort();
  }

  readonly signedIn = (): Promise<boolean> =>
    answerWithin(this.shutdown.signal, (signal) => this.probe(signal), false);

  readonly run = async <Result>(
    task: RunnerTask<Result, "cli">,
    signal: AbortSignal,
  ): Promise<AiExecution<Result>> => {
    const stop = AbortSignal.any([signal, this.shutdown.signal]);

    const done = await inSlot(this.slots, stop, () => this.attempt(task, stop));

    if (done === null) return refusedAi("timeout");

    const result =
      done.result.kind === SIGN_IN_UNKNOWN.kind ? await this.signInRefusal(stop) : done.result;

    if (result.kind === "refused") {
      report("cli-refused", { provider: this.provider, reason: result.reason, exit: done.code });
    }

    return result;
  };
}
