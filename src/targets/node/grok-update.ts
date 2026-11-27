import { mkdtemp, realpath, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { RefusedUpdate } from "../../core/contract/x-settings-contract.ts";
import { errnoCodeOf, errorClassOf, report, withCleanup } from "../../core/kernel/failure-log.ts";
import { within } from "./cli-process.ts";
import type { GrokAccess } from "./grok-access.ts";
import { inRunFolders } from "./grok-folders.ts";
import { checkForUpdate, grokCli, updateInto } from "./grok-process.ts";
import { type Trial, trialOf } from "./grok-trial.ts";
import {
  ATTEMPT_MS,
  type Fingerprint,
  STAGING_PREFIX,
  type UpdateState,
  candidateIn,
  claimed,
  fingerprintOf,
  swapped,
  readState,
  sweptStaging,
  writable,
  writeState,
} from "./grok-update-files.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const TICK_MS = 60 * 60 * 1000;
const CHECK_MS = 60_000;
const DOWNLOAD_MS = 10 * 60_000;
const STATE_FILE = "grok-update.json";
const LOCK_FILE = "grok-update.lock";

type UpdateOutcome =
  | "current"
  | "not-writable"
  | "no-slot"
  | "check-failed"
  | "already-refused"
  | "download-failed"
  | "inconclusive"
  | "refused"
  | "changed-during-trial"
  | "installed";

export interface UpdateSource {
  readonly binary: string;
  readonly authFile: string;
  readonly dataDir: string;
}

export interface Updates {
  readonly refusedUpdate: () => RefusedUpdate | null;
  readonly stop: () => void;
}

export const NO_UPDATES: Updates = { refusedUpdate: () => null, stop: () => {} };

interface UpdatePlan extends UpdateSource {
  readonly access: Readonly<GrokAccess>;
}

class GrokUpdates implements Updates {
  private readonly plan: UpdatePlan;
  private readonly stateFile: string;
  private readonly shutdown = new AbortController();
  private readonly timers: NodeJS.Timeout[] = [];
  private refused: RefusedUpdate | null = null;
  private attemptedAt: number | null = null;
  private updating = false;

  constructor(plan: Readonly<UpdatePlan>) {
    this.plan = plan;
    this.stateFile = join(plan.dataDir, STATE_FILE);
  }

  readonly refusedUpdate = (): RefusedUpdate | null => this.refused;

  readonly stop = (): void => {
    for (const timer of this.timers) clearTimeout(timer);

    this.shutdown.abort();
  };

  async load(): Promise<void> {
    await this.state();
  }

  start(): void {
    const tick = (): void => {
      void this.tick();
    };

    this.timers.push(setTimeout(tick, 0), setInterval(tick, TICK_MS));
  }

  private async state(): Promise<UpdateState | null> {
    const state = await readState(this.stateFile);

    if (state !== null) this.refused = state.refused;

    return state;
  }

  private due(state: Readonly<UpdateState> | null, now: number): boolean {
    if (this.attemptedAt !== null && now - this.attemptedAt < DAY_MS) return false;

    if (state === null || state.checkedAt > now) return true;

    return now - state.checkedAt >= DAY_MS;
  }

  private async tick(): Promise<void> {
    if (this.updating || !this.plan.access.idle()) return;

    this.updating = true;

    try {
      await this.claimedAttempt(Date.now());
    } catch (cause) {
      report("grok-update-error", { error: errorClassOf(cause), code: errnoCodeOf(cause) });
    } finally {
      this.updating = false;
    }
  }

  private async claimedAttempt(now: number): Promise<void> {
    if (!this.due(await this.state(), now)) return;

    const lock = join(this.plan.dataDir, LOCK_FILE);

    if (!(await claimed(lock, now))) return;

    await withCleanup(
      { event: "grok-update-lock-not-removed", fields: {} },
      async () => {
        const state = await this.state();

        if (!this.due(state, now)) return;

        if (state !== null && state.checkedAt > now)
          report("grok-update-clock", { aheadMs: state.checkedAt - now });

        this.attemptedAt = now;
        await this.save(now);

        const signal = within(this.shutdown.signal, ATTEMPT_MS);
        const { outcome, version } = await this.attempt(now, signal);

        report("grok-update", { outcome, version });
      },
      () => rm(lock, { force: true }),
    );
  }

  private async save(checkedAt: number): Promise<void> {
    await writeState(this.stateFile, { checkedAt, refused: this.refused });
  }

  private async attempt(
    now: number,
    signal: AbortSignal,
  ): Promise<{ outcome: UpdateOutcome; version: string }> {
    const target = await realpath(this.plan.binary);
    const folder = dirname(target);

    if (!(await writable(folder))) return { outcome: "not-writable", version: "none" };

    await sweptStaging(folder, now);

    const checked = await this.plan.access.forUpdate(signal, async () => ({
      answer: await inRunFolders((folders) =>
        checkForUpdate(this.plan.binary, folders, within(signal, CHECK_MS)),
      ),
    }));

    if (checked === null) return { outcome: "no-slot", version: "none" };

    const { answer } = checked;

    if (answer === null) return { outcome: "check-failed", version: "none" };

    const version = answer.latestVersion;

    if (!answer.updateAvailable) {
      this.refused = null;
      await this.save(now);

      return { outcome: "current", version };
    }

    if (this.refused?.version === version) return { outcome: "already-refused", version };

    const staging = await mkdtemp(join(folder, STAGING_PREFIX));

    const outcome = await withCleanup(
      { event: "grok-update-staging-not-removed", fields: {} },
      () => this.tried({ staging, target, version }, now, signal),
      () => rm(staging, { recursive: true, force: true }),
    );

    return { outcome, version };
  }

  private async tried(
    { staging, target, version }: Readonly<{ staging: string; target: string; version: string }>,
    now: number,
    signal: AbortSignal,
  ): Promise<UpdateOutcome> {
    const downloaded = await this.plan.access.forUpdate(signal, () =>
      inRunFolders((folders) =>
        updateInto(
          this.plan.binary,
          folders,
          { version, into: staging },
          within(signal, DOWNLOAD_MS),
        ),
      ),
    );

    if (downloaded === null) return "no-slot";

    const candidate = downloaded ? await candidateIn(staging) : null;
    const proved = candidate === null ? null : await fingerprintOf(candidate);

    if (candidate === null || proved === null) return "download-failed";

    const trial = await this.plan.access.forUpdate(signal, () => this.prove(candidate, signal));

    if (trial === null) return "no-slot";

    const { result } = trial;

    if (result.kind === "inconclusive") return "inconclusive";

    if (result.verdict !== "proven") {
      this.refused = { version, reason: result.verdict };
      await this.save(now);

      return "refused";
    }

    const placed = await this.plan.access.alone(signal, () =>
      this.installed({ candidate, target, proved }, now, signal),
    );

    return placed ?? "no-slot";
  }

  private prove(candidate: string, signal: AbortSignal): Promise<Trial> {
    return trialOf(grokCli(candidate, this.plan.authFile), signal);
  }

  private async installed(
    {
      candidate,
      target,
      proved,
    }: Readonly<{ candidate: string; target: string; proved: Fingerprint }>,
    now: number,
    signal: AbortSignal,
  ): Promise<UpdateOutcome> {
    signal.throwIfAborted();

    const swap = await swapped({ binary: this.plan.binary, candidate, target, proved });

    if (swap.kind === "changed") return "changed-during-trial";

    this.plan.access.installed(swap.binary);
    this.refused = null;
    await this.save(now);

    return "installed";
  }
}

export async function grokUpdates(
  source: Readonly<UpdateSource>,
  access: Readonly<GrokAccess>,
): Promise<Updates> {
  const updates = new GrokUpdates({ ...source, access });

  await updates.load();
  updates.start();

  return updates;
}
