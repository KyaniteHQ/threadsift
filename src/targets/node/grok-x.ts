import { join } from "node:path";

import type { XFetch, XFetcher, XFetcherStatus } from "../../core/x-fetcher.ts";
import { Slots, inSlot } from "./cli-slots.ts";
import { findBinary } from "./cli-support.ts";
import {
  type Outcome,
  type Refused,
  SURFACE_REFUSAL,
  internal,
  logged,
  outcomeOf,
  refusalOf,
  refused,
  versionRefusal,
} from "./grok-answer.ts";
import { identityOf, inRunFolders } from "./grok-folders.ts";
import { type GrokCli, grokCli } from "./grok-process.ts";
import {
  type BinaryIdentity,
  type PreflightResult,
  type Proof,
  UNPROVEN,
  afterPreflight,
  checkedRun,
  exitedCleanly,
  permission,
  preflightResultOf,
  sameBinary,
} from "./grok-proof.ts";
import { sharedReading } from "./grok-status.ts";
import { PREFLIGHT_PROMPT, PROVEN_VERSION, fetchPrompt, isProvenVersion } from "./grok-surface.ts";

const BINARY = "grok";
const FETCH_WIDTH = 2;
const PREFLIGHT_MS = 60_000;

export interface GrokEnvironment {
  readonly path: string;
  readonly home: string | undefined;
  readonly dataDir: string;
}

export interface StoppableXFetcher extends XFetcher {
  readonly stop: () => void;
}

interface Preflight {
  readonly result: PreflightResult;
  readonly failure: Refused | null;
}

const NO_BINARY = refused({ status: "unreadable", category: "spawn-failed" }, null);

const OUT_OF_TIME = refused({ status: "timeout", category: "deadline" }, null);

function inconclusive(failure: Refused): Preflight {
  return { result: { kind: "inconclusive" }, failure };
}

class GrokXFetcher implements StoppableXFetcher {
  readonly id = "grok-cli";
  private readonly cli: GrokCli;
  private readonly shutdown = new AbortController();
  private readonly slots = new Slots(FETCH_WIDTH);
  private proof: Proof = UNPROVEN;
  private proving: Promise<Refused | null> | null = null;
  private readonly read: ReturnType<typeof sharedReading>;

  constructor(cli: GrokCli) {
    this.cli = cli;
    this.read = sharedReading(cli, this.shutdown.signal);
  }

  stop(): void {
    this.shutdown.abort();
  }

  readonly status = async (): Promise<XFetcherStatus> => {
    const { version, signedIn } = await this.read();

    if (version === null) return { state: "unknown", version };

    const identity = await identityOf(this.cli.path);
    const barred = identity !== null && permission(this.proof, identity) === "refused";

    if (barred || !isProvenVersion(version)) return { state: "not-proven", version };

    return { state: signedIn, version };
  };

  readonly fetch = async (statusId: string, signal: AbortSignal): Promise<XFetch> => {
    const started = Date.now();
    const prompt = fetchPrompt(statusId);
    const stop = AbortSignal.any([signal, this.shutdown.signal]);

    const outcome = await inSlot(this.slots, stop, () =>
      this.attempt(prompt, stop).catch(internal),
    );

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
    const run = this.preflight(signal).then(({ result, failure }) => {
      this.proof = afterPreflight(identity, result);

      return failure;
    }, internal);

    this.proving = run;

    try {
      return await run;
    } finally {
      this.proving = null;
    }
  }

  private preflight(signal: AbortSignal) {
    return inRunFolders(async (folders): Promise<Preflight> => {
      const stop = AbortSignal.any([signal, AbortSignal.timeout(PREFLIGHT_MS)]);
      const { end, version } = await this.cli.version(folders, stop);

      if (version === null) return inconclusive(versionRefusal(end));

      if (!isProvenVersion(version)) {
        return { result: preflightResultOf("version-changed", version), failure: null };
      }

      const run = await this.cli.run(folders, PREFLIGHT_PROMPT, stop);
      const check = checkedRun(run);

      if (check.kind === "barred") {
        return { result: preflightResultOf(check.verdict, version), failure: null };
      }

      if (check.kind === "surface-held" && exitedCleanly(run)) {
        return { result: preflightResultOf("proven", version), failure: null };
      }

      return inconclusive(check.kind === "surface-held" ? refusalOf(run.end) : check.refusal);
    });
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
        this.proof = {
          kind: "refused",
          binary: identity,
          verdict: check.verdict,
          version: PROVEN_VERSION,
        };

        return SURFACE_REFUSAL;
      case "discard":
      case "reprove":
        this.proof = UNPROVEN;

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
}: Readonly<GrokEnvironment>): Promise<StoppableXFetcher | null> {
  const binary = await findBinary(path, BINARY);

  if (binary === null) return null;

  return new GrokXFetcher(grokCli(binary, join(home ?? join(dataDir, "grok"), "auth.json")));
}
