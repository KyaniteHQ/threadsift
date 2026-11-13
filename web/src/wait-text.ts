import type { Item } from "../../src/http/schemas.ts";
import { WAITING, filled } from "./text.ts";

type Wait = NonNullable<Item["wait"]>;

const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function isSameDay(left: number, right: number): boolean {
  return new Date(left).toDateString() === new Date(right).toDateString();
}

function whenOf(retryAt: number, now: number): string {
  const time = TIME.format(retryAt);

  return isSameDay(retryAt, now) ? `at ${time}` : `on ${DAY.format(retryAt)} at ${time}`;
}

export function waitText({ reason, retryAt }: Readonly<Wait>, now: number): string {
  const texts = WAITING[reason];

  return retryAt <= now ? texts.due : filled(texts.until, { when: whenOf(retryAt, now) });
}
