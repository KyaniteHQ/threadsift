import type { XFetch, XFetcher, XFetcherStatus } from "../../core/kernel/x-fetcher-port.ts";
import { findBinary } from "./cli-process.ts";
import {
  type Outcome,
  type Refused,
  SURFACE_REFUSAL,
  internal,
  logged,
  outcomeOf,
  refused,
} from "./grok-answer.ts";
import { type BinaryIdentity, authFileOf, identityOf, inRunFolders } from "./grok-folders.ts";
import { type GrokCli, grokCli } from "./grok-process.ts";
import {
  type Proof,
  UNPROVEN,
  afterPreflight,
  afterRun,
  checkedRun,
  keptBar,
  permission,
  sameBinary,
} from "./grok-proof.ts";
import { GrokSlots } from "./grok-slots.ts";
import { sharedReading } from "./grok-status.ts";
import { fetchPrompt } from "./grok-surface.ts";
import { trialOf } from "./grok-trial.ts";
import { type UpdateHost, type Updates, grokUpdates } from "./grok-update.ts";

const BINARY = "grok";

export interface GrokEnvironment {
  readonly path: string;
  readonly home: string | undefined;
  readonly dataDir: string;
  readonly autoUpdate: boolean;
}

export interface StoppableXFetcher extends XFetcher {
  readonly stop: () => void;
}

const NO_BINARY = refused({ status: "unreadable", category: "spawn-failed" }, null);

const OUT_OF_TIME = refused({ status: "timeout", category: "deadline" }, null);

class GrokXFetcher implements StoppableXFetcher, UpdateHost {
  readonly id = "grok-cli";
  private readonly cli: GrokCli;
  private readonly shutdown = new AbortController();
  private readonly slots = new GrokSlots();
  private proof: Proof = UNPROVEN;
  private proving: Promise<Refused | null> | null = null;
  private fetches = 0;
  private updates: Updates | null = null;
  private readonly read: ReturnType<typeof sharedReading>;

  constructor(cli: GrokCli) {
    this.cli = cli;
    this.read = sharedReading(cli, this.shutdown.signal);
  }

  stop(): void {
    this.updates?.stop();
    this.shutdown.abort();
  }

  follow(updates: Readonly<Updates>): void {
    this.updates = updates;
  }

  readonly idle = (): boolean => this.fetches === 0 && this.proving === null;

  readonly installed = (binary: Readonly<BinaryIdentity> | null): void => {
    this.proof = binary === null ? UNPROVEN : { kind: "proven", binary };
  };

  readonly status = async (): Promise<XFetcherStatus> => {
    const { version, signedIn } = await this.read();
    const refusedUpdate = this.updates?.refusedUpdate() ?? null;

    if (version === null) return { state: "unknown", version, refusedUpdate };

    const identity = await identityOf(this.cli.path);
    const barred = identity !== null && permission(this.proof, identity) === "refused";

    return { state: barred ? "not-proven" : signedIn, version, refusedUpdate };
  };

  readonly fetch = async (statusId: string, signal: AbortSignal): Promise<XFetch> => {
    const started = Date.now();
    const prompt = fetchPrompt(statusId);
    const stop = AbortSignal.any([signal, this.shutdown.signal]);

    const outcome = await this.slots.run(stop, async (run) => {
      this.fetches += 1;

      try {
        return await this.attempt(prompt, run).catch(internal);
      } finally {
        this.fetches -= 1;
      }
    });

    return logged(outcome ?? OUT_OF_TIME, Date.now() - started);
  };

  private async attempt(prompt: string, signal: AbortSignal): Promise<Outcome> {
    const identity = await identityOf(this.cli.path);

    if (identity === null) return NO_BINARY;

    const barred = await this.gate(identity, signal);

    if (barred !== null) return barred;

    if (!sameBinary(identity, await identityOf(this.cli.path))) return SURFACE_REFUSAL;

    return this.fetched(identity, prompt, signal);
  }

  private async gate(
    identity: Readonly<BinaryIdentity>,
    signal: AbortSignal,
  ): Promise<Refused | null> {
    if (this.proving !== null) {
      await this.proving;

      return this.gate(identity, signal);
    }

    const decision = permission(this.proof, identity);

    switch (decision) {
      case "allowed":
        return null;
      case "refused":
        return SURFACE_REFUSAL;
      case "preflight":
        return (await this.proveOnce(identity, signal)) ?? this.gate(identity, signal);
      default: {
        const exhaustive: never = decision;

        return exhaustive;
      }
    }
  }

  private async proveOnce(
    identity: Readonly<BinaryIdentity>,
    signal: AbortSignal,
  ): Promise<Refused | null> {
    const run = trialOf(this.cli, signal).then(({ result, failure }) => {
      this.proof = keptBar(this.proof, identity, afterPreflight(identity, result));

      return failure;
    }, internal);

    this.proving = run;

    try {
      return await run;
    } finally {
      this.proving = null;
    }
  }

  private async fetched(
    identity: Readonly<BinaryIdentity>,
    prompt: string,
    signal: AbortSignal,
  ): Promise<Outcome> {
    const run = await inRunFolders((folders) => this.cli.run(folders, prompt, signal));
    const check = checkedRun(run);

    switch (check.kind) {
      case "surface-held":
        return outcomeOf(run.end);
      case "barred":
        this.proof = afterRun(this.proof, identity, {
          kind: "refused",
          binary: identity,
          verdict: check.verdict,
        });

        return SURFACE_REFUSAL;
      case "discard":
      case "reprove":
        this.proof = afterRun(this.proof, identity, UNPROVEN);

        return check.refusal;
      case "keep":
        return check.refusal;
      default: {
        const exhaustive: never = check;

        return exhaustive;
      }
    }
  }
}

export async function grokXFetcher({
  path,
  home,
  dataDir,
  autoUpdate,
}: Readonly<GrokEnvironment>): Promise<StoppableXFetcher | null> {
  const binary = await findBinary(path, BINARY);

  if (binary === null) return null;

  const authFile = authFileOf(home, dataDir);
  const fetcher = new GrokXFetcher(grokCli(binary, authFile));

  if (autoUpdate) fetcher.follow(await grokUpdates({ binary, authFile, dataDir }, fetcher));

  return fetcher;
}
