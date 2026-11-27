import {
  X_FETCH_DEADLINE_MS,
  X_RUN_DEADLINE_MS,
  X_SLOT_WAIT_MS,
} from "../../core/contract/request-waits.ts";
import { CAPACITY } from "./capacity.ts";
import { within } from "./cli-process.ts";
import { Slots, inSlot } from "./cli-slots.ts";
import { type Refused, SURFACE_REFUSAL, internal } from "./grok-answer.ts";
import type { BinaryIdentity } from "./grok-folders.ts";
import type { GrokCli } from "./grok-process.ts";
import {
  type Proof,
  UNPROVEN,
  afterPreflight,
  afterRun,
  keptBar,
  permission,
} from "./grok-proof.ts";
import { trialOf } from "./grok-trial.ts";

type Release = NonNullable<Awaited<ReturnType<Slots["acquire"]>>>;

export class GrokAccess {
  private readonly cli: GrokCli;
  private readonly slots = new Slots(CAPACITY.xFetches);
  private proof: Proof = UNPROVEN;
  private proving: Promise<Refused | null> | null = null;
  private fetches = 0;

  constructor(cli: GrokCli) {
    this.cli = cli;
  }

  readonly idle = (): boolean => this.fetches === 0 && this.proving === null;

  barred(binary: Readonly<BinaryIdentity>): boolean {
    return permission(this.proof, binary) === "refused";
  }

  forFetch<Result>(
    stop: AbortSignal,
    work: (run: AbortSignal) => Promise<Result>,
  ): Promise<Result | null> {
    return inSlot(this.slots, within(stop, X_SLOT_WAIT_MS), async () => {
      this.fetches += 1;

      try {
        return await work(within(stop, X_RUN_DEADLINE_MS));
      } finally {
        this.fetches -= 1;
      }
    });
  }

  forUpdate<Result>(stop: AbortSignal, work: () => Promise<Result>): Promise<Result | null> {
    return inSlot(this.slots, within(stop, X_SLOT_WAIT_MS), work);
  }

  async alone<Result>(stop: AbortSignal, work: () => Promise<Result>): Promise<Result | null> {
    const queued = within(stop, X_FETCH_DEADLINE_MS);
    const releases = await this.everySlot(queued, []);

    try {
      return releases.length === CAPACITY.xFetches ? await work() : null;
    } finally {
      for (const release of releases) release();
    }
  }

  async gate(binary: Readonly<BinaryIdentity>, signal: AbortSignal): Promise<Refused | null> {
    if (this.proving !== null) {
      await this.proving;

      return this.gate(binary, signal);
    }

    const decision = permission(this.proof, binary);

    switch (decision) {
      case "allowed":
        return null;
      case "refused":
        return SURFACE_REFUSAL;
      case "preflight":
        return (await this.proveOnce(binary, signal)) ?? this.gate(binary, signal);
      default: {
        const exhaustive: never = decision;

        return exhaustive;
      }
    }
  }

  ranWith(binary: Readonly<BinaryIdentity>, next: Readonly<Proof>): void {
    this.proof = afterRun(this.proof, binary, next);
  }

  installed(binary: Readonly<BinaryIdentity> | null): void {
    this.proof = binary === null ? UNPROVEN : { kind: "proven", binary };
  }

  private async everySlot(
    queued: AbortSignal,
    held: readonly Release[],
  ): Promise<readonly Release[]> {
    if (held.length === CAPACITY.xFetches) return held;

    const release = await this.slots.acquire(queued);

    return release === null ? held : this.everySlot(queued, [...held, release]);
  }

  private async proveOnce(
    binary: Readonly<BinaryIdentity>,
    signal: AbortSignal,
  ): Promise<Refused | null> {
    const run = trialOf(this.cli, signal).then(({ result, failure }) => {
      this.proof = keptBar(this.proof, binary, afterPreflight(binary, result));

      return failure;
    }, internal);

    this.proving = run;

    try {
      return await run;
    } finally {
      this.proving = null;
    }
  }
}
