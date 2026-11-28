import type { Database } from "../../../core/kernel/database.ts";
import { bestEffort } from "../../../core/kernel/failure-log.ts";
import type { XApiAnswer } from "./x-api-answer.ts";
import { type Resources, microsOf } from "./x-api-plan.ts";
import { resourcesOf } from "./x-api-posts.ts";
import { type Delivery, type XApiCall, xApiGet } from "./x-api-request.ts";
import { type Charge, type ItemLimit, reserved, settled, utcDayOf } from "./x-api-spend.ts";

export interface Meter {
  readonly db: Database;
  readonly dayLimitMicros: number;
  readonly item: ItemLimit | null;
  readonly price: Price;
}

export type Price =
  | { readonly kind: "resources"; readonly worst: Resources }
  | { readonly kind: "flat"; readonly micros: number };

export interface Metered {
  readonly answer: XApiAnswer;
  readonly charge: Charge;
}

const OK = 200;

const CLIENT_ERRORS = { from: 400, below: 500 };

const UNCHARGED: Charge = { micros: 0, posts: 0, users: 0 };

function worstOf(price: Readonly<Price>): Charge {
  return price.kind === "flat"
    ? { micros: price.micros, posts: 0, users: 0 }
    : { micros: microsOf(price.worst), ...price.worst };
}

function failed(status: number): boolean {
  return status >= CLIENT_ERRORS.from && status < CLIENT_ERRORS.below;
}

export function chargeOf(price: Readonly<Price>, delivery: Readonly<Delivery>): Charge {
  if (delivery.kind === "not-sent") return UNCHARGED;

  if (delivery.kind === "unknown") return worstOf(price);

  if (failed(delivery.status)) return UNCHARGED;

  if (delivery.status !== OK || price.kind === "flat") return worstOf(price);

  const counted = resourcesOf(delivery.text);

  return counted === null ? worstOf(price) : { micros: microsOf(counted), ...counted };
}

export async function meteredGet(
  meter: Readonly<Meter>,
  call: Readonly<XApiCall>,
): Promise<Metered | null> {
  const reservation = {
    day: utcDayOf(Date.now()),
    worstMicros: worstOf(meter.price).micros,
    item: meter.item,
  };

  if (!(await reserved(meter.db, reservation, meter.dayLimitMicros))) return null;

  const { answer, delivery } = await xApiGet(call);
  const charge = chargeOf(meter.price, delivery);

  await bestEffort({ event: "x-api-charge-not-settled", fields: { day: reservation.day } }, () =>
    settled(meter.db, reservation, charge),
  );

  return { answer, charge };
}
