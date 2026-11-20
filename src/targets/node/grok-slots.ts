import { X_RUN_DEADLINE_MS, X_SLOT_WAIT_MS } from "../../core/contract/request-waits.ts";
import { CAPACITY } from "./capacity.ts";
import { Slots, inSlot } from "./cli-slots.ts";

export class GrokSlots {
  private readonly slots = new Slots(CAPACITY.xFetches);

  run<Result>(
    stop: AbortSignal,
    work: (run: AbortSignal) => Promise<Result>,
  ): Promise<Result | null> {
    const queued = AbortSignal.any([stop, AbortSignal.timeout(X_SLOT_WAIT_MS)]);

    return inSlot(this.slots, queued, () =>
      work(AbortSignal.any([stop, AbortSignal.timeout(X_RUN_DEADLINE_MS)])),
    );
  }
}
