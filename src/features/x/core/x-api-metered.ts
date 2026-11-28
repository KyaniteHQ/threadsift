import type { Database } from "../../../core/kernel/database.ts";
import { type Resources, microsOf } from "./x-api-plan.ts";
import { type XApiCall, type XApiSent, xApiGet } from "./x-api-request.ts";
import { type Charge, reserved, settled, utcDayOf } from "./x-api-spend.ts";

export interface Meter {
  readonly db: Database;
  readonly dayLimitMicros: number;
  readonly itemId: number | null;
  readonly price: Price;
}

export type Price =
  | { readonly kind: "resources"; readonly worst: Resources }
  | { readonly kind: "flat"; readonly micros: number };

function worstOf(price: Readonly<Price>): Charge {
  return price.kind === "flat"
    ? { micros: price.micros, posts: 0, users: 0 }
    : { micros: microsOf(price.worst), ...price.worst };
}

const UNCHARGED: Charge = { micros: 0, posts: 0, users: 0 };

function chargeOf(price: Readonly<Price>, { left, counted }: Readonly<XApiSent>): Charge {
  if (!left) return UNCHARGED;

  if (price.kind === "flat" || counted === null) return worstOf(price);

  return { micros: microsOf(counted), ...counted };
}

export async function meteredGet(
  meter: Readonly<Meter>,
  call: Readonly<XApiCall>,
): Promise<XApiSent | null> {
  const worst = worstOf(meter.price);
  const reservation = {
    day: utcDayOf(Date.now()),
    worstMicros: worst.micros,
    itemId: meter.itemId,
  };

  if (!(await reserved(meter.db, { ...reservation, dayLimitMicros: meter.dayLimitMicros }))) {
    return null;
  }

  const sent = await xApiGet(call);

  await settled(meter.db, reservation, chargeOf(meter.price, sent));

  return sent;
}
