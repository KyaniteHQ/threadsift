import { filled } from "./text.ts";
import { WAITING } from "./text.ts";

const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function isSameDay(left: number, right: number): boolean {
  return new Date(left).toDateString() === new Date(right).toDateString();
}

export function whenOf(retryAt: number, now: number): string {
  const time = TIME.format(retryAt);

  return isSameDay(retryAt, now) ? `at ${time}` : `on ${DAY.format(retryAt)} at ${time}`;
}

export function waitText(retryAt: number, now: number): string {
  return retryAt <= now ? WAITING.due : filled(WAITING.until, { when: whenOf(retryAt, now) });
}
