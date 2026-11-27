import type { XFetch, XFetcher, XFetcherStatus } from "../../core/kernel/x-fetcher-port.ts";
import { findBinary } from "./cli-process.ts";
import { GrokAccess } from "./grok-access.ts";
import {
  type Outcome,
  SURFACE_REFUSAL,
  SURFACE_UNCONFIRMED,
  internal,
  logged,
  outcomeOf,
  refused,
} from "./grok-answer.ts";
import { type BinaryIdentity, authFileOf, identityOf, inRunFolders } from "./grok-folders.ts";
import { type GrokCli, grokCli } from "./grok-process.ts";
import { UNPROVEN, checkedRun, sameBinary } from "./grok-proof.ts";
import { sharedReading } from "./grok-status.ts";
import { fetchPrompt } from "./grok-surface.ts";
import { NO_UPDATES, type Updates, grokUpdates } from "./grok-update.ts";

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

class GrokXFetcher implements StoppableXFetcher {
  readonly id = "grok-cli";
  private readonly cli: GrokCli;
  private readonly access: Readonly<GrokAccess>;
  private readonly updates: Updates;
  private readonly shutdown = new AbortController();
  private readonly read: ReturnType<typeof sharedReading>;

  constructor(cli: GrokCli, access: Readonly<GrokAccess>, updates: Readonly<Updates>) {
    this.cli = cli;
    this.access = access;
    this.updates = updates;
    this.read = sharedReading(cli, this.shutdown.signal);
  }

  stop(): void {
    this.updates.stop();
    this.shutdown.abort();
  }

  readonly status = async (): Promise<XFetcherStatus> => {
    const { version, signedIn } = await this.read();
    const refusedUpdate = this.updates.refusedUpdate();

    if (version === null) return { state: "unknown", version, refusedUpdate };

    const identity = await identityOf(this.cli.path);
    const barred = identity !== null && this.access.barred(identity);

    return { state: barred ? "not-proven" : signedIn, version, refusedUpdate };
  };

  readonly fetch = async (statusId: string, signal: AbortSignal): Promise<XFetch> => {
    const started = Date.now();
    const prompt = fetchPrompt(statusId);
    const stop = AbortSignal.any([signal, this.shutdown.signal]);

    const outcome = await this.access.forFetch(stop, (run) =>
      this.attempt(prompt, run).catch(internal),
    );

    return logged(outcome ?? OUT_OF_TIME, Date.now() - started);
  };

  private async attempt(prompt: string, signal: AbortSignal): Promise<Outcome> {
    const identity = await identityOf(this.cli.path);

    if (identity === null) return NO_BINARY;

    const barred = await this.access.gate(identity, signal);

    if (barred !== null) return barred;

    if (!sameBinary(identity, await identityOf(this.cli.path))) return SURFACE_UNCONFIRMED;

    return this.fetched(identity, prompt, signal);
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
        this.access.ranWith(identity, {
          kind: "refused",
          binary: identity,
          verdict: check.verdict,
        });

        return SURFACE_REFUSAL;
      case "discard":
      case "reprove":
        this.access.ranWith(identity, UNPROVEN);

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
  const cli = grokCli(binary, authFile);
  const access = new GrokAccess(cli);
  const updates = autoUpdate
    ? await grokUpdates({ binary, authFile, dataDir }, access)
    : NO_UPDATES;

  return new GrokXFetcher(cli, access, updates);
}
